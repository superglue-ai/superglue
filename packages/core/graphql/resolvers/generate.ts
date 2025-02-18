import { Context } from "@superglue/shared";
import { GraphQLResolveInfo } from "graphql";
import toJsonSchema from "to-json-schema";
import { generateSchema } from "../../utils/schema.js";
import { telemetryClient } from "../../utils/telemetry.js";

export const generateSchemaResolver = async (
    _: any,
    { instruction, responseData }: { instruction: string; responseData?: string; },
    context: Context,
    info: GraphQLResolveInfo
  ) => {
    if(!instruction) {
      throw new Error("Instruction is required");
    }
    if(responseData) {
      try {
        responseData = JSON.stringify(toJsonSchema(JSON.parse(responseData), {required: true,arrays: {mode: 'first'}}));
      } catch (error) {
        telemetryClient?.captureException(error, context.orgId, {
          instruction: instruction,
          responseData: String(responseData)
        });
        responseData = String(responseData).slice(0, 1000);
      }
    }
    const schema = await generateSchema(instruction, responseData);
    
    return schema;
};
