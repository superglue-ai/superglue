import { Metadata } from "@playwright/test";
import { Validator } from "jsonschema";
import { LanguageModel, LLMMessage } from "../llm/language-model.js";
import { GENERATE_SCHEMA_PROMPT } from "../llm/prompts.js";
import { logMessage } from "./logs.js";

export async function generateSchema(instruction: string, responseData: string, metadata: Metadata): Promise<string> {
  const messages: LLMMessage[] = [
    {
      role: "system",
      content: GENERATE_SCHEMA_PROMPT
    },
    {
      role: "user",
      content: `Instruction: ${instruction}${responseData ? `\n\nResponse Data: ${responseData}` : ""}`
    }
  ];
  const MAX_RETRIES = 3;
  let retryCount = 0;

  while (retryCount <= MAX_RETRIES) {
    try {
      logMessage('info', `Generating schema${retryCount ? `: (retry ${retryCount})` : ""}`, metadata);
      const schema = await attemptSchemaGeneration(messages, retryCount);
      return schema;
    } catch (error) {
      retryCount++;
      if (retryCount > MAX_RETRIES) {
        logMessage('error', `Schema generation failed after ${MAX_RETRIES} retries. Last error: ${error.message}`, metadata);
        throw error;
      }
      logMessage('warn', `Schema generation failed. Retrying...`, metadata);
      messages.push({
        role: "user",
        content: `The previous attempt failed with error: ${error.message}. Please try again.`
      });
    }
  }
  throw new Error("Unexpected error in schema generation");
}

async function attemptSchemaGeneration(
  messages: LLMMessage[],
  retry: number
): Promise<string> {
  let temperature = Math.min(0.3 * retry, 1.0);
  const { response: generatedSchema } = await LanguageModel.generateObject(messages, null, temperature);
  if (!generatedSchema || Object.keys(generatedSchema).length === 0) {
    throw new Error("No schema generated");
  }
  const validator = new Validator();
  validator.validate({}, generatedSchema);
  return generatedSchema;
}
