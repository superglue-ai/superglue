import { Validator } from "jsonschema";
import { GENERATE_SCHEMA_PROMPT } from "./prompts.js";
import { CoreMessage } from "ai";
import LLMClient from "./llm.js";
import ModelProvider from "./model-provider.js";
export async function generateSchema(instruction: string, responseData: string) : Promise<string> {
  const messages: Array<CoreMessage> = [
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
      console.log(`Schema generated`);
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
  messages: Array<CoreMessage>,
  retry: number
): Promise<string> {
  console.log(`Generating schema: ${retry ? `(retry ${retry})` : ""}`);
  const temperature = Math.min(0.3 * retry, 1.0);
  
  let generatedSchema = await LLMClient.getInstance().getText({
    model: ModelProvider.getSchemaModel(),
    temperature,
    messages
  });

  generatedSchema = cleanJsonResponse(generatedSchema);
  generatedSchema = JSON.parse(generatedSchema);
  
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

function cleanJsonResponse(response: string | null | undefined): string {
  if (!response) {
    return '';
  }
  const cleanedResponse = response.replace(/```json\s*([\s\S]*?)\s*```/, '$1').trim();
  return cleanedResponse;
}