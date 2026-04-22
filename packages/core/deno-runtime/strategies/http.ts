/**
 * HTTP Strategy for Deno runtime
 *
 * Uses native fetch() for HTTP requests with pagination support.
 */

import type {
  RequestStepConfig,
  RequestOptions,
  RuntimeExecutionFile,
  ServiceMetadata,
  StepExecutionResult,
} from "../types.ts";
import { DENO_DEFAULTS } from "../types.ts";
import { replaceVariables } from "../utils/transform.ts";
import {
  buildRuntimeFile,
  detectFileType,
  parseFile,
  parseJSON,
  resolveFileTokens,
} from "../utils/files.ts";
import { debug, maskCredentials } from "../utils/logging.ts";
import {
  convertBasicAuthToBase64,
  deriveResponseFilename,
  getValueByPath,
  readResponseBytes,
  resolveBodyForFetch,
  shouldTreatHttpResponseAsFile,
} from "../utils/http-utils.ts";

/**
 * Execute an HTTP step
 */
export async function executeHttpStep(
  config: RequestStepConfig,
  payload: Record<string, unknown>,
  fileLookup: Record<string, RuntimeExecutionFile>,
  credentials: Record<string, unknown>,
  options: RequestOptions,
  metadata: ServiceMetadata,
  stepId?: string,
): Promise<StepExecutionResult> {
  try {
    const result = await callHttp({
      config,
      payload,
      fileLookup,
      credentials,
      options,
      metadata,
      stepId,
    });
    return { success: true, data: result.data, producedFiles: result.producedFiles };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Smart merge responses for pagination
 */
function smartMergeResponses(accumulated: unknown, newResponse: unknown): unknown {
  if (accumulated === undefined || accumulated === null) {
    return newResponse;
  }

  if (Array.isArray(accumulated) && Array.isArray(newResponse)) {
    return [...accumulated, ...newResponse];
  }

  if (
    typeof accumulated === "object" &&
    typeof newResponse === "object" &&
    !Array.isArray(accumulated) &&
    !Array.isArray(newResponse) &&
    accumulated !== null &&
    newResponse !== null
  ) {
    const merged: Record<string, unknown> = { ...(accumulated as Record<string, unknown>) };
    const newObj = newResponse as Record<string, unknown>;

    for (const key in newObj) {
      if (Object.prototype.hasOwnProperty.call(newObj, key)) {
        if (
          key in merged &&
          typeof merged[key] === "object" &&
          typeof newObj[key] === "object" &&
          merged[key] !== null &&
          newObj[key] !== null
        ) {
          merged[key] = smartMergeResponses(merged[key], newObj[key]);
        } else {
          merged[key] = newObj[key];
        }
      }
    }
    return merged;
  }

  return newResponse;
}

/**
 * Evaluate pagination stop condition
 */
async function evaluateStopCondition(
  stopConditionCode: string,
  response: { data: unknown; headers: Headers },
  pageInfo: { page: number; offset: number; cursor: unknown; totalFetched: number },
): Promise<{ shouldStop: boolean; error?: string }> {
  try {
    let code = stopConditionCode;

    // Wrap code if needed
    if (code.startsWith("return")) {
      code = `(response, pageInfo) => { ${code} }`;
    } else if (!code.startsWith("(response")) {
      code = `(response, pageInfo) => ${code}`;
    }

    // Convert headers to plain object
    const headersObj: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headersObj[key] = value;
    });

    const fn = eval(code);
    const result = fn({ data: response.data, headers: headersObj }, pageInfo);
    return { shouldStop: Boolean(result) };
  } catch (error) {
    return {
      shouldStop: false,
      error: `Stop condition evaluation failed: ${(error as Error).message}`,
    };
  }
}

interface CallHttpResult {
  data: unknown;
  statusCode: number;
  headers: Headers;
  producedFiles?: Record<string, RuntimeExecutionFile>;
}

/**
 * Main HTTP call function with pagination support
 */
async function callHttp({
  config,
  payload,
  fileLookup,
  credentials,
  options,
  metadata,
  stepId,
}: {
  config: RequestStepConfig;
  payload: Record<string, unknown>;
  fileLookup: Record<string, RuntimeExecutionFile>;
  credentials: Record<string, unknown>;
  options: RequestOptions;
  metadata: ServiceMetadata;
  stepId?: string;
}): Promise<CallHttpResult> {
  const allVariables = { ...payload, ...credentials };
  let allResults: unknown[] = [];
  let page = 1;
  let offset = 0;
  let cursor: unknown = null;
  let hasMore = true;
  let loopCounter = 0;
  const seenResponseHashes = new Set<string>();
  let previousResponseHash: string | null = null;
  let firstResponseHash: string | null = null;
  let hasValidData = false;
  let lastResponse: Response | null = null;
  let lastParsedData: unknown = null;

  const hasStopCondition = config.pagination?.stopCondition;
  const maxRequests = hasStopCondition ? DENO_DEFAULTS.MAX_PAGINATION_REQUESTS : 500;

  while (hasMore && loopCounter < maxRequests) {
    const paginationVars = {
      page,
      offset,
      cursor,
      limit: config.pagination?.pageSize || "50",
      pageSize: config.pagination?.pageSize || "50",
    };

    const requestVars = { ...paginationVars, ...allVariables };

    let headersToProcess = config.headers || {};
    if (typeof headersToProcess === "string") {
      const replacedString = await replaceVariables(headersToProcess, requestVars, metadata);
      try {
        headersToProcess = JSON.parse(replacedString);
      } catch {
        headersToProcess = {};
      }
    }

    const processedHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(headersToProcess as Record<string, unknown>)) {
      let processedValue = await replaceVariables(String(value), requestVars, metadata);

      if (key.toLowerCase() === "authorization") {
        processedValue = processedValue.replace(/^(Basic|Bearer)\s+\1\s+/i, "$1 ");
        if (processedValue.startsWith("Basic ")) {
          processedValue = convertBasicAuthToBase64(processedValue);
        }
      }

      if (processedValue && processedValue !== "undefined" && processedValue !== "null") {
        processedHeaders[key] = processedValue;
      }
    }

    let queryParamsToProcess = config.queryParams || {};
    if (typeof queryParamsToProcess === "string") {
      const replacedString = await replaceVariables(queryParamsToProcess, requestVars, metadata);
      try {
        queryParamsToProcess = JSON.parse(replacedString);
      } catch {
        queryParamsToProcess = {};
      }
    }

    const processedQueryParams: Record<string, string> = {};
    for (const [key, value] of Object.entries(queryParamsToProcess as Record<string, unknown>)) {
      const processedValue = await replaceVariables(String(value), requestVars, metadata);
      if (processedValue && processedValue !== "undefined" && processedValue !== "null") {
        processedQueryParams[key] = processedValue;
      }
    }

    const processedBody = config.body
      ? await replaceVariables(config.body, requestVars, metadata)
      : undefined;
    const resolvedBody =
      processedBody === undefined
        ? undefined
        : resolveFileTokens(parseJSON(processedBody), fileLookup, { stepId });

    let processedUrl = await replaceVariables(config.url || "", requestVars, metadata);

    if (Object.keys(processedQueryParams).length > 0) {
      const url = new URL(processedUrl);
      for (const [key, value] of Object.entries(processedQueryParams)) {
        url.searchParams.set(key, value);
      }
      processedUrl = url.toString();
    }

    const method = (config.method || "GET").toUpperCase();
    const paginationInfo =
      config.pagination?.type === "pageBased"
        ? `page: ${page}`
        : config.pagination?.type === "offsetBased"
          ? `offset: ${offset}`
          : config.pagination?.type === "cursorBased"
            ? `cursor: ${cursor}`
            : "";

    debug(
      `Calling HTTP endpoint${paginationInfo ? ` (${paginationInfo})` : ""}: ${maskCredentials(processedUrl, credentials)}`,
      metadata,
    );

    const timeout = options?.timeout ?? DENO_DEFAULTS.HTTP.DEFAULT_TIMEOUT;
    const maxRetries = options?.retries ?? DENO_DEFAULTS.MAX_CALL_RETRIES;
    const retryDelay = options?.retryDelay ?? DENO_DEFAULTS.HTTP.DEFAULT_RETRY_DELAY_MS;

    let response: Response | null = null;
    let retryCount = 0;

    while (retryCount <= maxRetries) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const fetchOptions: RequestInit = {
          method,
          headers: {
            Accept: "*/*",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            ...processedHeaders,
          },
          signal: controller.signal,
        };

        if (!["GET", "HEAD", "DELETE", "OPTIONS"].includes(method) && resolvedBody !== undefined) {
          resolveBodyForFetch({
            resolvedBody,
            processedHeaders,
            fileLookup,
            fetchOptions,
          });
        }

        response = await fetch(processedUrl, fetchOptions);
        clearTimeout(timeoutId);

        if (response.status === 429) {
          retryCount++;
          if (retryCount > maxRetries) {
            throw new Error(`Rate limit exceeded after ${maxRetries} retries`);
          }

          const retryAfter = response.headers.get("retry-after");
          let waitTime = 0;
          if (retryAfter && retryCount == 1) {
            if (/^\d+$/.test(retryAfter)) {
              waitTime = parseInt(retryAfter, 10) * 1000;
            } else {
              waitTime = new Date(retryAfter).getTime() - Date.now();
            }
          } else {
            waitTime = Math.min(Math.pow(4, retryCount) * 1000 + Math.random() * 100, 3600000);
          }

          if (waitTime > DENO_DEFAULTS.HTTP.MAX_RATE_LIMIT_WAIT_MS) {
            throw new Error(`Rate limit exceeded. Maximum wait time exceeded.`);
          }

          await new Promise((resolve) => setTimeout(resolve, waitTime));
          continue;
        }

        if (response.status >= 200 && response.status < 300) {
          break;
        }

        if (response.status >= 500 && retryCount < maxRetries) {
          retryCount++;
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
          continue;
        }

        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText.slice(0, 500)}`);
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          throw new Error(`Request timed out after ${timeout}ms`);
        }
        if (retryCount >= maxRetries) {
          throw error;
        }
        retryCount++;
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }

    if (!response) {
      throw new Error("No response received");
    }

    lastResponse = response;

    const responseBytes = await readResponseBytes(response);
    const detectedType = await detectFileType(responseBytes);
    const treatAsFile = shouldTreatHttpResponseAsFile({
      response,
      detectedType,
      responseBytes,
    });
    let parsedResponseData: unknown;

    if (treatAsFile) {
      const filename = deriveResponseFilename(response, processedUrl);
      const contentType = response.headers.get("content-type") || "application/octet-stream";
      const file = await buildRuntimeFile(responseBytes, filename, contentType);
      parsedResponseData = file.extracted;
      lastParsedData = parsedResponseData;
      lastResponse = response;
      hasMore = false;
      return {
        data: parsedResponseData,
        statusCode: response.status,
        headers: response.headers,
        producedFiles: {
          [filename]: file,
        },
      };
    }

    parsedResponseData = await parseFile(responseBytes, detectedType);
    lastParsedData = parsedResponseData;

    if (hasStopCondition) {
      const currentResponseHash = JSON.stringify(parsedResponseData);
      const currentHasData = Array.isArray(parsedResponseData)
        ? parsedResponseData.length > 0
        : parsedResponseData &&
          typeof parsedResponseData === "object" &&
          Object.keys(parsedResponseData).length > 0;

      if (loopCounter === 0) {
        firstResponseHash = currentResponseHash;
        hasValidData = Boolean(currentHasData);
      }

      if (
        loopCounter === 1 &&
        currentResponseHash === firstResponseHash &&
        hasValidData &&
        currentHasData
      ) {
        throw new Error(
          `Pagination configuration error: The first two API requests returned identical responses.`,
        );
      }

      if (loopCounter > 1 && currentResponseHash === previousResponseHash) {
        hasMore = false;
      } else {
        let totalFetched = 0;
        if (Array.isArray(allResults)) {
          totalFetched = allResults.length;
        } else if (allResults && typeof allResults === "object") {
          const obj = allResults as Record<string, unknown>;
          for (const key of ["results", "data", "items", "records", "entries"]) {
            if (Array.isArray(obj[key])) {
              totalFetched = (obj[key] as unknown[]).length;
              break;
            }
          }
          if (totalFetched === 0) {
            totalFetched = loopCounter + 1;
          }
        }

        const pageInfo = {
          page,
          offset,
          cursor,
          totalFetched,
        };

        const stopEval = await evaluateStopCondition(
          config.pagination!.stopCondition!,
          { data: parsedResponseData, headers: response.headers },
          pageInfo,
        );

        if (stopEval.error) {
          throw new Error(`Pagination stop condition error: ${stopEval.error}`);
        }

        hasMore = !stopEval.shouldStop;
      }

      previousResponseHash = currentResponseHash;
      allResults = smartMergeResponses(allResults, parsedResponseData) as unknown[];
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

    page++;
    offset += parseInt(config.pagination?.pageSize || "50");

    if (config.pagination?.type === "cursorBased") {
      const cursorPath = config.pagination?.cursorPath || "next_cursor";
      cursor = getValueByPath(parsedResponseData, cursorPath);
      if (!cursor) {
        hasMore = false;
      }
    }

    loopCounter++;
  }

  return {
    data: allResults.length === 1 ? allResults[0] : allResults,
    statusCode: lastResponse?.status || 0,
    headers: lastResponse?.headers || new Headers(),
  };
}
