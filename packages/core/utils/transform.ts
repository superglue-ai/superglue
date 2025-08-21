import { Integration, RequestOptions, TransformConfig, TransformInputRequest } from "@superglue/client";
import type { DataStore, Metadata } from "@superglue/shared";
import pkg from 'lodash';
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import prettier from "prettier";
import { server_defaults } from "../default.js";
import { toJsonSchema } from "../external/json-schema.js";
import { LanguageModel } from "../llm/llm.js";
import { PROMPT_JS_TRANSFORM } from "../llm/prompts.js";
import { logMessage } from "./logs.js";
import { getSchemaFromData, isSelfHealingEnabled, transformAndValidateSchema } from "./tools.js";
const { get } = pkg;

export async function executeTransform(args: {
  datastore: DataStore,
  fromCache: boolean,
  input: TransformInputRequest,
  data: any,
  options?: RequestOptions,
  metadata: Metadata,
  integrations?: Integration[]
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

    const result = await generateTransformCode({
      schema: currentConfig.responseSchema,
      payload: data,
      instruction: instruction,
      metadata: metadata,
      integrations: args.integrations
    });

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

export async function generateTransformCode({
  schema,
  payload,
  instruction,
  metadata,
  retry = 0,
  messages = [],
  integrations = []
}: {
  schema: any,
  payload: any,
  instruction: string,
  metadata: Metadata,
  retry?: number,
  messages?: ChatCompletionMessageParam[]
  integrations?: Integration[]
}
): Promise<{ mappingCode: string; data?: any } | null> {
  try {
    logMessage('info', "Generating mapping" + (retry > 0 ? ` (retry ${retry})` : ''), metadata);

    if (!messages || messages?.length === 0) {
      const userPrompt =
        `Given a source data and structure, create a JavaScript function (as a string) that transforms the input data according to the instruction.
${instruction ? `<user_instruction>${instruction}</user_instruction>` : ''}
${schema && Object.keys(schema).length > 0 ? `<target_schema>${JSON.stringify(schema, null, 2)}</target_schema>` : ''}
<source_data_structure>${getSchemaFromData(payload)}</source_data_structure>
Use get_source_field tool to get the source data.
${integrations && integrations.length > 0 ? `<source_integrations>
${integrations.map(i => `${i.id}: ${i.specificInstructions || ''}`).join('\n\n  \n')}
</source_integrations>` : ''}
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

    const { response, messages: updatedMessages } = await LanguageModel.generateObject(messages, mappingSchema, temperature, [
      {
        name: "get_source_field",
        description: "Query 10000 characters of a specific field from the source data with lodash.get().",
        arguments: {
          type: "object",
          properties: {
            path: { type: "string", description: "The path to the field to get. leave empty to get the entire source data." },
            offset: { type: "number", description: "The offset in the string response" }
          }
        },
        execute: async (args: { path?: string, offset?: number }) => {
          console.log("get_source_field", args);
          const offset = args.offset || 0;
          const value = JSON.stringify(args.path ? get(payload, args.path) : payload, null, 2)?.slice(offset, offset + 10000);
          return { success: value !== undefined, value: value };
        }
      }
    ]);
    messages = updatedMessages;
    try {
      if(!response.mappingCode) {
        throw new Error("No mapping code generated: " + JSON.stringify(response));
      }
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
    const evaluation = await evaluateMapping({
      transformedData: response.data,
      mappingCode: response.mappingCode,
      sourcePayload: payload,
      targetSchema: schema,
      instruction: instruction,
      metadata: metadata
    });
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
      return generateTransformCode({
        schema: schema,
        payload: payload,
        instruction: instruction,
        metadata: metadata,
        retry: retry + 1,
        messages: messages,
        integrations: integrations
      });
    }
  }
  return null;
}

export async function evaluateMapping({
  transformedData,
  mappingCode,
  sourcePayload,
  targetSchema,
  instruction,
  metadata
}:{
  transformedData: any,
  mappingCode: string,
  sourcePayload: any,
  targetSchema: any,
  instruction: string,
  metadata: Metadata
}
): Promise<{ success: boolean; reason: string }> {
  try {
    logMessage('info', "Evaluating mapping", metadata);
    const systemPrompt = `You are a data transformation evaluator. Your task is to assess if the 'transformed_data' is a correct and high-quality transformation of the 'source_payload' that strictly follows the 'instruction' and the 'targetSchema'.
Return { success: true, reason: "" } if the transformed data accurately reflects the source data, matches the target schema, and (if provided) adheres to the user's instruction.
Return { success: false, reason: "Describe the issue with the transformation, specifically referencing how it deviates from the schema or instruction." } if the transformation code is incorrect or incomplete.

Apply the following strategy to evaluate the transformation:
- Is the transformed data correct and complete given the available source data? If the output of a given field is not available or always the default, this could be a failure.
- Is the transformation code correct and complete?
- Do all field references in the transformation code match the field names in the source data, if available?
- Does the transformation and the output data adhere to the user's instruction and the target schema?
- If data is not required in the target schema and is missing from the transformed data it is not an issue. Be particularly lenient with arrays since the data might be sampled out.
- Keep in mind that you only get a sample of the source data and the transformed data. Samples mean that each array is randomized and reduced to the first 5 entries. If in doubt, check the mapping code. If that is correct, all is good.
- Pay particular attention to output fields that have default values but should not - this is almost always a wrong field path.

`;
    const userPrompt = `
<User Instruction>
${instruction ? `${instruction}` : 'No specific transformation instruction was provided by the user; focus on accurately mapping source data to the target schema.'}
</User Instruction>

<Target Schema>
${JSON.stringify(targetSchema, null, 2)}
</Target Schema>

<Source Payload Schema> // first 50000 characters of the source payload schema
${JSON.stringify(toJsonSchema(sourcePayload)).slice(0, 50000)}
</Source Payload Schema>

<Transformed Data Schema> // first 50000 characters of the transformed data schema
${JSON.stringify(toJsonSchema(transformedData)).slice(0, 50000)}
</Transformed Data Schema>

<Transformation Code> // this is the code that was used to transform the data
${mappingCode}
</Transformation Code>

Critical:Please evaluate the transformation based on the criteria mentioned in the system prompt. `;

    const messages: ChatCompletionMessageParam[] = [
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

    // Using temperature 0 for more deterministic evaluation
    const { response } = await LanguageModel.generateObject(messages, llmResponseSchema, 0);

      return response;

  } catch (error) {
    const errorMessage = String(error instanceof Error ? error.message : error);
    logMessage('error', `Error evaluating mapping: ${errorMessage.slice(0, 250)}`, metadata);
    return { success: false, reason: `Error during evaluation: ${errorMessage}` };
  }
}