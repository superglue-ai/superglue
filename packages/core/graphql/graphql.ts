import { GraphQLUpload } from "graphql-upload-ts";
import fs from "node:fs";
import { extractResolver } from "./resolvers/extract.js";
import { generateInstructionsResolver } from "./resolvers/generate.js";
import {
  cacheOauthClientCredentialsResolver,
  deleteSystemResolver,
  getSystemResolver,
  getOAuthClientCredentialsResolver,
  listSystemsResolver,
  searchSystemDocumentationResolver,
  upsertSystemResolver,
} from "./resolvers/systems.js";
import { logsResolver } from "./resolvers/logs.js";
import { JSONResolver, JSONSchemaResolver, JSONataResolver } from "./resolvers/scalars.js";
import { getTenantInfoResolver, setTenantInfoResolver } from "./resolvers/tenant.js";
import {
  executeWorkflowResolver,
  getWorkflowResolver,
  listWorkflowsResolver,
} from "./resolvers/tools.js";

export const typeDefs = fs.readFileSync("../../api.graphql", "utf8");

export const resolvers = {
  Query: {
    getTenantInfo: getTenantInfoResolver,
    getWorkflow: getWorkflowResolver,
    listWorkflows: listWorkflowsResolver,
    generateInstructions: generateInstructionsResolver,
    getSystem: getSystemResolver,
    listSystems: listSystemsResolver,
    searchSystemDocumentation: searchSystemDocumentationResolver,
  },
  Mutation: {
    setTenantInfo: setTenantInfoResolver,
    extract: extractResolver,
    executeWorkflow: executeWorkflowResolver,
    upsertSystem: upsertSystemResolver,
    cacheOauthClientCredentials: cacheOauthClientCredentialsResolver,
    getOAuthClientCredentials: getOAuthClientCredentialsResolver,
    deleteSystem: deleteSystemResolver,
  },
  Subscription: {
    logs: logsResolver,
  },
  JSON: JSONResolver,
  JSONSchema: JSONSchemaResolver,
  JSONata: JSONataResolver,
  Upload: GraphQLUpload,
  ExtractConfig: {
    // Ensure ExtractConfig.id is always non-null at runtime, even though schema allows nullable
    // for union type compatibility with ApiConfig
    id: (parent: any) => {
      // If id is null/undefined, generate one (shouldn't happen, but safety check)
      if (!parent.id) {
        throw new Error("Workflow.id is missing");
      }
      return parent.id;
    },
  },
  ExecutionStep: {
    // Backward compatibility: return config as apiConfig for old clients
    apiConfig: (parent: any) => parent.config || parent.apiConfig,
    // New field: return config directly
    config: (parent: any) => parent.config || parent.apiConfig,
  },
  StepConfig: {
    __resolveType() {
      // Currently only request-based steps are supported
      return "ApiConfig";
    },
  },
  Workflow: {
    // Ensure Workflow.id is always non-null at runtime, even though schema allows nullable
    // for union type compatibility with ApiConfig
    id: (parent: any) => {
      // If id is null/undefined, generate one (shouldn't happen, but safety check)
      return parent.id || crypto.randomUUID();
    },
  },
  ConfigType: {
    __resolveType(obj: any, context: any, info: any) {
      // Get the parent field name from the path
      // we need to fix this at some point
      const parentField = info.path.prev.key;

      switch (parentField) {
        case "extract":
          return "ExtractConfig";
        default:
          return "Workflow";
      }
    },
  },
};
