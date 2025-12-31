import { CallEndpointArgs, CallEndpointResult, Integration } from "@superglue/shared";
import { flattenAndNamespaceCredentials } from "@superglue/shared/utils";
import { GraphQLResolveInfo } from "graphql";
import { IntegrationManager } from "../../integrations/integration-manager.js";
import { replaceVariables } from "../../utils/helpers.js";
import { logMessage } from "../../utils/logs.js";
import { GraphQLRequestContext } from "../types.js";

export const callEndpointResolver = async (
  _: unknown,
  args: CallEndpointArgs,
  context: GraphQLRequestContext,
  info: GraphQLResolveInfo,
): Promise<CallEndpointResult> => {
  const startTime = Date.now();
  const metadata = context.toMetadata();

  const { integrationId, method, url, headers = {}, body, timeout = 30000 } = args;
  const validMethods = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"];

  if (!method || !url || !validMethods.includes(method.toUpperCase())) {
    return {
      success: false,
      error: `method and url are required and method must be one of: ${validMethods.join(", ")}`,
      duration: Date.now() - startTime,
    };
  }

  let integration: Integration | null = null;
  let integrationFetchFailed = false;

  if (integrationId) {
    try {
      const integrationManager = new IntegrationManager(integrationId, context.datastore, metadata);
      await integrationManager.refreshTokenIfNeeded();
      integration = await integrationManager.getIntegration();
      logMessage("debug", `Loaded integration ${integrationId}`, metadata);
    } catch (error) {
      integrationFetchFailed = true;
      logMessage(
        "warn",
        `Integration ${integrationId} not found or failed to load: ${error}. Proceeding without credentials.`,
        metadata,
      );
    }
  }

  const credentialVariables: Record<string, any> = integration
    ? flattenAndNamespaceCredentials([integration])
    : {};

  let finalUrl: string;
  let finalHeaders: Record<string, string>;
  let finalBody: string | undefined;

  try {
    finalUrl = await replaceVariables(url, credentialVariables);
    finalHeaders = JSON.parse(await replaceVariables(JSON.stringify(headers), credentialVariables));
    finalBody = body ? await replaceVariables(body, credentialVariables) : undefined;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    let contextMessage = "";

    if (integrationFetchFailed) {
      contextMessage = ` The integration '${integrationId}' could not be found or loaded.`;
    } else if (integrationId && integration) {
      const availableKeys = Object.keys(credentialVariables || {});
      contextMessage = ` Available credentials in integration '${integrationId}': ${availableKeys.length > 0 ? availableKeys.join(", ") : "(none)"}`;
    } else if (!integrationId) {
      contextMessage = ` No integrationId was provided. To use credential placeholders, specify an integrationId.`;
    }

    return {
      success: false,
      error: `Variable substitution failed: ${errorMsg}${contextMessage}`,
      duration: Date.now() - startTime,
    };
  }

  logMessage("debug", `Executing ${method} ${finalUrl}`, metadata);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const fetchOptions: RequestInit = {
      method: method.toUpperCase(),
      headers: finalHeaders,
      signal: controller.signal,
    };

    if (finalBody && !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) {
      fetchOptions.body = finalBody;
    }

    const response = await fetch(finalUrl, fetchOptions);
    clearTimeout(timeoutId);

    const duration = Date.now() - startTime;
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    const responseText = await response.text();
    let responseBody: any;
    const contentType = response.headers.get("content-type");

    if (contentType?.includes("application/json")) {
      try {
        responseBody = JSON.parse(responseText);
      } catch {
        responseBody = responseText;
      }
    } else {
      responseBody = responseText;
    }

    return {
      success: true,
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: responseBody,
      duration,
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;

    if (error.name === "AbortError") {
      return {
        success: false,
        error: `Request timed out after ${timeout}ms`,
        duration,
      };
    }

    return {
      success: false,
      error: error.message || String(error),
      duration,
    };
  }
};
