import { Integration } from "@superglue/client";
import { Context, Metadata } from "@superglue/shared";
import { GraphQLResolveInfo } from "graphql";
import { executeTool, BaseToolContext, ToolCall } from "../../tools/tools.js";
import { generateSchema } from "../../utils/schema.js";
import { telemetryClient } from "../../utils/telemetry.js";
import { getSchemaFromData } from "../../utils/tools.js";

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

    const toolContext: BaseToolContext = {
      orgId: context.orgId,
      runId: crypto.randomUUID()
    };

    const callResult = await executeTool(toolCall, toolContext);

    if (callResult.error) {
      throw new Error(callResult.error);
    }

    if (callResult.result?.fullResult?.success && Array.isArray(callResult.result.fullResult?.instructions)) {
      return callResult.result.fullResult.instructions;
    }

    throw new Error("Failed to generate instructions");
  } catch (error) {
    telemetryClient?.captureException(error, context.orgId, {
      integrations: integrations
    });
    throw error;
  }
};