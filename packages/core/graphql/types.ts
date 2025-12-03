import { DataStore } from "../datastore/types.js";
import { UserRole, ServiceMetadata } from "@superglue/shared";

// Re-export for convenience
export type { ServiceMetadata };

// GraphQL request context - provides request-scoped resources to resolvers
export type GraphQLRequestContext = {
  datastore: DataStore;
  traceId?: string;
  orgId: string;
  userId?: string;
  orgName?: string;
  orgRole?: UserRole;
  
  toMetadata: () => ServiceMetadata;
};