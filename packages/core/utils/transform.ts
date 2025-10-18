import { RequestOptions, TransformConfig, TransformInputRequest } from "@superglue/client";
import type { DataStore, Metadata } from "@superglue/shared";
import prettier from "prettier";
import { server_defaults } from "../default.js";
import { LanguageModel, LLMMessage } from "../llm/llm.js";
import { PROMPT_JS_TRANSFORM } from "../llm/prompts.js";
import { logMessage } from "./logs.js";
import { getSchemaFromData, isSelfHealingEnabled, sample, transformAndValidateSchema } from "./tools.js";

export async function executeTransform(args: {
  datastore: DataStore,
  fromCache: boolean,
  input: TransformInputRequest,
  data: any,
  options?: RequestOptions,
  metadata: Metadata
}): Promise<{ data?: any; config?: TransformConfig }> {
  const { datastore, fromCache, input, data, metadata, options } = args;
  let currentConfig = input.endpoint;
  if (fromCache && datastore) {
    const cached = await datastore.getTransformConfig(input.id || input.endpoint.id, metadata.orgId);
    if (cached) {
      currentConfig = { ...cached, ...input.endpoint };
    }
  }
  if (!currentConfig) {
    throw new Error("No transform config found");
  }

  try {
    if (!currentConfig?.responseMapping) {
      throw new Error("No response mapping found");
    }

    const transformResult = await transformAndValidateSchema(
      data,
      currentConfig.responseMapping,
      currentConfig.responseSchema
    );

    if (!transformResult.success) {
      throw new Error(transformResult.error);
    }

    return {
      data: transformResult.data,
      config: currentConfig
    };
  } catch (error) {
    const rawErrorString = error?.message || JSON.stringify(error || {});
    const transformError = rawErrorString.slice(0, 200);
    let instruction = currentConfig.instruction;
    if (transformError && currentConfig.responseMapping) {
      instruction = `${instruction}\n\nThe previous error was: ${transformError} for the following mapping: ${currentConfig.responseMapping}`;
    }

    // if the transform is not self healing and there is an existing mapping, throw an error
    // if there is no mapping that means that the config is being generated for the first time and should generate regardless
    if (currentConfig.responseMapping && !isSelfHealingEnabled(options, "transform")) {
      throw new Error(transformError);
    }

    const result = await generateTransformCode(
      currentConfig.responseSchema,
      data,
      instruction,
      metadata
    );

    if (!result || !result?.mappingCode) {
      throw new Error("Failed to generate transformation mapping");
    }

    currentConfig = {
      id: crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...currentConfig,
      responseMapping: result.mappingCode
    };

    return {
      data: data,
      config: currentConfig
    };
  }
}

export async function generateTransformCode(
  schema: any,
  payload: any,
  instruction: string,
  metadata: Metadata,
  retry = 0,
  messages?: LLMMessage[]
): Promise<{ mappingCode: string; data?: any } | null> {
  try {
    logMessage('info', "Generating mapping" + (retry > 0 ? ` (retry ${retry})` : ''), metadata);

    if (!messages || messages?.length === 0) {
      const userPrompt =
        `Given a source data and structure, create a JavaScript function (as a string) that transforms the input data according to the instruction.
${instruction ? `<user_instruction>${instruction}</user_instruction>` : ''}
${schema ? `<target_schema>${JSON.stringify(schema, null, 2)}</target_schema>` : ''}
<source_data_structure>${getSchemaFromData(payload)}</source_data_structure>
<source_data_sample>${JSON.stringify(sample(payload, 20), null, 2).slice(0, 50000)}</source_data_sample>
`;
      messages = [
        { role: "system", content: PROMPT_JS_TRANSFORM },
        { role: "user", content: userPrompt }
      ];
    }
    const temperature = Math.min(retry * 0.1, 1);

    // Schema for the expected LLM response
    const mappingSchema = {
      type: "object",
      properties: {
        mappingCode: { type: "string", description: "JS function as string" },
      },
      required: ["mappingCode"],
      additionalProperties: false
    };

    const { response, messages: updatedMessages } = await LanguageModel.generateObject(messages, mappingSchema, temperature);
    messages = updatedMessages;
    try {
      // Autoformat the generated code
      response.mappingCode = await prettier.format(response.mappingCode, { parser: "babel" });
      const validation = await transformAndValidateSchema(payload, response.mappingCode, schema);
      if (!validation.success) {
        throw new Error(`Validation failed: ${validation.error}`);
      }
      response.data = validation.data;
    } catch (err) {
      throw new Error(`Generated code is invalid JS: ${err.message}`);
    }

    // Optionally, evaluate mapping quality as before
    const evaluation = await evaluateMapping(response.data, response.mappingCode, payload, schema, instruction, metadata);
    if (!evaluation.success) {
      throw new Error(`Mapping evaluation failed: ${evaluation.reason}`);
    }
    logMessage('info', `Mapping generated successfully`, metadata);
    return response;
  } catch (error) {
    if (retry < server_defaults.MAX_TRANSFORMATION_RETRIES) {
      const errorMessage = String(error.message);
      logMessage('warn', "Error generating JS mapping: " + errorMessage.slice(0, 1000), metadata);
      messages?.push({ role: "user", content: errorMessage });
      return generateTransformCode(schema, payload, instruction, metadata, retry + 1, messages);
    }
  }
  return null;
}

export async function evaluateMapping(
  transformedData: any,
  mappingCode: string,
  sourcePayload: any,
  targetSchema: any,
  instruction: string,
  metadata: Metadata
): Promise<{ success: boolean; reason: string }> {
  try {
    logMessage('info', "Evaluating mapping", metadata);

    const systemPrompt = `You are a data transformation evaluator assessing if the mapping code correctly implements the transformation logic.

${instruction ? `The user's instruction: "${instruction}"` : 'No specific instruction provided; focus on mapping source to target schema.'}

CRITICAL: You are viewing ONLY 5 random samples from potentially thousands of records. The mapping code operates on the FULL dataset.

ONLY fail the evaluation if you find:
1. Syntax errors or code that would crash
2. Clear logic errors (e.g., using wrong operators, accessing non-existent properties that would cause runtime errors)
3. Output that violates the target schema structure
4. Direct contradiction of explicit instructions (not assumptions based on samples)

DO NOT fail for:
- Field choices that differ from what you see in samples - the full data may contain values you don't see
- Missing values in output samples - they may come from records not in your sample
- Filter conditions that seem incorrect based on samples - trust the instruction over sample inference
- Empty arrays or filtered results - the sample may not contain matching records
- Field mappings you cannot verify from the limited sample
- Using a field mentioned in the instruction even if it's not visible in your 5-record sample

When the instruction specifies exact field names or conditions, trust the instruction even if you don't see those values in the sample. The instruction was written with knowledge of the full dataset.

Focus on data accuracy and completeness of the mapping logic, and adherence to the instruction if provided.
Be particularly lenient with arrays and filtered data since the samples may not contain all relevant records.
Return { success: true, reason: "Mapping follows instruction and appears logically sound" } unless you find definitive errors in the code logic itself.
`;
    const userPrompt = `
<Target Schema>
${JSON.stringify(targetSchema, null, 2)}
</Target Schema>

<Source Payload Sample> // Random sample of 5 items per array, actual datasets may be much larger
${JSON.stringify(sample(sourcePayload, 5), null, 2).slice(0, 50000)}
</Source Payload Sample>

<Transformed Data Sample> // Random sample of 5 items per array, actual datasets may be much larger
${JSON.stringify(sample(transformedData, 5), null, 2).slice(0, 50000)}
</Transformed Data Sample>

<Mapping Code> // The actual transformation logic applied to the full dataset
${mappingCode}
</Mapping Code>

Please evaluate the transformation based on the criteria in the system prompt, considering that samples may not show all data values present in the full dataset.`;

    const messages: LLMMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ];

    const llmResponseSchema = {
      type: "object",
      properties: {
        success: { type: "boolean", description: "True if the mapping is good, false otherwise." },
        reason: { type: "string", description: "Reasoning for the success status. If success is false, explain what is wrong with the mapping. If success is true, confirm correct transformation." }
      },
      required: ["success", "reason"],
      additionalProperties: false
    };
    const { response } = await LanguageModel.generateObject(messages, llmResponseSchema, 0);
    return response;

  } catch (error) {
    const errorMessage = String(error instanceof Error ? error.message : error);
    logMessage('error', `Error evaluating mapping: ${errorMessage.slice(0, 250)}`, metadata);
    return { success: false, reason: `Error during evaluation: ${errorMessage}` };
  }
}