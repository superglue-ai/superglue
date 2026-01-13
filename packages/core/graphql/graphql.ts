import { GraphQLUpload } from "graphql-upload-ts";
import fs from "node:fs";
import { callEndpointResolver } from "./resolvers/call-endpoint.js";
import { deleteApiResolver } from "./resolvers/delete.js";
import { extractResolver } from "./resolvers/extract.js";
import {
  generateInstructionsResolver,
  generateStepConfigResolver,
  generateTransformResolver,
} from "./resolvers/generate.js";
import { getApiResolver, getRunResolver } from "./resolvers/get.js";
import {
  cacheOauthClientCredentialsResolver,
  deleteIntegrationResolver,
  findRelevantIntegrationsResolver,
  getIntegrationResolver,
  getOAuthClientCredentialsResolver,
  listIntegrationsResolver,
  searchIntegrationDocumentationResolver,
  upsertIntegrationResolver,
} from "./resolvers/integrations.js";
import { listApisResolver, listRunsResolver } from "./resolvers/list.js";
import { logsResolver } from "./resolvers/logs.js";
import { renameWorkflowResolver } from "./resolvers/rename-workflow.js";
import { JSONResolver, JSONSchemaResolver, JSONataResolver } from "./resolvers/scalars.js";
import { getTenantInfoResolver, setTenantInfoResolver } from "./resolvers/tenant.js";
import { upsertApiResolver } from "./resolvers/upsert.js";
import {
  abortToolExecutionResolver,
  buildWorkflowResolver,
  deleteWorkflowResolver,
  executeWorkflowResolver,
  findRelevantToolsResolver,
  fixWorkflowResolver,
  getWorkflowResolver,
  listWorkflowsResolver,
  upsertWorkflowResolver,
} from "./resolvers/workflow.js";

export const typeDefs = fs.readFileSync("../../api.graphql", "utf8");

export const resolvers = {
  Query: {
    listRuns: listRunsResolver,
    getRun: getRunResolver,
    listApis: listApisResolver,
    getApi: getApiResolver,
    getTenantInfo: getTenantInfoResolver,
    getWorkflow: getWorkflowResolver,
    listWorkflows: listWorkflowsResolver,
    generateInstructions: generateInstructionsResolver,
    getIntegration: getIntegrationResolver,
    listIntegrations: listIntegrationsResolver,
    searchIntegrationDocumentation: searchIntegrationDocumentationResolver,
    findRelevantIntegrations: findRelevantIntegrationsResolver,
    findRelevantTools: findRelevantToolsResolver,
  },
  Mutation: {
    setTenantInfo: setTenantInfoResolver,
    extract: extractResolver,
    executeWorkflow: executeWorkflowResolver,
    abortToolExecution: abortToolExecutionResolver,
    buildWorkflow: buildWorkflowResolver,
    upsertWorkflow: upsertWorkflowResolver,
    deleteWorkflow: deleteWorkflowResolver,
    renameWorkflow: renameWorkflowResolver,
    upsertApi: upsertApiResolver,
    deleteApi: deleteApiResolver,
    upsertIntegration: upsertIntegrationResolver,
    cacheOauthClientCredentials: cacheOauthClientCredentialsResolver,
    getOAuthClientCredentials: getOAuthClientCredentialsResolver,
    deleteIntegration: deleteIntegrationResolver,
    generateStepConfig: generateStepConfigResolver,
    generateTransform: generateTransformResolver,
    callEndpoint: callEndpointResolver,
    fixWorkflow: fixWorkflowResolver,
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
        case "call":
          return "ApiConfig";
        case "extract":
          return "ExtractConfig";
        default:
          return "Workflow";
      }
    },
  },
};
