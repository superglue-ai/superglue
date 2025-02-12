import { Context } from "@superglue/shared";
import { GraphQLResolveInfo } from "graphql";
import { generateSchema } from "../../utils/schema.js";

export const generateSchemaResolver = async (
    _: any,
    { instruction, responseData }: { instruction: string; responseData?: string; },
    context: Context,
    info: GraphQLResolveInfo
  ) => {
    if(!instruction) {
      throw new Error("Instruction is required");
    }
    const schema = await generateSchema(instruction, responseData);
    
    return JSON.stringify(schema);
};
