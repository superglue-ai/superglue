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

export const telemetryMiddleware = (req, res, next) => {
  if(!telemetryClient) {
    return next();
  }

  if(req?.body?.query && !(req.body.query.includes("IntrospectionQuery") || req.body.query.includes("__schema"))) {
    // we track the query, but NOT the variables or the response
    // the query just contains the superglue endpoint that you call, e.g. "listCalls", 
    // but not which actual endpoint you call or what payload / auth you use

    telemetryClient.capture({
        distinctId: req.orgId || sessionId,
        event: 'query',
        properties: {
          query: req.body.query
        }
      });
    }
  next();
};

export const handleQueryError = (errors: any[], query: string) => {
  // in case of an error, we track the query and the error
  // we do not track the variables or the response

  telemetryClient?.capture({
    distinctId: sessionId,
    event: 'query_error',
    properties: {
      query,
      errors: errors.map(e => ({
        message: e.message,
        path: e.path
      }))
    }
  });
};

