import { System } from "@superglue/shared";
import { GraphQLResolveInfo } from "graphql";
import { executeLLMTool, LLMToolCall } from "../../llm/llm-tool-utils.js";
import { InstructionGenerationContext } from "../../llm/llm-tools.js";
import { telemetryClient } from "../../utils/telemetry.js";
import { GraphQLRequestContext } from "../types.js";

export const generateInstructionsResolver = async (
  _: any,
  { systems }: { systems: System[] },
  context: GraphQLRequestContext,
  info: GraphQLResolveInfo,
) => {
  try {
    const toolCall: LLMToolCall = {
      id: crypto.randomUUID(),
      name: "generate_instructions",
      arguments: {},
    };

    const toolContext: InstructionGenerationContext = {
      ...context.toMetadata(),
      systems: systems,
    };

    const callResult = await executeLLMTool(toolCall, toolContext);

    if (callResult.error) {
      throw new Error(callResult.error);
    }

    if (callResult.success && Array.isArray(callResult.data)) {
      return callResult.data;
    }

    throw new Error("Failed to generate instructions");
  } catch (error) {
    telemetryClient?.captureException(error, context.orgId, {
      traceId: context.traceId,
      systems: systems,
    });
    throw error;
  }
};
