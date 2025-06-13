import { Context, Metadata } from "@superglue/shared";
import { GraphQLResolveInfo } from "graphql";
import { generateInstructions } from "../../utils/instructions.js";
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
    return generateInstructions(integrations, { orgId: context.orgId });
  } catch (error) {
    telemetryClient?.captureException(error, context.orgId, {
      integrations: integrations
    });
    throw error;
  }
};