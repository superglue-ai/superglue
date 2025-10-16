import { type ApiConfig, FileType, PaginationType, type RequestOptions } from "@superglue/client";
import type { AxiosRequestConfig, AxiosResponse } from "axios";
import OpenAI from "openai";
import { server_defaults } from "../default.js";
import { Metadata } from "../graphql/types.js";
import { IntegrationManager } from "../integrations/integration-manager.js";
import { LanguageModel } from "../llm/llm.js";
import { SELF_HEALING_API_AGENT_PROMPT } from "../llm/prompts.js";
import { searchDocumentationToolDefinition, submitToolDefinition } from "../workflow/workflow-tools.js";
import { parseFile } from "./file.js";
import { callFTP } from "./ftp.js";
import { logMessage } from "./logs.js";
import { callPostgres } from "./postgres.js";
import { telemetryClient } from "./telemetry.js";
import { callAxios, composeUrl, evaluateStopCondition, generateId, isSelfHealingEnabled, maskCredentials, replaceVariables, sample } from "./tools.js";

export class ApiCallError extends Error {
  statusCode?: number;

  constructor(message: string, statusCode?: number,) {
    super(message);
    this.name = 'ApiCallError';
    this.statusCode = statusCode;
  }
}
export class AbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AbortError';
  }
}
type StatusHandlerResult = { shouldFail: boolean; message?: string };

function detectHtmlErrorResponse(data: any): { isHtml: boolean; preview?: string } {
  const MAX_HTML_CHECK_BYTES = 1024; // Only check first 1KB for efficiency
  let dataPrefix = '';

  if (data instanceof Buffer) {
    // Only convert first 1KB to string for HTML detection
    const bytesToRead = Math.min(data.length, MAX_HTML_CHECK_BYTES);
    dataPrefix = data.subarray(0, bytesToRead).toString('utf-8');
  } else if (typeof data === 'string') {
    dataPrefix = data.slice(0, MAX_HTML_CHECK_BYTES);
  } else {
    return { isHtml: false };
  }

  const trimmedLower = dataPrefix.slice(0, 100).trim().toLowerCase();
  const isHtml = trimmedLower.startsWith('<!doctype html') || trimmedLower.startsWith('<html');

  return {
    isHtml,
    preview: dataPrefix
  };
}

export function checkResponseForErrors(
  data: any,
  status: number,
  ctx: { axiosConfig: AxiosRequestConfig; credentials: Record<string, any>; payload: Record<string, any>; }
): void {
  if (!data || typeof data !== 'object') return;

  const d: any = Array.isArray(data) && data.length > 0 ? data[0] : data;
  if (!d || typeof d !== 'object') return;

  const throwDetected = (reason: string, value?: any) => {
    const method = (ctx.axiosConfig?.method || 'GET').toString().toUpperCase();
    const url = String(ctx.axiosConfig?.url || '');
    const maskedConfig = maskCredentials(JSON.stringify(ctx.axiosConfig || {}), ctx.credentials);
    const previewSource = JSON.stringify(data);
    const preview = String(previewSource).slice(0, 2500);
    const valueStr = value !== undefined ? `='${String(value).slice(0, 120)}'` : '';
    const message = `${method} ${url} returned ${status} but appears to be an error. Reason: ${reason}${valueStr}\nResponse preview: ${preview}\nconfig: ${maskedConfig}`;
    throw new ApiCallError(message, status);
  };

  if (typeof d.code === 'number' && d.code >= 400 && d.code <= 599) {
    throwDetected(`code`, d.code);
  }
  if (typeof d.status === 'number' && d.status >= 400 && d.status <= 599) {
    throwDetected(`status`, d.status);
  }

  const errorKeys = new Set(['error', 'errors', 'error_message', 'errormessage', 'failure_reason', 'failure', 'failed']);
  const maxDepth = 2;

  const traverse = (obj: any, depth: number) => {
    if (!obj || typeof obj !== 'object') return;
    for (const key of Object.keys(obj)) {
      const lower = key.toLowerCase();
      if (errorKeys.has(lower)) {
        const v = obj[key];
        const isNonEmpty = Array.isArray(v)
          ? v.length > 0
          : (typeof v === 'string')
            ? v.trim() !== ''
            : (typeof v === 'boolean')
              ? v === true
              : (v && typeof v === 'object' && Object.keys(v).length > 0);
        if (isNonEmpty) {
          throwDetected(`${key} key detected at depth ${depth}`, typeof v === 'string' ? v : undefined);
        }
      }
      const val = obj[key];
      if (depth < maxDepth && val && typeof val === 'object') {
        traverse(val, depth + 1);
      }
    }
  };

  traverse(d, 0);
}

type StatusHandlerInput = {
  response: AxiosResponse;
  axiosConfig: AxiosRequestConfig;
  credentials?: Record<string, any>;
  payload?: Record<string, any>;
  retriesAttempted?: number;
  lastFailureStatus?: number | undefined;
};

function handle2xxStatus(
  input: StatusHandlerInput
): StatusHandlerResult {
  const { response, axiosConfig, credentials = {}, payload = {} } = input;
  const htmlCheck = detectHtmlErrorResponse(response?.data);
  if (htmlCheck.isHtml) {
    const url = String(axiosConfig?.url || '');
    const maskedUrl = maskCredentials(url, { ...credentials, ...payload });
    const msg = `Received HTML response instead of expected JSON data from ${maskedUrl}. \n        This usually indicates an error page or invalid endpoint.\nResponse: ${htmlCheck.preview}`;
    return { shouldFail: true, message: msg };
  }
  return { shouldFail: false };
}

function handle429Status(
  input: StatusHandlerInput
): StatusHandlerResult {
  const { response, axiosConfig, credentials = {}, payload = {} } = input;
  const method = (axiosConfig?.method || 'GET').toString().toUpperCase();
  const url = String(axiosConfig?.url || '');
  const errorData = response?.data instanceof Buffer ? response.data.toString('utf-8') : response?.data;
  const error = JSON.stringify((errorData as any)?.error || (errorData as any)?.errors || errorData || response?.statusText || "undefined");
  const maskedConfig = maskCredentials(JSON.stringify(axiosConfig || {}), { ...credentials, ...payload });
  let message = `${method} ${url} failed with status ${response.status}.\nResponse: ${String(error).slice(0, 1000)}\nconfig: ${maskedConfig}`;

  const retryAfter = response.headers['retry-after']
    ? `Retry-After: ${response.headers['retry-after']}`
    : 'No Retry-After header provided';
  message = `Rate limit exceeded. ${retryAfter}. Maximum wait time of 60s exceeded. \n        \n        ${message}`;
  const full = `API call failed with status ${response.status}. Response: ${message}`;
  return { shouldFail: true, message: full };
}

function handleErrorStatus(
  input: StatusHandlerInput
): StatusHandlerResult {
  const { response, axiosConfig, credentials = {}, payload = {} } = input;
  const method = (axiosConfig?.method || 'GET').toString().toUpperCase();
  const url = String(axiosConfig?.url || '');
  const errorData = response?.data instanceof Buffer ? response.data.toString('utf-8') : response?.data;
  const error = JSON.stringify((errorData as any)?.error || (errorData as any)?.errors || errorData || response?.statusText || "undefined");
  const maskedConfig = maskCredentials(JSON.stringify(axiosConfig || {}), { ...credentials, ...payload });
  const message = `${method} ${url} failed with status ${response.status}.\nResponse: ${String(error).slice(0, 1000)}\nconfig: ${maskedConfig}`;
  const full = `API call failed with status ${response.status}. Response: ${message}`;
  return { shouldFail: true, message: full };
}

export function convertBasicAuthToBase64(headerValue: string) {
  if (!headerValue) return headerValue;
  // Get the part of the 'Basic '
  const credentials = headerValue.substring('Basic '.length).trim();
  // checking if it is already Base64 decoded
  const seemsEncoded = /^[A-Za-z0-9+/=]+$/.test(credentials);

  if (!seemsEncoded) {
    // if not encoded, convert to username:password to Base64
    const base64Credentials = Buffer.from(credentials).toString('base64');
    return `Basic ${base64Credentials}`;
  }
  return headerValue;
}

export async function callEndpoint({ endpoint, payload, credentials, options }: { endpoint: ApiConfig, payload: Record<string, any>, credentials: Record<string, any>, options: RequestOptions }): Promise<{ data: any; statusCode: number; headers: Record<string, any>; }> {
  const allVariables = { ...payload, ...credentials };

  let allResults = [];
  let page = 1;
  let offset = 0;
  let cursor = null;
  let hasMore = true;
  let loopCounter = 0;
  let seenResponseHashes = new Set<string>();
  let previousResponseHash: string | null = null;
  let firstResponseHash: string | null = null;
  let hasValidData = false;
  let lastResponse: AxiosResponse = null;
  const hasStopCondition = endpoint.pagination && (endpoint.pagination as any).stopCondition;
  const maxRequests = hasStopCondition ? server_defaults.MAX_PAGINATION_REQUESTS : 500;

  while (hasMore && loopCounter < maxRequests) {
    const paginationVars = {
      page,
      offset,
      cursor,
      limit: endpoint.pagination?.pageSize || "50",
      pageSize: endpoint.pagination?.pageSize || "50"
    };

    const requestVars = { ...paginationVars, ...allVariables };

    if (endpoint.pagination?.type === PaginationType.PAGE_BASED) {
      const request = JSON.stringify(endpoint);
      if (!request.includes('page')) {
        throw new Error(`Pagination type is ${PaginationType.PAGE_BASED} but no page parameter is provided in the request. Please provide a page parameter in the request.`);
      }
    } else if (endpoint.pagination?.type === PaginationType.OFFSET_BASED) {
      const request = JSON.stringify(endpoint);
      if (!request.includes('offset')) {
        throw new Error(`Pagination type is ${PaginationType.OFFSET_BASED} but no offset parameter is provided in the request. Please provide an offset parameter in the request.`);
      }
    } else if (endpoint.pagination?.type === PaginationType.CURSOR_BASED) {
      const request = JSON.stringify(endpoint);
      if (!request.includes('cursor')) {
        throw new Error(`Pagination type is ${PaginationType.CURSOR_BASED} but no cursor parameter is provided in the request. Please provide a cursor parameter in the request.`);
      }
    }

    const headersWithReplacedVars = Object.fromEntries(
      (await Promise.all(
        Object.entries(endpoint.headers || {})
          .map(async ([key, value]) => [key, await replaceVariables(String(value), requestVars)])
      )).filter(([_, value]) => value && value !== "undefined" && value !== "null")
    );

    const processedHeaders = {};
    for (const [key, value] of Object.entries(headersWithReplacedVars)) {
      let processedValue = value;
      if (key.toLowerCase() === 'authorization' && typeof value === 'string') {
        processedValue = value.replace(/^(Basic|Bearer)\s+(Basic|Bearer)\s+/, '$1 $2');
      }
      // Convert Basic Auth to Base64
      if (key.toLowerCase() === 'authorization' && typeof processedValue === 'string' && processedValue.startsWith('Basic ')) {
        processedValue = convertBasicAuthToBase64(processedValue);
      }

      processedHeaders[key] = processedValue;
    }

    const processedQueryParams = Object.fromEntries(
      (await Promise.all(
        Object.entries(endpoint.queryParams || {})
          .map(async ([key, value]) => [key, await replaceVariables(String(value), requestVars)])
      )).filter(([_, value]) => value && value !== "undefined" && value !== "null")
    );

    const processedBody = endpoint.body ?
      await replaceVariables(endpoint.body, requestVars) :
      "";

    const processedUrlHost = await replaceVariables(endpoint.urlHost, requestVars);
    const processedUrlPath = await replaceVariables(endpoint.urlPath, requestVars);

    if (processedUrlHost.startsWith("postgres://") || processedUrlHost.startsWith("postgresql://")) {
      const postgresEndpoint = {
        ...endpoint,
        urlHost: processedUrlHost,
        urlPath: processedUrlPath,
        body: processedBody
      };
      return { data: await callPostgres(postgresEndpoint, payload, credentials, options), statusCode: 200, headers: {} };
    }

    if (processedUrlHost.startsWith("ftp://") || processedUrlHost.startsWith("ftps://") || processedUrlHost.startsWith("sftp://")) {
      const ftpEndpoint = {
        ...endpoint,
        urlHost: processedUrlHost,
        urlPath: processedUrlPath,
        body: processedBody
      };
      return { data: await callFTP({ endpoint: ftpEndpoint, credentials, options }), statusCode: 200, headers: {} };
    }

    const processedUrl = composeUrl(processedUrlHost, processedUrlPath);

    const axiosConfig: AxiosRequestConfig = {
      method: endpoint.method,
      url: processedUrl,
      headers: processedHeaders,
      data: processedBody,
      params: processedQueryParams,
      timeout: options?.timeout || 60000,
    };

    lastResponse = await callAxios(axiosConfig, options);

    const status = lastResponse?.status;
    let statusHandlerResult = null;

    const retriesAttempted = (lastResponse as any)._retriesAttempted || 0;
    const lastFailureStatus = (lastResponse as any)._lastFailureStatus;
    if ([200, 201, 202, 203, 204, 205].includes(status)) {
      statusHandlerResult = handle2xxStatus({ response: lastResponse, axiosConfig, credentials, payload, retriesAttempted, lastFailureStatus });
    } else if (status === 429) {
      statusHandlerResult = handle429Status({ response: lastResponse, axiosConfig, credentials, payload, retriesAttempted, lastFailureStatus });
    } else {
      const base = handleErrorStatus({ response: lastResponse, axiosConfig, credentials, payload, retriesAttempted, lastFailureStatus });
      if (base.shouldFail && base.message) {
        const suffix = `\nRetries attempted: ${retriesAttempted}${lastFailureStatus ? `; last failure status: ${lastFailureStatus}` : ''}`;
        statusHandlerResult = { shouldFail: true, message: `${base.message}${suffix}` };
      } else {
        statusHandlerResult = base;
      }
    }

    if (statusHandlerResult.shouldFail) {
      throw new ApiCallError(statusHandlerResult.message, status);
    }

    let dataPathSuccess = true;
    // TODO: we need to remove the data path and just join the data with the next page of data, otherwise we will have to do a lot of gymnastics to get the data path right
    let responseData = lastResponse.data;

    // callAxios now always returns a Buffer, so we always need to parse it
    if (responseData instanceof Buffer) {
      responseData = await parseFile(responseData, FileType.AUTO);
    }
    // Fallback for any legacy code paths or special cases - we can remove this later
    else if (responseData && (responseData instanceof ArrayBuffer)) {
      responseData = await parseFile(Buffer.from(responseData), FileType.AUTO);
    }
    else if (responseData && typeof responseData === 'string') {
      responseData = await parseFile(Buffer.from(responseData), FileType.AUTO);
    }
    const parsedResponseData = responseData;

    if (status >= 200 && status <= 205) {
      try {
        checkResponseForErrors(responseData, status, { axiosConfig, credentials, payload });
      } catch (e) {
        throw new ApiCallError(e?.message || String(e), status);
      }
    }
    if (endpoint.dataPath) {
      const pathParts = endpoint.dataPath.split('.');
      for (const part of pathParts) {
        // sometimes a jsonata expression is used to get the data, so ignore the $
        // TODO: fix this later
        if (!responseData[part] && part !== '$') {
          dataPathSuccess = false;
          break;
        }
        responseData = responseData[part] || responseData;
      }
    }

    // Handle pagination based on whether stopCondition exists
    if (hasStopCondition) {
      const currentResponseHash = JSON.stringify(responseData);
      const currentHasData = Array.isArray(responseData) ? responseData.length > 0 :
        responseData && Object.keys(responseData).length > 0;

      if (loopCounter === 0) {
        firstResponseHash = currentResponseHash;
        hasValidData = currentHasData;
      }

      if (loopCounter === 1 && currentResponseHash === firstResponseHash && hasValidData && currentHasData) {
        const maskedBody = maskCredentials(processedBody, { ...credentials, ...payload });
        const maskedParams = maskCredentials(JSON.stringify(processedQueryParams), { ...credentials, ...payload });
        const maskedHeaders = maskCredentials(JSON.stringify(processedHeaders), { ...credentials, ...payload });

        throw new Error(
          `Pagination configuration error: The first two API requests returned identical responses with valid data. ` +
          `This indicates the pagination parameters are not being applied correctly. ` +
          `Please check your pagination configuration (type: ${endpoint.pagination?.type}, pageSize: ${endpoint.pagination?.pageSize}), ` +
          `body: ${maskedBody}, queryParams: ${maskedParams}, headers: ${maskedHeaders}.`
        );
      }

      if (loopCounter === 1 && !hasValidData && !currentHasData) {
        throw new Error(
          `Stop condition error: The API returned no data on the first request, but the stop condition did not terminate pagination. ` +
          `The stop condition should detect empty responses and stop immediately. ` +
          `Current stop condition: ${(endpoint.pagination as any).stopCondition}`
        );
      }

      if (loopCounter > 1 && currentResponseHash === previousResponseHash) {
        hasMore = false;
      } else {
        const pageInfo = {
          page,
          offset,
          cursor,
          totalFetched: allResults.length
        };

        const stopEval = await evaluateStopCondition(
          (endpoint.pagination as any).stopCondition,
          lastResponse,
          pageInfo
        );

        if (stopEval.error) {
          throw new Error(
            `Pagination stop condition error: ${stopEval.error}\n` +
            `Stop condition: ${(endpoint.pagination as any).stopCondition}`
          );
        }

        hasMore = !stopEval.shouldStop;
      }

      previousResponseHash = currentResponseHash;

      if (Array.isArray(responseData)) {
        allResults = allResults.concat(responseData);
      } else if (responseData) {
        allResults.push(responseData);
      }
    } else {
      if (Array.isArray(responseData)) {
        const pageSize = parseInt(endpoint.pagination?.pageSize || "50");
        if (!pageSize || responseData.length < pageSize) {
          hasMore = false;
        }
        const currentResponseHash = JSON.stringify(responseData);
        if (!seenResponseHashes.has(currentResponseHash)) {
          seenResponseHashes.add(currentResponseHash);
          allResults = allResults.concat(responseData);
        } else {
          hasMore = false;
        }
      } else if (responseData && allResults.length === 0) {
        allResults.push(responseData);
        hasMore = false;
      } else {
        hasMore = false;
      }
    }

    if (endpoint.pagination?.type === PaginationType.PAGE_BASED) {
      page++;
    } else if (endpoint.pagination?.type === PaginationType.OFFSET_BASED) {
      offset += parseInt(endpoint.pagination?.pageSize || "50");
    } else if (endpoint.pagination?.type === PaginationType.CURSOR_BASED) {
      const cursorParts = (endpoint.pagination?.cursorPath || 'next_cursor').split('.');
      let nextCursor = parsedResponseData;
      for (const part of cursorParts) {
        nextCursor = nextCursor?.[part];
      }
      cursor = nextCursor;
      if (!cursor) {
        hasMore = false;
      }
    }
    loopCounter++;
  }

  if (endpoint.pagination?.type === PaginationType.CURSOR_BASED) {
    return {
      data: {
        next_cursor: cursor,
        ...(Array.isArray(allResults) ? { results: allResults } : allResults)
      },
      statusCode: lastResponse.status,
      headers: lastResponse.headers
    };
  }

  return {
    data: allResults?.length === 1 ? allResults[0] : allResults,
    statusCode: lastResponse.status,
    headers: lastResponse.headers
  };
}

export async function generateApiConfig({
  apiConfig,
  payload,
  credentials,
  retryCount,
  messages,
  integrationManager,
}: {
  apiConfig: Partial<ApiConfig>,
  payload: Record<string, any>,
  credentials: Record<string, any>,
  retryCount?: number,
  messages?: OpenAI.Chat.ChatCompletionMessageParam[],
  integrationManager: IntegrationManager,
}): Promise<{ config: ApiConfig; messages: OpenAI.Chat.ChatCompletionMessageParam[]; }> {
  if (!retryCount) retryCount = 0;
  if (!messages) messages = [];

  if (messages.length === 0) {
    const fullDocs = await integrationManager?.getDocumentation();
    const documentation = fullDocs?.content?.length < LanguageModel.contextLength / 4 ?
      fullDocs?.content :
      await integrationManager?.searchDocumentation(apiConfig.urlPath || apiConfig.instruction);
    let payloadString = JSON.stringify(payload || {});
    if (payloadString.length > LanguageModel.contextLength / 10) {
      payloadString = JSON.stringify(sample(payload || {}, 5)).slice(0, LanguageModel.contextLength / 10);
    }
    const userPrompt = `Generate API configuration for the following:

<instruction>
${apiConfig.instruction}
</instruction>

<user_provided_information>
Also, the user provided the following information. Ensure to at least try where it makes sense:
Base URL: ${composeUrl(apiConfig.urlHost, apiConfig.urlPath)}
${apiConfig.headers ? `Headers: ${JSON.stringify(apiConfig.headers)}` : ""}
${apiConfig.queryParams ? `Query Params: ${JSON.stringify(apiConfig.queryParams)}` : ""}
${apiConfig.body ? `Body: ${JSON.stringify(apiConfig.body)}` : ''}
${apiConfig.authentication ? `Authentication: ${apiConfig.authentication}` : ''}
${apiConfig.dataPath ? `Data Path: ${apiConfig.dataPath}` : ''}
${apiConfig.pagination ? `Pagination: ${JSON.stringify(apiConfig.pagination)}` : ''}
${apiConfig.method ? `Method: ${apiConfig.method}` : ''}
</user_provided_information>

<integration_instructions>  
${(await integrationManager?.getIntegration())?.specificInstructions}
</integration_instructions>

<documentation>
${documentation}
</documentation>

<available_credentials>
${Object.keys(credentials || {}).map(v => `<<${v}>>`).join(", ")}
</available_credentials>

<example_payload>
${payloadString}
</example_payload>`;

    messages.push({
      role: "system",
      content: SELF_HEALING_API_AGENT_PROMPT
    });
    messages.push({
      role: "user",
      content: userPrompt
    });
  }

  const temperature = Math.min(retryCount * 0.1, 1);
  const { response: generatedConfig, messages: updatedMessages } = await LanguageModel.generateObject(
    messages,
    submitToolDefinition.arguments,
    temperature,
    [searchDocumentationToolDefinition],
    { integration: await integrationManager?.getIntegration() }
  );

  if (generatedConfig?.error) {
    throw new AbortError(generatedConfig.error);
  }
  // convert the queryParams and headers to an object
  const queryParams = generatedConfig.apiConfig.queryParams ?
    Object.fromEntries(generatedConfig.apiConfig.queryParams.map((p: any) => [p.key, p.value])) :
    undefined;
  const headers = generatedConfig.apiConfig.headers ?
    Object.fromEntries(generatedConfig.apiConfig.headers.map((p: any) => [p.key, p.value])) :
    undefined;
  return {
    config: {
      instruction: apiConfig.instruction,
      urlHost: generatedConfig.apiConfig.urlHost,
      urlPath: generatedConfig.apiConfig.urlPath,
      method: generatedConfig.apiConfig.method,
      queryParams: queryParams,
      headers: headers,
      body: generatedConfig.apiConfig.body,
      authentication: generatedConfig.apiConfig.authentication,
      pagination: generatedConfig.apiConfig.pagination,
      dataPath: generatedConfig.apiConfig.dataPath,
      documentationUrl: apiConfig.documentationUrl,
      responseSchema: apiConfig.responseSchema,
      responseMapping: apiConfig.responseMapping,
      createdAt: apiConfig.createdAt || new Date(),
      updatedAt: new Date(),
      id: apiConfig.id || generateId(generatedConfig.apiConfig.urlHost, generatedConfig.apiConfig.urlPath),
    } as ApiConfig,
    messages: updatedMessages
  };
}

export async function evaluateResponse({
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

export async function executeApiCall({
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

      response = await callEndpoint({ endpoint, payload, credentials, options });

      if (!response.data) {
        throw new Error("No data returned from API. This could be due to a configuration error.");
      }

      // Check if response is valid
      if (retryCount > 0 && isSelfHealing || options.testMode) {
        const result = await evaluateResponse({
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
