import { Validator } from "jsonschema";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { GENERATE_SCHEMA_PROMPT } from "./prompts.js";

export async function generateSchema(instruction: string, responseData: string) : Promise<string> {
  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: GENERATE_SCHEMA_PROMPT
    },
    {
      role: "user",
      content: `Instruction: ${instruction}\n\nResponse Data: ${responseData}`
    }
  ];
  const MAX_RETRIES = 3;
  let retryCount = 0;

  while (retryCount <= MAX_RETRIES) {
    try {
      const schema = await attemptSchemaGeneration(messages, retryCount);
      console.log("Schema generated");
      return schema;
    } catch (error) {
      retryCount++;
      if (retryCount > MAX_RETRIES) {
        console.error("Schema generation failed after 3 retries");
        throw error;
      }
      console.log(`Schema generation failed (retry ${retryCount}/${MAX_RETRIES}): ${error.message}`);
      messages.push({
        role: "user",
        content: `The previous attempt failed with error: ${error.message}. Please try again.`
      });
    }
  }
  // Should never be reached (try/catch)
  throw new Error("Unexpected error in schema generation");
}

async function attemptSchemaGeneration(
  messages: ChatCompletionMessageParam[],
  retry: number
): Promise<string> {
  console.log(`Generating schema${retry ? `: (retry ${retry})` : ""}`);
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_API_BASE_URL
  });
  
  const modelName = process.env.SCHEMA_GENERATION_MODEL || process.env.OPENAI_MODEL;
  
  let temperature = Math.min(0.3 * retry, 1.0);
  let useTemperature = false;
  
  if (modelName.startsWith('gpt-4')) {
    temperature = Math.min(0.3 * retry, 1.0);
    useTemperature = true;
  }
  const completionRequest: any = {
    model: modelName,
    ...(useTemperature ? { temperature: temperature } : {}),
    response_format: { "type": "json_object" },
    messages: messages
  };
  
  const completion = await openai.chat.completions.create(completionRequest);
  let generatedSchema = JSON.parse(completion.choices[0].message.content);
  if(generatedSchema?.jsonSchema) {
    generatedSchema = generatedSchema.jsonSchema;
  }
  if(!generatedSchema || Object.keys(generatedSchema).length === 0) {
    throw new Error("No schema generated");
  }
  const validator = new Validator();
  validator.validate({}, generatedSchema);

  return generatedSchema;
}
