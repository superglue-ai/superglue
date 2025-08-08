import { Integration } from "@superglue/client";
import { GraphQLResolveInfo } from "graphql";
import { executeTool, ToolCall } from "../../tools/tools.js";
import { InstructionGenerationContext } from "../../utils/instructions.js";
import { generateSchema } from "../../utils/schema.js";
import { telemetryClient } from "../../utils/telemetry.js";
import { getSchemaFromData } from "../../utils/tools.js";
import { Context, Metadata } from '../types.js';

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
      arguments: {}  // No arguments needed
    };

    // Pass integrations through context
    const toolContext: InstructionGenerationContext = {
      orgId: context.orgId,
      runId: crypto.randomUUID(),
      integrations: integrations
    };

    const callResult = await executeTool(toolCall, toolContext);

    if (callResult.error) {
      throw new Error(callResult.error);
    }

    if (callResult.success && Array.isArray(callResult.data)) {
      return callResult.data;
    }

    throw new Error("Failed to generate instructions");
  } catch (error) {
    telemetryClient?.captureException(error, context.orgId, {
      integrations: integrations
    });
    throw error;
  }
};