import { PostHog } from 'posthog-node';
import { config } from '../default.js';

// PostHog Telemetry

// we use a privacy-preserving session id to track queries
export const sessionId = crypto.randomUUID();

export const isDebug = process.env.DEBUG === "true";
export const isTelemetryDisabled = process.env.DISABLE_TELEMETRY === "true";

export const telemetryClient = !isTelemetryDisabled && !isDebug ? 
  new PostHog(
    config.posthog.apiKey,
    { host: config.posthog.host }
  ) : null;

if(telemetryClient) {
  console.log("superglue uses telemetry to understand how many users are using the platform. See self-hosting guide for more info.");
}

// Precompile the regex for better performance
const OPERATION_REGEX = /(?:query|mutation)\s+\w+\s*[({][\s\S]*?{([\s\S]*?){/;

export const extractOperationName = (query: string): string => {
  // Early return for invalid input
  if (!query) return 'unknown_query';

  const match = OPERATION_REGEX.exec(query);
  if (!match?.[1]) return 'unknown_query';

  // Split only the relevant captured group and take first word
  const firstWord = match[1].trim().split(/[\s({]/)[0];
  return firstWord || 'unknown_query';
};

export const telemetryMiddleware = (req, res, next) => {
  if(!telemetryClient) {
    return next();
  }

  if(req?.body?.query && !(req.body.query.includes("IntrospectionQuery") || req.body.query.includes("__schema"))) {
    const operation = extractOperationName(req.body.query);

    telemetryClient.capture({
        distinctId: req.orgId || sessionId,
        event: operation,
        properties: {
          query: req.body.query,
          orgId: req.orgId,
        }
      });
    }
  next();
};

export const handleQueryError = (errors: any[], query: string, orgId: string) => {
  // in case of an error, we track the query and the error
  // we do not track the variables or the response
  // all errors are masked
  const operation = extractOperationName(query);
  telemetryClient?.capture({
    distinctId: orgId || sessionId,
    event: operation + '_error',
    properties: {
      query,
      orgId: orgId,
      errors: errors.map(e => ({
        message: e.message,
        path: e.path
      }))
    }
  });
};

