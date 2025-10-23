import { GraphQLUpload } from 'graphql-upload-ts';
import fs from "node:fs";
import { callResolver } from "./resolvers/call.js";
import { deleteApiResolver, deleteExtractResolver, deleteTransformResolver } from "./resolvers/delete.js";
import { extractResolver } from "./resolvers/extract.js";
import { generateInstructionsResolver, generateSchemaResolver } from "./resolvers/generate.js";
import { getApiResolver, getExtractResolver, getRunResolver, getTransformResolver } from "./resolvers/get.js";
import { cacheOauthClientCredentialsResolver, deleteIntegrationResolver, findRelevantIntegrationsResolver, getIntegrationResolver, getOAuthClientCredentialsResolver, listIntegrationsResolver, upsertIntegrationResolver } from "./resolvers/integrations.js";
import { listApisResolver, listExtractsResolver, listRunsResolver, listTransformsResolver } from "./resolvers/list.js";
import { logsResolver } from "./resolvers/logs.js";
import { JSONResolver, JSONSchemaResolver, JSONataResolver } from "./resolvers/scalars.js";
import { getTenantInfoResolver, setTenantInfoResolver } from "./resolvers/tenant.js";
import { transformResolver } from "./resolvers/transform.js";
import { updateApiConfigIdResolver } from "./resolvers/update-id.js";
import { upsertApiResolver, upsertExtractResolver, upsertTransformResolver } from "./resolvers/upsert.js";
import { deleteWorkflowScheduleResolver, listWorkflowSchedulesResolver, upsertWorkflowScheduleResolver } from "./resolvers/workflow-scheduler.js";
import {
  buildWorkflowResolver,
  deleteWorkflowResolver,
  executeWorkflowResolver,
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
    listTransforms: listTransformsResolver,
    getTransform: getTransformResolver,
    listExtracts: listExtractsResolver,
    getExtract: getExtractResolver,
    generateSchema: generateSchemaResolver,
    getTenantInfo: getTenantInfoResolver,
    getWorkflow: getWorkflowResolver,
    listWorkflows: listWorkflowsResolver,
    generateInstructions: generateInstructionsResolver,
    getIntegration: getIntegrationResolver,
    listIntegrations: listIntegrationsResolver,
    findRelevantIntegrations: findRelevantIntegrationsResolver,
    listWorkflowSchedules: listWorkflowSchedulesResolver,
  },
  Mutation: {
    setTenantInfo: setTenantInfoResolver,
    call: callResolver,
    extract: extractResolver,
    transform: transformResolver,
    executeWorkflow: executeWorkflowResolver,
    buildWorkflow: buildWorkflowResolver,
    upsertWorkflow: upsertWorkflowResolver,
    deleteWorkflow: deleteWorkflowResolver,
    upsertApi: upsertApiResolver,
    deleteApi: deleteApiResolver,
    updateApiConfigId: updateApiConfigIdResolver,
    upsertExtraction: upsertExtractResolver,
    deleteExtraction: deleteExtractResolver,
    upsertTransformation: upsertTransformResolver,
    deleteTransformation: deleteTransformResolver,
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
        case "transform":
          return "TransformConfig";
        default:
          return "Workflow";
      }
    },
  },
};
export const typeDefs = fs.readFileSync("../../api.graphql", "utf8");
