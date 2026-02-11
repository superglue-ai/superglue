import { RequestSource, ServiceMetadata, UserRole } from "@superglue/shared";
import { DataStore } from "../datastore/types.js";
import type { WorkerPools } from "../worker/types.js";

// Re-export for convenience
export type { ServiceMetadata, WorkerPools };

// GraphQL request context - provides request-scoped resources to resolvers
export type GraphQLRequestContext = {
  datastore: DataStore;
  workerPools: WorkerPools;
  traceId?: string;
  orgId: string;
  userId?: string;
  orgName?: string;
  orgRole?: UserRole;
  requestSource?: RequestSource;

  toMetadata: () => ServiceMetadata;
};
