import { GraphQLUpload } from 'graphql-upload-ts';
import fs from "node:fs";
import { callResolver } from "./resolvers/call.js";
import { deleteApiResolver } from "./resolvers/delete.js";
import { extractResolver } from "./resolvers/extract.js";
import { generateInstructionsResolver, generateSchemaResolver } from "./resolvers/generate.js";
import { getApiResolver, getRunResolver } from "./resolvers/get.js";
import { cacheOauthClientCredentialsResolver, deleteIntegrationResolver, findRelevantIntegrationsResolver, getIntegrationResolver, getOAuthClientCredentialsResolver, listIntegrationsResolver, searchIntegrationDocumentationResolver, upsertIntegrationResolver } from "./resolvers/integrations.js";
import { listApisResolver, listRunsResolver } from "./resolvers/list.js";
import { logsResolver } from "./resolvers/logs.js";
import { JSONResolver, JSONSchemaResolver, JSONataResolver } from "./resolvers/scalars.js";
import { getTenantInfoResolver, setTenantInfoResolver } from "./resolvers/tenant.js";
import { updateApiConfigIdResolver } from "./resolvers/update-id.js";
import { upsertApiResolver } from "./resolvers/upsert.js";
import { deleteWorkflowScheduleResolver, listWorkflowSchedulesResolver, upsertWorkflowScheduleResolver } from "./resolvers/workflow-scheduler.js";
import {
  buildWorkflowResolver,
  deleteWorkflowResolver,
  executeWorkflowResolver,
  findRelevantToolsResolver,
  getWorkflowResolver,
  listWorkflowsResolver,
  upsertWorkflowResolver
} from "./resolvers/workflow.js";

export const resolvers = {
  Query: {
    listRuns: listRunsResolver,
    getRun: getRunResolver,
    listApis: listApisResolver,
    getApi: getApiResolver,
    generateSchema: generateSchemaResolver,
    getTenantInfo: getTenantInfoResolver,
    getWorkflow: getWorkflowResolver,
    listWorkflows: listWorkflowsResolver,
    generateInstructions: generateInstructionsResolver,
    getIntegration: getIntegrationResolver,
    listIntegrations: listIntegrationsResolver,
    searchIntegrationDocumentation: searchIntegrationDocumentationResolver,
    findRelevantIntegrations: findRelevantIntegrationsResolver,
    findRelevantTools: findRelevantToolsResolver,
    listWorkflowSchedules: listWorkflowSchedulesResolver,
  },
  Mutation: {
    setTenantInfo: setTenantInfoResolver,
    call: callResolver,
    extract: extractResolver,
    executeWorkflow: executeWorkflowResolver,
    buildWorkflow: buildWorkflowResolver,
    upsertWorkflow: upsertWorkflowResolver,
    deleteWorkflow: deleteWorkflowResolver,
    upsertApi: upsertApiResolver,
    deleteApi: deleteApiResolver,
    updateApiConfigId: updateApiConfigIdResolver,
    upsertIntegration: upsertIntegrationResolver,
    cacheOauthClientCredentials: cacheOauthClientCredentialsResolver,
    getOAuthClientCredentials: getOAuthClientCredentialsResolver,
    deleteIntegration: deleteIntegrationResolver,
    upsertWorkflowSchedule: upsertWorkflowScheduleResolver,
    deleteWorkflowSchedule: deleteWorkflowScheduleResolver,
  },
  Subscription: {
    logs: logsResolver,
  },
  JSON: JSONResolver,
  JSONSchema: JSONSchemaResolver,
  JSONata: JSONataResolver,
  Upload: GraphQLUpload,
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
export const typeDefs = fs.readFileSync("../../api.graphql", "utf8");
