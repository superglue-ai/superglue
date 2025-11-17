import { ApiConfig, PaginationType } from "@superglue/client";
import { SupportedFileType } from "@superglue/shared";
import { AxiosRequestConfig, AxiosResponse } from "axios";
import { RequestOptions } from "http";
import ivm from "isolated-vm";
import { JSONPath } from "jsonpath-plus";
import { server_defaults } from "../../../../default.js";
import { parseFile } from "../../../../files/index.js";
import { composeUrl, maskCredentials, replaceVariables, smartMergeResponses } from "../../../../utils/tools.js";
import { callFTP } from "../ftp/ftp.js";
import { callPostgres } from "../postgres/postgres.legacy.js";
import { ApiCallError, callAxios, checkResponseForErrors, handle2xxStatus, handle429Status, handleErrorStatus } from "./api.js";

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

export async function runStepConfig({ config, payload, credentials, options }: { config: ApiConfig, payload: Record<string, any>, credentials: Record<string, any>, options: RequestOptions }): Promise<{ data: any; statusCode: number; headers: Record<string, any>; }> {
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
      pageSize: config.pagination?.pageSize || "50"
    };

    const requestVars = { ...paginationVars, ...allVariables };

    if (config.pagination?.type === PaginationType.PAGE_BASED) {
      const request = JSON.stringify(config);
      if (!request.includes('page')) {
        throw new Error(`Pagination type is ${PaginationType.PAGE_BASED} but no page parameter is provided in the request. Please provide a page parameter in the request.`);
      }
    } else if (config.pagination?.type === PaginationType.OFFSET_BASED) {
      const request = JSON.stringify(config);
      if (!request.includes('offset')) {
        throw new Error(`Pagination type is ${PaginationType.OFFSET_BASED} but no offset parameter is provided in the request. Please provide an offset parameter in the request.`);
      }
    } else if (config.pagination?.type === PaginationType.CURSOR_BASED) {
      const request = JSON.stringify(config);
      if (!request.includes('cursor')) {
        throw new Error(`Pagination type is ${PaginationType.CURSOR_BASED} but no cursor parameter is provided in the request. Please provide a cursor parameter in the request.`);
      }
    }

    // Handle headers - might be string or object
    let headersToProcess = config.headers || {};
    if (typeof headersToProcess === 'string') {
      const replacedString = await replaceVariables(headersToProcess, requestVars);
      try {
        headersToProcess = JSON.parse(replacedString);
      } catch {
        headersToProcess = {};
      }
    }

    const headersWithReplacedVars = Object.fromEntries(
      (await Promise.all(
        Object.entries(headersToProcess)
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

    // Handle query params - might be string or object
    let queryParamsToProcess = config.queryParams || {};
    if (typeof queryParamsToProcess === 'string') {
      const replacedString = await replaceVariables(queryParamsToProcess, requestVars);
      try {
        queryParamsToProcess = JSON.parse(replacedString);
      } catch {
        queryParamsToProcess = {};
      }
    }

    const processedQueryParams = Object.fromEntries(
      (await Promise.all(
        Object.entries(queryParamsToProcess)
          .map(async ([key, value]) => [key, await replaceVariables(String(value), requestVars)])
      )).filter(([_, value]) => value && value !== "undefined" && value !== "null")
    );

    const processedBody = config.body ?
      await replaceVariables(config.body, requestVars) :
      "";

    const processedUrlHost = await replaceVariables(config.urlHost, requestVars);
    const processedUrlPath = await replaceVariables(config.urlPath, requestVars);

    if (processedUrlHost.startsWith("postgres://") || processedUrlHost.startsWith("postgresql://")) {
      const postgresEndpoint = {
        ...config,
        urlHost: processedUrlHost,
        urlPath: processedUrlPath,
        body: processedBody
      };
      return { data: await callPostgres(postgresEndpoint, payload, credentials, options), statusCode: 200, headers: {} };
    }

    if (processedUrlHost.startsWith("ftp://") || processedUrlHost.startsWith("ftps://") || processedUrlHost.startsWith("sftp://")) {
      const ftpEndpoint = {
        ...config,
        urlHost: processedUrlHost,
        urlPath: processedUrlPath,
        body: processedBody
      };
      return { data: await callFTP({ endpoint: ftpEndpoint, credentials, options }), statusCode: 200, headers: {} };
    }

    const processedUrl = composeUrl(processedUrlHost, processedUrlPath);

    const axiosConfig: AxiosRequestConfig = {
      method: config.method,
      url: processedUrl,
      headers: processedHeaders,
      data: processedBody,
      params: processedQueryParams,
      timeout: options?.timeout || server_defaults.HTTP.DEFAULT_TIMEOUT,
    };

    const axiosResult = await callAxios(axiosConfig, options);
    lastResponse = axiosResult.response;

    const status = lastResponse?.status;
    let statusHandlerResult = null;

    const retriesAttempted = axiosResult.retriesAttempted || 0;
    const lastFailureStatus = axiosResult.lastFailureStatus;
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

    let responseData = lastResponse.data;

    // callAxios now always returns a Buffer, so we always need to parse it
    if (responseData instanceof Buffer) {
      responseData = await parseFile(responseData, SupportedFileType.AUTO);
    }
    // Fallback for any legacy code paths or special cases - we can remove this later
    else if (responseData && (responseData instanceof ArrayBuffer)) {
      responseData = await parseFile(Buffer.from(responseData), SupportedFileType.AUTO);
    }
    else if (responseData && typeof responseData === 'string') {
      responseData = await parseFile(Buffer.from(responseData), SupportedFileType.AUTO);
    }
    const parsedResponseData = responseData;

    if (status >= 200 && status <= 205) {
      try {
        checkResponseForErrors(parsedResponseData, status, { axiosConfig, credentials, payload });
      } catch (e) {
        throw new ApiCallError(e?.message || String(e), status);
      }
    }

    // Handle pagination based on whether stopCondition exists
    if (hasStopCondition) {
      const currentResponseHash = JSON.stringify(parsedResponseData);
      const currentHasData = Array.isArray(parsedResponseData) ? parsedResponseData.length > 0 :
        parsedResponseData && Object.keys(parsedResponseData).length > 0;

      if (loopCounter === 0) {
        firstResponseHash = currentResponseHash;
        hasValidData = currentHasData;
      }

      if (loopCounter === 1 && currentResponseHash === firstResponseHash && hasValidData && currentHasData) {
        const maskedBody = maskCredentials(processedBody, credentials);
        const maskedParams = maskCredentials(JSON.stringify(processedQueryParams), credentials);
        const maskedHeaders = maskCredentials(JSON.stringify(processedHeaders), credentials);

        throw new Error(
          `Pagination configuration error: The first two API requests returned identical responses with valid data. ` +
          `This indicates the pagination parameters are not being applied correctly. ` +
          `Please check your pagination configuration (type: ${config.pagination?.type}, pageSize: ${config.pagination?.pageSize}), ` +
          `body: ${maskedBody}, queryParams: ${maskedParams}, headers: ${maskedHeaders}.`
        );
      }

      if (loopCounter === 1 && !hasValidData && !currentHasData) {
        throw new Error(
          `Stop condition error: The API returned no data on the first request, but the stop condition did not terminate pagination. ` +
          `The stop condition should detect empty responses and stop immediately. ` +
          `Current stop condition: ${(config.pagination as any).stopCondition}`
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
          (config.pagination as any).stopCondition,
          { ...lastResponse, data: parsedResponseData },
          pageInfo
        );

        if (stopEval.error) {
          throw new Error(
            `Pagination stop condition error: ${stopEval.error}\n` +
            `Stop condition: ${(config.pagination as any).stopCondition}`
          );
        }

        hasMore = !stopEval.shouldStop;
      }

      previousResponseHash = currentResponseHash;

      if (Array.isArray(parsedResponseData)) {
        allResults = allResults.concat(parsedResponseData);
      } else if (!config.dataPath) {
        allResults = smartMergeResponses(allResults, parsedResponseData);
      }
      else if (parsedResponseData) {
        allResults.push(parsedResponseData);
      }
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

    if (config.pagination?.type === PaginationType.PAGE_BASED) {
      page++;
    } else if (config.pagination?.type === PaginationType.OFFSET_BASED) {
      offset += parseInt(config.pagination?.pageSize || "50");
    } else if (config.pagination?.type === PaginationType.CURSOR_BASED) {
      const cursorPath = config.pagination?.cursorPath || 'next_cursor';
      const jsonPath = cursorPath.startsWith('$') ? cursorPath : `$.${cursorPath}`;
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
    headers: lastResponse.headers
  };
}

export async function evaluateStopCondition(
  stopConditionCode: string,
  response: AxiosResponse,
  pageInfo: { page: number; offset: number; cursor: any; totalFetched: number }
): Promise<{ shouldStop: boolean; error?: string }> {


  const isolate = new ivm.Isolate({ memoryLimit: 4096 });

  try {
    const context = await isolate.createContext();

    // Inject the response and pageInfo as JSON strings
    // legacy support for direct response data access
    await context.global.set('responseJSON', JSON.stringify({ data: response.data, headers: response.headers }));
    await context.global.set('pageInfoJSON', JSON.stringify(pageInfo));

    // if the stop condition code starts with return or is not a function, we need to wrap it in a function
    if (stopConditionCode.startsWith("return")) {
      stopConditionCode = `(response, pageInfo) => { ${stopConditionCode} }`;
    }
    else if (!stopConditionCode.startsWith("(response")) {
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
        error: helpfulError
      };
    } finally {
      try {
        isolate.dispose();
      } catch (error) {
        console.error("Error disposing isolate", error);
      }
    }
  }