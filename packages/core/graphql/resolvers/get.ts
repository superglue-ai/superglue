import { GraphQLResolveInfo } from "graphql";
import { telemetryClient } from "../../utils/telemetry.js";
import { GraphQLRequestContext } from "../types.js";

export const getRunResolver = async (
  _: any,
  { id }: { id: string },
  context: GraphQLRequestContext,
  info: GraphQLResolveInfo,
) => {
  if (!id) {
    throw new Error("id is required");
  }

  const run = await context.datastore.getRun({ id, orgId: context.orgId });
  if (!run) {
    telemetryClient?.captureException(new Error(`run with id ${id} not found`), context.orgId, {
      id: id,
    });
    throw new Error(`run with id ${id} not found`);
  }
  return run;
};
