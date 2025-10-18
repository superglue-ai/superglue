import { type ApiConfig, type RequestOptions } from "@superglue/client";
import OpenAI from "openai";
import { server_defaults } from "../default.js";
import { AbortError, ApiCallError } from "../execute/api/api.js";
import { callEndpointLegacyImplementation, generateApiConfig } from "../execute/api/api.legacy.js";
import { Metadata } from "../graphql/types.js";
import { IntegrationManager } from "../integrations/integration-manager.js";
import { LanguageModel } from "../llm/llm.js";
import { logMessage } from "../utils/logs.js";
import { telemetryClient } from "../utils/telemetry.js";
import { isSelfHealingEnabled, maskCredentials, sample } from "../utils/tools.js";

export async function evaluateStepResponse({
  data,
  endpoint,
  documentation
}: {
  data: any,
  endpoint: ApiConfig,
  documentation?: string
}): Promise<{ success: boolean, refactorNeeded: boolean, shortReason: string; }> {
  let content = JSON.stringify(data);
  if (content.length > LanguageModel.contextLength / 2) {
    content = JSON.stringify(sample(data, 10));
  }
  if (content.length > LanguageModel.contextLength / 2) {
    content = content.slice(0, LanguageModel.contextLength / 2) + "\n\n...truncated...";
  }

  // Include documentation context if available
  const documentationContext = documentation
    ? `\n\nAPI DOCUMENTATION CONTEXT:\n=========================\n${documentation}\n=========================\n`
    : '';

  const request = [
    {
      role: "system",
      content: `You are an API response validator. 
Validate the following api response and return { success: true, shortReason: "", refactorNeeded: false } if the response aligns with the instruction. 
If the response does not align with the instruction, return { success: false, shortReason: "reason why it does not align", refactorNeeded: false }.

IMPORTANT CONSIDERATIONS:
- For operations that create, update, delete, or send data (non-retrieval operations), minimal or empty responses with 2xx status codes often indicate success
- An empty response body (like {}, [], null, or "") can be a valid successful response, especially for:
  * Resource creation/updates where the API acknowledges receipt without returning data
  * Deletion operations that return no content
  * Asynchronous operations that accept requests for processing
  * Messaging/notification APIs that confirm delivery without response data
  * In cases where the instruction is a retrieval operation, an empty response is often a failure.
  * In cases where the instruction is unclear, it is always better to return non empty responses than empty responses.
- Always consider the instruction type and consult the API documentation when provided to understand expected response patterns
- Focus on whether the response contains the REQUESTED DATA, not the exact structure. If the instruction asks for "products" and the response contains product data (regardless of field names), it's successful.
- DO NOT fail validation just because field names differ from what's mentioned in the instruction.

Do not make the mistake of thinking that the { success: true, shortReason: "", refactorNeeded: false } is the expected API response format. It is YOUR expected response format.
Keep in mind that the response can come in any shape or form, just validate that the response aligns with the instruction.
If the instruction contains a filter and the response contains data not matching the filter, return { success: true, refactorNeeded: true, shortReason: "Only results matching the filter XXX" }.
If the reponse is valid but hard to comprehend, return { success: true, refactorNeeded: true, shortReason: "The response is valid but hard to comprehend. Please refactor the instruction to make it easier to understand." }.
E.g. if the response is something like { "data": { "products": [{"id": 1, "name": "Product 1"}, {"id": 2, "name": "Product 2"}] } }, no refactoring is needed.
If the response reads something like [ "12/2", "22.2", "frejgeiorjgrdelo"] that makes it very hard to parse the required information of the instruction, refactoring is needed. 
If the response needs to be grouped or sorted or aggregated, this will be handled in a later step, so the appropriate response for you is to return { success: true, refactorNeeded: false, shortReason: "" }.
Refactoring is NOT needed if the response contains extra fields or needs to be grouped.

<documentation>
${documentationContext}
</documentation>`
    },
    {
      role: "user", content: `<request>${JSON.stringify(endpoint)}</request>
<api_response>${content}</api_response>`
    }
  ] as OpenAI.Chat.ChatCompletionMessageParam[];

  const response = await LanguageModel.generateObject(
    request,
    { type: "object", properties: { success: { type: "boolean" }, refactorNeeded: { type: "boolean" }, shortReason: { type: "string" } } },
    0
  );
  return response.response;
}

export async function executeStep({
  endpoint,
  payload,
  credentials,
  integrationManager,
  options,
  metadata,
}: {
  endpoint: ApiConfig,
  payload: any,
  credentials: Record<string, string>,
  integrationManager: IntegrationManager,
  options: RequestOptions,
  metadata: Metadata,
}): Promise<{
  data: any;
  endpoint: ApiConfig;
  statusCode: number;
  headers: Record<string, any>;
}> {
  let response: any = null;
  let retryCount = 0;
  let lastError: string | null = null;
  let messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  let success = false;
  let isSelfHealing = isSelfHealingEnabled(options, "api");

  // If self healing is enabled, use the retries from the options or the default max of 10 if not specified, otherwise use 1 (no self-healing case)
  const effectiveMaxRetries = isSelfHealing ? (options?.retries !== undefined ? options.retries : server_defaults.MAX_CALL_RETRIES) : 1;

  do {
    try {
      if (retryCount > 0 && isSelfHealing) {
        logMessage('info', `Generating API config for ${endpoint?.urlHost}${retryCount > 0 ? ` (${retryCount})` : ""}`, metadata);
        const computedApiCallConfig = await generateApiConfig({
          apiConfig: endpoint,
          payload,
          credentials,
          retryCount,
          messages,
          integrationManager
        });
        if (!computedApiCallConfig) {
          throw new Error("No API config generated");
        }
        endpoint = computedApiCallConfig.config;
        messages = computedApiCallConfig.messages;
      }

      response = await callEndpointLegacyImplementation({ endpoint, payload, credentials, options });

      if (!response.data) {
        throw new Error("No data returned from API. This could be due to a configuration error.");
      }

      // Check if response is valid
      if (retryCount > 0 && isSelfHealing || options.testMode) {
        const result = await evaluateStepResponse({
          data: response.data,
          endpoint: endpoint,
          documentation: await integrationManager?.searchDocumentation(endpoint.instruction)
        });
        success = result.success;
        if (!result.success) throw new Error(result.shortReason + " " + JSON.stringify(response.data).slice(0, 1000));
      }
      else {
        success = true;
      }
      break;
    }
    catch (error) {
      const rawErrorString = error?.message || JSON.stringify(error || {});
      lastError = maskCredentials(rawErrorString, credentials).slice(0, 2000);
      if (retryCount > 0) {
        messages.push({ role: "user", content: `There was an error with the configuration, please fix: ${rawErrorString.slice(0, 4000)}` });
        logMessage('warn', `API call failed. ${lastError}`, metadata);
      }

      // hack to get the status code from the error
      if (!response?.statusCode) {
        response = response || {};
        response.statusCode = error instanceof ApiCallError ? error.statusCode : 500;
      }
      if (error instanceof AbortError) {
        break;
      }
    }
    retryCount++;
  } while (retryCount < effectiveMaxRetries);
  if (!success) {
    telemetryClient?.captureException(new Error(`API call failed. Last error: ${lastError}`), metadata.orgId, {
      endpoint: endpoint,
      retryCount: retryCount,
    });
    throw new ApiCallError(`API call failed. Last error: ${lastError}`, response?.statusCode);
  }

  return { data: response?.data, endpoint, statusCode: response?.statusCode, headers: response?.headers };
}
