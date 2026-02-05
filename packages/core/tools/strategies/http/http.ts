import {
  maskCredentials,
  PaginationType,
  RequestOptions,
  ServiceMetadata,
  RequestStepConfig,
  SupportedFileType,
} from "@superglue/shared";
import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import https from "https";
import ivm from "isolated-vm";
import { JSONPath } from "jsonpath-plus";
import { server_defaults } from "../../../default.js";
import { parseFile, parseJSON } from "../../../files/index.js";
import {
  composeUrl,
  convertBasicAuthToBase64,
  replaceVariables,
  smartMergeResponses,
} from "../../../utils/helpers.js";
import { logMessage } from "../../../utils/logs.js";
import {
  StepExecutionInput,
  StepExecutionStrategy,
  StepStrategyExecutionResult,
} from "../strategy.js";

export class HttpStepExecutionStrategy implements StepExecutionStrategy {
  readonly version = "1.0.0";

  shouldExecute(resolvedUrlHost: string): boolean {
    return resolvedUrlHost.startsWith("http");
  }

  async executeStep(input: StepExecutionInput): Promise<StepStrategyExecutionResult> {
    const { stepConfig, stepInputData, credentials, requestOptions, metadata, failureBehavior } =
      input;
    const httpResult = await callHttp({
      config: stepConfig as RequestStepConfig,
      payload: stepInputData,
      credentials,
      options: requestOptions,
      metadata,
      continueOnFailure: failureBehavior === "continue",
    });
    return {
      success: true,
      strategyExecutionData: httpResult.data,
    };
  }
}

export interface CallAxiosResult {
  response: AxiosResponse;
  retriesAttempted: number;
  lastFailureStatus?: number;
}

function configureHttpsAgent(): https.Agent {
  const keepAliveEnabled = process.env.AXIOS_KEEP_ALIVE !== "false";

  const baseConfig = {
    rejectUnauthorized: false,
    keepAlive: keepAliveEnabled,
  };

  if (!keepAliveEnabled) {
    return new https.Agent({
      ...baseConfig,
      maxSockets: server_defaults.HTTP.MAX_SOCKETS,
      maxFreeSockets: server_defaults.HTTP.MAX_FREE_SOCKETS,
      timeout: server_defaults.HTTP.DEFAULT_TIMEOUT,
    });
  }

  return new https.Agent(baseConfig);
}

const httpsAgent = configureHttpsAgent();

export async function callAxios(
  config: AxiosRequestConfig,
  options: RequestOptions,
): Promise<CallAxiosResult> {
  let retryCount = 0;
  const defaultRetries = process.env.AXIOS_KEEP_ALIVE === "false" ? 3 : 1;
  const maxRetries = Math.min(options?.retries ?? defaultRetries, server_defaults.MAX_CALL_RETRIES);
  const delay = options?.retryDelay || server_defaults.HTTP.DEFAULT_RETRY_DELAY_MS;
  const maxRateLimitWaitMs = server_defaults.HTTP.MAX_RATE_LIMIT_WAIT_MS;
  let rateLimitRetryCount = 0;
  let totalRateLimitWaitTime = 0;
  let lastFailureStatus: number | undefined;

  config.headers = {
    Accept: "*/*",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    ...config.headers,
  };

  // Don't send body for GET, HEAD, DELETE, OPTIONS
  if (["GET", "HEAD", "DELETE", "OPTIONS"].includes(config.method!)) {
    config.data = undefined;
  } else if (config.data && config.data.trim().startsWith("{")) {
    try {
      config.data = parseJSON(config.data);
    } catch (error) {}
  } else if (!config.data) {
    config.data = undefined;
  }

  do {
    let response: AxiosResponse | null = null;
    try {
      const startTs = Date.now();
      response = await axios({
        ...config,
        responseType: "arraybuffer", // ALWAYS use arraybuffer to preserve data integrity
        validateStatus: null, // Don't throw on any status
        maxContentLength: Infinity, // No limit on response size
        maxBodyLength: Infinity, // No limit on response body size
        decompress: true, // Ensure gzip/deflate responses are decompressed
        httpsAgent,
      });
      const durationMs = Date.now() - startTs;

      if (response.status === 429) {
        let waitTime = 0;
        if (response.headers["retry-after"]) {
          // Retry-After can be a date or seconds
          const retryAfter = response.headers["retry-after"];
          if (/^\d+$/.test(retryAfter)) {
            waitTime = parseInt(retryAfter, 10) * 1000;
          } else {
            const retryDate = new Date(retryAfter);
            waitTime = retryDate.getTime() - Date.now();
          }
        } else {
          // Exponential backoff with jitter - max wait time is 1 hour
          waitTime = Math.min(
            Math.pow(10, rateLimitRetryCount) * 1000 + Math.random() * 100,
            3600000,
          );
        }

        // Check if we've exceeded the maximum wait time
        if (totalRateLimitWaitTime + waitTime > maxRateLimitWaitMs) {
          // Convert ArrayBuffer to Buffer even for error responses
          if (response.data instanceof ArrayBuffer) {
            response.data = Buffer.from(response.data);
          }
          return { response, retriesAttempted: retryCount, lastFailureStatus };
        }

        await new Promise((resolve) => setTimeout(resolve, waitTime));

        totalRateLimitWaitTime += waitTime;
        rateLimitRetryCount++;
        continue;
      }
      if (response.data instanceof ArrayBuffer) {
        response.data = Buffer.from(response.data);
      }
      if (response.status < 200 || response.status >= 300) {
        if (
          response.status !== 429 &&
          retryCount < maxRetries &&
          durationMs < server_defaults.HTTP.QUICK_RETRY_THRESHOLD_MS
        ) {
          lastFailureStatus = response.status;
          retryCount++;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        return {
          response,
          retriesAttempted: retryCount,
          lastFailureStatus: lastFailureStatus ?? response.status,
        };
      }
      if (retryCount > 0) {
        const method = (config.method || "GET").toString().toUpperCase();
        const url = (config as any).url || "";
        logMessage(
          "debug",
          `Automatic retry succeeded for ${method} ${url} after ${retryCount} retr${retryCount === 1 ? "y" : "ies"}${lastFailureStatus ? `; last failure status: ${lastFailureStatus}` : ""}`,
        );
      }
      return { response, retriesAttempted: retryCount, lastFailureStatus };
    } catch (error) {
      if (retryCount >= maxRetries) {
        const baseMessage = (error as any).message || "Network error";
        const withRetryInfo = `${baseMessage} (retries attempted: ${retryCount}${lastFailureStatus ? `, last failure status: ${lastFailureStatus}` : ""})`;
        throw new ApiCallError(withRetryInfo, response?.status);
      }
      lastFailureStatus = response?.status;
      retryCount++;
      await new Promise((resolve) => setTimeout(resolve, delay * retryCount));
    }
  } while (retryCount <= maxRetries || rateLimitRetryCount > 0); // separate max retries and rate limit retries
}

export class ApiCallError extends Error {
  statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = "ApiCallError";
    this.statusCode = statusCode;
  }
}
export class AbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AbortError";
  }
}

function checkForErrors({
  status,
  parsedData,
  response,
  axiosConfig,
  credentials = {},
  retriesAttempted = 0,
  lastFailureStatus,
}: {
  status: number;
  parsedData: any;
  response: AxiosResponse;
  axiosConfig: AxiosRequestConfig;
  credentials?: Record<string, any>;
  retriesAttempted?: number;
  lastFailureStatus?: number;
}): void {
  const method = (axiosConfig?.method || "GET").toString().toUpperCase();
  const url = String(axiosConfig?.url || "");
  const maskedConfig = maskCredentials(JSON.stringify(axiosConfig || {}), credentials);
  const retrySuffix = `\nRetries attempted: ${retriesAttempted}${lastFailureStatus ? `; last failure status: ${lastFailureStatus}` : ""}`;

  // Handle 429 rate limiting
  if (status === 429) {
    const error = JSON.stringify(
      (parsedData as any)?.error ||
        (parsedData as any)?.errors ||
        parsedData ||
        response?.statusText ||
        "undefined",
    );
    const retryAfter = response.headers["retry-after"]
      ? `Retry-After: ${response.headers["retry-after"]}`
      : "No Retry-After header provided";
    const message = `Rate limit exceeded. ${retryAfter}. Maximum wait time of 60s exceeded. \n${method} ${url} failed with status ${status}.\nResponse: ${String(error).slice(0, 1000)}\nconfig: ${maskedConfig}`;
    throw new ApiCallError(
      `API call failed with status ${status}. Response: ${message}${retrySuffix}`,
      status,
    );
  }

  // Handle other non-2xx status codes
  if (status < 200 || status > 205) {
    const error = JSON.stringify(
      (parsedData as any)?.error ||
        (parsedData as any)?.errors ||
        parsedData ||
        response?.statusText ||
        "undefined",
    );
    const message = `${method} ${url} failed with status ${status}.\nResponse: ${String(error).slice(0, 1000)}\nconfig: ${maskedConfig}`;
    throw new ApiCallError(
      `API call failed with status ${status}. Response: ${message}${retrySuffix}`,
      status,
    );
  }

  // SMART mode: check parsed response for error indicators in 2xx responses
  if (!parsedData || typeof parsedData !== "object") {
    return;
  }

  const d: any = Array.isArray(parsedData) && parsedData.length > 0 ? parsedData[0] : parsedData;
  if (!d || typeof d !== "object") return;

  const throwDetected = (reason: string, value?: any) => {
    const preview = String(JSON.stringify(parsedData)).slice(0, 2500);
    const valueStr = value !== undefined ? `='${String(value).slice(0, 120)}'` : "";
    const message = `${method} ${url} returned ${status} but appears to be an error. Error detection flagged this response. To prevent this from happening, enable "Continue on failure" in the step's Advanced Settings. Reason: ${reason}${valueStr}\nResponse preview: ${preview}\nconfig: ${maskedConfig}`;
    throw new ApiCallError(message, status);
  };

  if (typeof d.code === "number" && d.code >= 400 && d.code <= 599) {
    throwDetected(`code`, d.code);
  }
  if (typeof d.status === "number" && d.status >= 400 && d.status <= 599) {
    throwDetected(`status`, d.status);
  }

  const errorKeys = new Set([
    "error",
    "errors",
    "error_message",
    "errormessage",
    "failure_reason",
    "failure",
    "failed",
  ]);
  const maxDepth = 2;

  const traverse = (obj: any, depth: number) => {
    if (!obj || typeof obj !== "object") return;
    for (const key of Object.keys(obj)) {
      const lower = key.toLowerCase();
      if (errorKeys.has(lower)) {
        const v = obj[key];
        const isNonEmpty = Array.isArray(v)
          ? v.length > 0
          : typeof v === "string"
            ? v.trim() !== ""
            : typeof v === "boolean"
              ? v === true
              : v && typeof v === "object" && Object.keys(v).length > 0;
        if (isNonEmpty) {
          throwDetected(
            `${key} detected: ${JSON.stringify(v).slice(0, 1000)}`,
            typeof v === "string" ? v : undefined,
          );
        }
      }
      const val = obj[key];
      if (depth < maxDepth && val && typeof val === "object") {
        traverse(val, depth + 1);
      }
    }
  };

  traverse(d, 0);
}

export async function callHttp({
  config,
  payload,
  credentials,
  options,
  metadata,
  continueOnFailure,
}: {
  config: RequestStepConfig;
  payload: Record<string, any>;
  credentials: Record<string, any>;
  options: RequestOptions;
  metadata: ServiceMetadata;
  continueOnFailure?: boolean;
}): Promise<{ data: any; statusCode: number; headers: Record<string, any> }> {
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
  const hasStopCondition = config.pagination && (config.pagination as any).stopCondition;
  const maxRequests = hasStopCondition ? server_defaults.MAX_PAGINATION_REQUESTS : 500;

  while (hasMore && loopCounter < maxRequests) {
    const paginationVars = {
      page,
      offset,
      cursor,
      limit: config.pagination?.pageSize || "50",
      pageSize: config.pagination?.pageSize || "50",
    };

    const requestVars = { ...paginationVars, ...allVariables };

    if (config.pagination?.type === "pageBased") {
      const request = JSON.stringify(config);
      if (!request.includes("page")) {
        throw new Error(
          `Pagination type is pageBased but no page parameter is provided in the request. Please provide a page parameter in the request.`,
        );
      }
    } else if (config.pagination?.type === "offsetBased") {
      const request = JSON.stringify(config);
      if (!request.includes("offset")) {
        throw new Error(
          `Pagination type is offsetBased but no offset parameter is provided in the request. Please provide an offset parameter in the request.`,
        );
      }
    } else if (config.pagination?.type === "cursorBased") {
      const request = JSON.stringify(config);
      if (!request.includes("cursor")) {
        throw new Error(
          `Pagination type is cursorBased but no cursor parameter is provided in the request. Please provide a cursor parameter in the request.`,
        );
      }
    }

    // Handle headers - might be string or object
    let headersToProcess = config.headers || {};
    if (typeof headersToProcess === "string") {
      const replacedString = await replaceVariables(headersToProcess, requestVars);
      try {
        headersToProcess = JSON.parse(replacedString);
      } catch {
        headersToProcess = {};
      }
    }

    const headersWithReplacedVars = Object.fromEntries(
      (
        await Promise.all(
          Object.entries(headersToProcess).map(async ([key, value]) => [
            key,
            await replaceVariables(String(value), requestVars),
          ]),
        )
      ).filter(([_, value]) => value && value !== "undefined" && value !== "null"),
    );

    const processedHeaders = {};
    for (const [key, value] of Object.entries(headersWithReplacedVars)) {
      let processedValue = value;
      if (key.toLowerCase() === "authorization" && typeof value === "string") {
        processedValue = value.replace(/^(Basic|Bearer)\s+(Basic|Bearer)\s+/, "$1 $2");
      }
      // Convert Basic Auth to Base64
      if (
        key.toLowerCase() === "authorization" &&
        typeof processedValue === "string" &&
        processedValue.startsWith("Basic ")
      ) {
        processedValue = convertBasicAuthToBase64(processedValue);
      }

      processedHeaders[key] = processedValue;
    }

    // Handle query params - might be string or object
    let queryParamsToProcess = config.queryParams || {};
    if (typeof queryParamsToProcess === "string") {
      const replacedString = await replaceVariables(queryParamsToProcess, requestVars);
      try {
        queryParamsToProcess = JSON.parse(replacedString);
      } catch {
        queryParamsToProcess = {};
      }
    }

    const processedQueryParams = Object.fromEntries(
      (
        await Promise.all(
          Object.entries(queryParamsToProcess).map(async ([key, value]) => [
            key,
            await replaceVariables(String(value), requestVars),
          ]),
        )
      ).filter(([_, value]) => value && value !== "undefined" && value !== "null"),
    );

    const processedBody = config.body ? await replaceVariables(config.body, requestVars) : "";

    const processedUrlHost = await replaceVariables(config.urlHost, requestVars);
    const processedUrlPath = await replaceVariables(config.urlPath, requestVars);
    const processedUrl = composeUrl(processedUrlHost, processedUrlPath);

    const axiosConfig: AxiosRequestConfig = {
      method: config.method,
      url: processedUrl,
      headers: processedHeaders,
      data: processedBody,
      params: processedQueryParams,
      timeout: options?.timeout || server_defaults.HTTP.DEFAULT_TIMEOUT,
    };

    const paginationInfo =
      config.pagination?.type === "pageBased"
        ? "page: " + page
        : config.pagination?.type === "offsetBased"
          ? "offset: " + offset
          : config.pagination?.type === "cursorBased"
            ? "cursor: " + cursor
            : "";
    logMessage(
      "debug",
      `Calling HTTP endpoint${paginationInfo ? ` (${paginationInfo})` : ""}: ${maskCredentials(processedUrl, credentials)}`,
      metadata,
    );

    const axiosResult = await callAxios(axiosConfig, options);
    lastResponse = axiosResult.response;

    const status = lastResponse?.status;
    const retriesAttempted = axiosResult.retriesAttempted || 0;
    const lastFailureStatus = axiosResult.lastFailureStatus;

    // Parse response data
    let responseData = lastResponse.data;
    if (responseData instanceof Buffer) {
      responseData = await parseFile(responseData, SupportedFileType.AUTO);
    } else if (responseData && responseData instanceof ArrayBuffer) {
      responseData = await parseFile(Buffer.from(responseData), SupportedFileType.AUTO);
    } else if (responseData && typeof responseData === "string") {
      responseData = await parseFile(Buffer.from(responseData), SupportedFileType.AUTO);
    }
    const parsedResponseData = responseData;

    if (!continueOnFailure) {
      checkForErrors({
        status,
        parsedData: parsedResponseData,
        response: lastResponse,
        axiosConfig,
        credentials,
        retriesAttempted,
        lastFailureStatus,
      });
    }

    // Handle pagination based on whether stopCondition exists
    if (hasStopCondition) {
      const currentResponseHash = JSON.stringify(parsedResponseData);
      const currentHasData = Array.isArray(parsedResponseData)
        ? parsedResponseData.length > 0
        : parsedResponseData && Object.keys(parsedResponseData).length > 0;

      if (loopCounter === 0) {
        firstResponseHash = currentResponseHash;
        hasValidData = currentHasData;
      }

      if (
        loopCounter === 1 &&
        currentResponseHash === firstResponseHash &&
        hasValidData &&
        currentHasData
      ) {
        const maskedBody = maskCredentials(processedBody, credentials);
        const maskedParams = maskCredentials(JSON.stringify(processedQueryParams), credentials);
        const maskedHeaders = maskCredentials(JSON.stringify(processedHeaders), credentials);

        throw new Error(
          `Pagination configuration error: The first two API requests returned identical responses with valid data. ` +
            `This indicates the pagination parameters are not being applied correctly. ` +
            `Please check your pagination configuration (type: ${config.pagination?.type}, pageSize: ${config.pagination?.pageSize}), ` +
            `body: ${maskedBody}, queryParams: ${maskedParams}, headers: ${maskedHeaders}.`,
        );
      }

      if (loopCounter === 1 && !hasValidData && !currentHasData) {
        throw new Error(
          `Stop condition error: The API returned no data on the first request, but the stop condition did not terminate pagination. ` +
            `The stop condition should detect empty responses and stop immediately. ` +
            `Current stop condition: ${(config.pagination as any).stopCondition}`,
        );
      }

      if (loopCounter > 1 && currentResponseHash === previousResponseHash) {
        hasMore = false;
      } else {
        const pageInfo = {
          page,
          offset,
          cursor,
          totalFetched: allResults.length,
        };

        const stopEval = await evaluateStopCondition(
          (config.pagination as any).stopCondition,
          { ...lastResponse, data: parsedResponseData },
          pageInfo,
        );

        if (stopEval.error) {
          throw new Error(
            `Pagination stop condition error: ${stopEval.error}\n` +
              `Stop condition: ${(config.pagination as any).stopCondition}`,
          );
        }

        hasMore = !stopEval.shouldStop;
      }

      previousResponseHash = currentResponseHash;
      allResults = smartMergeResponses(allResults, parsedResponseData);
    } else {
      if (Array.isArray(parsedResponseData)) {
        const pageSize = parseInt(config.pagination?.pageSize || "50");
        if (!pageSize || parsedResponseData.length < pageSize) {
          hasMore = false;
        }
        const currentResponseHash = JSON.stringify(parsedResponseData);
        if (!seenResponseHashes.has(currentResponseHash)) {
          seenResponseHashes.add(currentResponseHash);
          allResults = allResults.concat(parsedResponseData);
        } else {
          hasMore = false;
        }
      } else if (parsedResponseData && allResults.length === 0) {
        allResults.push(parsedResponseData);
        hasMore = false;
      } else {
        hasMore = false;
      }
    }

    // increment the pagination variables regardless of the pagination type
    page++;
    offset += parseInt(config.pagination?.pageSize) || 50;

    if (config.pagination?.type === "cursorBased") {
      const cursorPath = config.pagination?.cursorPath || "next_cursor";
      const jsonPath = cursorPath.startsWith("$") ? cursorPath : `$.${cursorPath}`;
      const result = JSONPath({ path: jsonPath, json: parsedResponseData, wrap: false });
      cursor = result;
      if (!cursor) {
        hasMore = false;
      }
    }
    loopCounter++;
  }

  return {
    data: allResults?.length === 1 ? allResults[0] : allResults,
    statusCode: lastResponse.status,
    headers: lastResponse.headers,
  };
}

export async function evaluateStopCondition(
  stopConditionCode: string,
  response: AxiosResponse,
  pageInfo: { page: number; offset: number; cursor: any; totalFetched: number },
): Promise<{ shouldStop: boolean; error?: string }> {
  const isolate = new ivm.Isolate({ memoryLimit: 4096 });

  try {
    const context = await isolate.createContext();

    // Inject the response and pageInfo as JSON strings
    // legacy support for direct response data access
    await context.global.set(
      "responseJSON",
      JSON.stringify({ data: response.data, headers: response.headers }),
    );
    await context.global.set("pageInfoJSON", JSON.stringify(pageInfo));

    // if the stop condition code starts with return or is not a function, we need to wrap it in a function
    if (stopConditionCode.startsWith("return")) {
      stopConditionCode = `(response, pageInfo) => { ${stopConditionCode} }`;
    } else if (!stopConditionCode.startsWith("(response")) {
      stopConditionCode = `(response, pageInfo) => ${stopConditionCode}`;
    }

    // Create the evaluation script
    const script = `
            const response = JSON.parse(responseJSON);
            const pageInfo = JSON.parse(pageInfoJSON);
            const fn = ${stopConditionCode};
            const result = fn(response, pageInfo);
            // Return the boolean result
            return Boolean(result);
        `;

    const shouldStop = await context.evalClosure(script, null, { timeout: 3000 });

    return { shouldStop: Boolean(shouldStop) };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    let helpfulError = `Stop condition evaluation failed: ${errorMessage}`;

    return {
      shouldStop: false, // Default to continue on error
      error: helpfulError,
    };
  } finally {
    try {
      isolate.dispose();
    } catch (error) {
      console.error("Error disposing isolate", error);
    }
  }
}
