import { DataStore } from "../datastore/types.js";

// GraphQL request context - provides request-scoped resources to resolvers
export type GraphQLRequestContext = {
  datastore: DataStore;
  orgId: string;
};

// Execution metadata - tracks a specific operation for logging and tracing
export type Metadata = {
  runId?: string;
  orgId?: string;
};