import { openai } from "@ai-sdk/openai";
import { jsonSchema, streamText } from "ai";

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages, system, tools } = await req.json();

  const result = streamText({
    model: openai("gpt-4o"),
    messages,
    system,
    tools: Object.fromEntries(
      Object.entries<{ parameters: unknown }>(tools).map(([name, tool]) => [
        name,
        {
          parameters: jsonSchema(tool.parameters!),
        },
      ])
    ),
  });

  return result.toDataStreamResponse();
}