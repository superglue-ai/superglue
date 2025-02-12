import { Validator } from "jsonschema";
import OpenAI from "openai";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { GENERATE_SCHEMA_PROMPT } from "./prompts.js";

export async function generateSchema(instruction: string, responseData: string) : Promise<string> {

  const schema = zodToJsonSchema(z.object({
    jsonSchema: z.any()
  }));
  // call openai to create json schema based on instructino and response data
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY

  });
  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL,
    temperature: 0,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "jsonSchema",
        schema: schema,
      }
    },
    messages: [
      {
        role: "system",
        content: GENERATE_SCHEMA_PROMPT
      },
      {
        role: "user",
        content: `Instruction: ${instruction}\n\nResponse Data: ${responseData}`
      }
    ]
  });

  
  const generatedSchema = JSON.parse(completion.choices[0].message.content).properties.jsonSchema;
  console.log(generatedSchema);
  // validate json schema
  const validator = new Validator();
  // unless a SchemaError is thrown, we are good
  const validation = validator.validate({}, generatedSchema);
  if (!validation.valid || validation.errors.length > 0) {
  }

  return generatedSchema;
}
