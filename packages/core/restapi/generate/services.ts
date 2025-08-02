import { generateSchema } from "../../utils/schema.js";
import { getSchemaFromData } from "../../utils/tools.js";
import { telemetryClient } from "../../utils/telemetry.js";
import { executeTool, ToolCall } from "../../tools/tools.js";
import { InstructionGenerationContext } from "../../utils/instructions.js";
import crypto from "crypto";

export const generateSchemaService = async (
  instruction: string,
  responseData: string | undefined,
  req: any
) => {
  const metadata = {
    runId: crypto.randomUUID(),
    orgId: req.orgId
  };

  let parsedResponseData = undefined;
  if (responseData) {
    try {
      parsedResponseData = getSchemaFromData(JSON.parse(responseData));
    } catch (error) {
      telemetryClient?.captureException(error, req.orgId, {
        instruction,
        responseData: String(responseData)
      });
      parsedResponseData = String(responseData).slice(0, 1000);
    }
  }

  return await generateSchema(instruction, parsedResponseData, metadata);
};

export const generateInstructionsService = async (
  integrations: any[],
  req: any
) => {
  const toolCall: ToolCall = {
    id: crypto.randomUUID(),
    name: "generate_instructions",
    arguments: {}
  };

  const toolContext: InstructionGenerationContext = {
    orgId: req.orgId,
    runId: crypto.randomUUID(),
    integrations
  };

  const result = await executeTool(toolCall, toolContext);

  if (result.error) throw new Error(result.error);

  if (
    result.result?.fullResult?.success &&
    Array.isArray(result.result.fullResult?.instructions)
  ) {
    return result.result.fullResult.instructions;
  }

  throw new Error("Failed to generate instructions");
};
