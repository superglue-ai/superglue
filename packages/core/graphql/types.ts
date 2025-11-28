import { DataStore } from "../datastore/types.js";
import { UserRole } from "@superglue/shared";

// GraphQL request context - provides request-scoped resources to resolvers
export type GraphQLRequestContext = {
  datastore: DataStore;
  traceId?: string;
  orgId: string;
  userId?: string;
  orgName?: string;
  orgRole?: UserRole;
};

// Execution metadata - tracks a specific operation for logging and tracing
export type Metadata = {
  traceId?: string;
  orgId?: string;
};