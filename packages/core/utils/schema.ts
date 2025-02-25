import { Validator } from "jsonschema";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { GENERATE_SCHEMA_PROMPT } from "./prompts.js";
import { z } from "zod";

export async function generateSchema(instruction: string, responseData: string, retry = 0, lastError?: string) : Promise<string> {
  console.log("Generating schema");
  
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_API_BASE_URL
  });

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL,
    temperature: 0,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "api_definition",
        schema: { type: "object", properties: { jsonSchema: { type: "object" } } },
      }
    },
    messages: [
      {
        role: "system",
        content: GENERATE_SCHEMA_PROMPT
      },
      {
        role: "user",
        content: `Instruction: ${instruction}\n\nResponse Data: ${responseData}${lastError ? `\n\nLast Error: ${lastError}` : ''}`
      }
    ]
  });
    
  const generatedSchema = JSON.parse(completion.choices[0].message.content).jsonSchema;
  // validate json schema
  const validator = new Validator();
  // unless a SchemaError is thrown, we are good
  const validation = validator.validate({}, generatedSchema);
  return generatedSchema;
}
