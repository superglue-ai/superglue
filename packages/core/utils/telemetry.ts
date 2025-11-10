import { PostHog } from "posthog-node";
import { server_defaults } from "../default.js";
import { logMessage } from "./logs.js";

// we use a privacy-preserving session id to track queries
export const sessionId = crypto.randomUUID();

export const isDebug = process.env.DEBUG === "true";
export const isSelfHosted = process.env.RUNS_ON_SUPERGLUE_CLOUD !== "true";
export const isTelemetryDisabled = process.env.DISABLE_TELEMETRY === "true";

export const telemetryClient =
  !isTelemetryDisabled && !isDebug
    ? new PostHog(server_defaults.posthog.apiKey, {
        host: server_defaults.posthog.host,
        enableExceptionAutocapture: true,
      })
    : null;

if (telemetryClient) {
  logMessage(
    "info",
    "superglue uses telemetry to understand how many users are using the platform. See self-hosting guide for more info.",
  );
}

// Precompile the regex for better performance
const OPERATION_REGEX = /(?:query|mutation|subscription)\s+(\w+)/;

export const extractOperationName = (query: string): string => {
  if (!query) return "unknown_query";

  const match = OPERATION_REGEX.exec(query);
  return match?.[1] || "unknown_query";
};

export const telemetryMiddleware = (req: any, res: any, next: any) => {
  if (
    !req?.body?.query ||
    req.body.query.includes("IntrospectionQuery") ||
    req.body.query.includes("__schema")
  ) {
    return next();
  }
  const operation = extractOperationName(req.body.query);

  logMessage("debug", `Executing ${operation}`, { orgId: req.orgId });

  telemetryClient?.capture({
    distinctId: req.orgId || sessionId,
    event: operation,
    properties: {
      query: req.body.query,
      orgId: req.orgId,
    },
  });
  next();
};

const createCallProperties = (
  query: string,
  responseBody: any,
  isSelfHosted: boolean,
  operation: string,
) => {
  const properties: Record<string, any> = {};
  properties.isSelfHosted = isSelfHosted;
  properties.operation = operation;
  properties.query = query;

  switch (operation) {
    case "call":
      const call = responseBody?.singleResult?.data?.call;
      if (!call) break;
      properties.endpointHost = call?.config?.urlHost;
      properties.endpointPath = call?.config?.urlPath;
      properties.apiConfigId = call?.config?.id;
      properties.callMethod = call?.config?.method;
      properties.documentationUrl = call?.config?.documentationUrl;
      properties.authType = call?.config?.authentication;
      properties.responseTimeMs =
        call?.completedAt?.getTime() - call?.startedAt?.getTime();
      break;
    default:
      break;
  }

  return properties;
};

export const handleQueryError = (
  errors: any[],
  query: string,
  orgId: string,
  requestContext: any,
) => {
  // in case of an error, we track the query and the error
  // we do not track the variables or the response
  // all errors are masked
  const operation = extractOperationName(query);
  const properties = createCallProperties(
    query,
    requestContext.response?.body,
    isSelfHosted,
    operation,
  );
  properties.success = false;

  logMessage(
    "warn",
    `${operation} failed.\n${errors.map((e) => `\n- ${e.message || e}`).join("\n")}`,
    { orgId: orgId },
  );

  telemetryClient?.capture({
    distinctId: orgId || sessionId,
    event: operation + "_error",
    properties: {
      ...properties,
      orgId: orgId,
      errors: errors.map((e) => ({
        message: e.message,
        path: e.path,
      })),
      success: false,
    },
    groups: {
      orgId: orgId,
    },
  });
};

const handleQuerySuccess = (
  query: string,
  orgId: string,
  requestContext: any,
) => {
  if (
    !query ||
    query.includes("IntrospectionQuery") ||
    query.includes("__schema")
  ) {
    return;
  }
  const distinctId = isSelfHosted
    ? `sh-inst-${requestContext.contextValue.datastore.storage?.tenant?.email}`
    : orgId;
  const operation = extractOperationName(query);
  const properties = createCallProperties(
    query,
    requestContext.response?.body,
    isSelfHosted,
    operation,
  );
  properties.success = true;

  logMessage("debug", `${operation} successful`, { orgId: orgId });

  telemetryClient?.capture({
    distinctId: distinctId,
    event: operation,
    properties: properties,
    groups: {
      orgId: orgId,
    },
  });
};

export const createTelemetryPlugin = () => {
  return {
    requestDidStart: async () => ({
      willSendResponse: async (requestContext: any) => {
        const errors =
          requestContext.errors ||
          requestContext?.response?.body?.singleResult?.errors ||
          Object.values(
            requestContext?.response?.body?.singleResult?.data || {},
          )
            .map((d: any) => d.error)
            .filter(Boolean);

        const orgId = requestContext.contextValue.orgId;
        if (errors && errors.length > 0) {
          handleQueryError(
            errors,
            requestContext.request.query,
            orgId,
            requestContext,
          );
        } else {
          handleQuerySuccess(
            requestContext.request.query,
            orgId,
            requestContext,
          );
        }
      },
    }),
  };
};
