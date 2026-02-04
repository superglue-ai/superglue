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
import { renameWorkflowResolver } from "./resolvers/rename-workflow.js";
import { JSONResolver, JSONSchemaResolver, JSONataResolver } from "./resolvers/scalars.js";
import { getTenantInfoResolver, setTenantInfoResolver } from "./resolvers/tenant.js";
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
} from "./resolvers/tools.js";

export const typeDefs = fs.readFileSync("../../api.graphql", "utf8");

// Helper functions to derive urlHost/urlPath from url for backward compatibility
function deriveUrlHost(parent: any): string {
  if (parent.urlHost !== undefined) return parent.urlHost;
  if (!parent.url) return "";
  const protocolEnd = parent.url.indexOf("://");
  const firstSlashAfterProtocol = parent.url.indexOf("/", protocolEnd + 3);
  return firstSlashAfterProtocol === -1
    ? parent.url
    : parent.url.substring(0, firstSlashAfterProtocol);
}

function deriveUrlPath(parent: any): string {
  if (parent.urlPath !== undefined) return parent.urlPath;
  if (!parent.url) return "";
  const protocolEnd = parent.url.indexOf("://");
  const firstSlashAfterProtocol = parent.url.indexOf("/", protocolEnd + 3);
  return firstSlashAfterProtocol === -1 ? "" : parent.url.substring(firstSlashAfterProtocol);
}

export const resolvers = {
  Query: {
    getTenantInfo: getTenantInfoResolver,
    getWorkflow: getWorkflowResolver,
    listWorkflows: listWorkflowsResolver,
    generateInstructions: generateInstructionsResolver,
    getSystem: getSystemResolver,
    listSystems: listSystemsResolver,
    searchSystemDocumentation: searchSystemDocumentationResolver,
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
    upsertSystem: upsertSystemResolver,
    cacheOauthClientCredentials: cacheOauthClientCredentialsResolver,
    getOAuthClientCredentials: getOAuthClientCredentialsResolver,
    deleteSystem: deleteSystemResolver,
    fixWorkflow: fixWorkflowResolver,
  },
  Subscription: {
    logs: logsResolver,
  },
  JSON: JSONResolver,
  JSONSchema: JSONSchemaResolver,
  JSONata: JSONataResolver,
  Upload: GraphQLUpload,
  System: {
    // Backward compatibility: derive urlHost/urlPath from url when queried
    urlHost: deriveUrlHost,
    urlPath: deriveUrlPath,
  },
  ApiConfig: {
    // Backward compatibility: derive urlHost/urlPath from url when queried
    urlHost: deriveUrlHost,
    urlPath: deriveUrlPath,
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
