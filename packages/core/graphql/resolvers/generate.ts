import { Context, Metadata } from "@superglue/shared";
import { GraphQLResolveInfo } from "graphql";
import { generateInstructionsDefinition, generateInstructionsImplementation } from "../../utils/instructions.js";
import { executeTool } from "../../tools/tools.js";
import { ToolCall } from "../../llm/llm.js";
import { generateSchema } from "../../utils/schema.js";
import { telemetryClient } from "../../utils/telemetry.js";
import { getSchemaFromData } from "../../utils/tools.js";
import { Integration } from "@superglue/client";

export const generateSchemaResolver = async (
  _: any,
  { instruction, responseData }: { instruction: string; responseData?: string; },
  context: Context,
  info: GraphQLResolveInfo
) => {
  const metadata: Metadata = {
    runId: crypto.randomUUID(),
    orgId: context.orgId
  };
  if (!instruction) {
    throw new Error("Instruction is required");
  }
  if (responseData) {
    try {
      responseData = getSchemaFromData(JSON.parse(responseData));
    } catch (error) {
      telemetryClient?.captureException(error, context.orgId, {
        instruction: instruction,
        responseData: String(responseData)
      });
      responseData = String(responseData).slice(0, 1000);
    }
  }
  const schema = await generateSchema(instruction, responseData, metadata);

  return schema;
};

export const generateInstructionsResolver = async (
  _: any,
  { integrations }: { integrations: Integration[] },
  context: Context,
  info: GraphQLResolveInfo
) => {
  try {
    
    const toolCall: ToolCall = {
      id: crypto.randomUUID(),
      name: "generate_instructions",
      arguments: { integrations }
    };
    
    const result = await executeTool(toolCall, { orgId: context.orgId });
    
    if (result.error) {
      throw new Error(result.error);
    }
    
    if (result.result?.success && Array.isArray(result.result.instructions)) {
      return result.result.instructions;
    }
    
    throw new Error("Failed to generate instructions");
  } catch (error) {
    telemetryClient?.captureException(error, context.orgId, {
      integrations: integrations
    });
    throw error;
  }
};