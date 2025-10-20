import { ApiConfig, FileType, PaginationType } from "@superglue/client";
import { AxiosRequestConfig, AxiosResponse } from "axios";
import { RequestOptions } from "http";
import ivm from "isolated-vm";
import { server_defaults } from "../default.js";
import { parseFile } from "../utils/file.js";
import { composeUrl, maskCredentials, replaceVariables } from "../utils/tools.js";
import { callFTP } from "./ftp.js";
import { ApiCallError, callAxios, handle2xxStatus, handle429Status, handleErrorStatus } from "./http.js";
import { callPostgres } from "./postgres.js";

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
  
export async function callEndpointLegacyImplementation({ endpoint, payload, credentials, options }: { endpoint: ApiConfig, payload: Record<string, any>, credentials: Record<string, any>, options: RequestOptions }): Promise<{ data: any; statusCode: number; headers: Record<string, any>; }> {
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
        const connectionString = `${processedUrlHost}/${processedUrlPath}`;
        const body = typeof processedBody === 'string' ? JSON.parse(processedBody) : processedBody;
        const query = body.query;
        const params = body.params || body.values;
        
        return { data: await callPostgres({ connectionString, query, params, credentials, options }), statusCode: 200, headers: {} };
      }
  
      if (processedUrlHost.startsWith("ftp://") || processedUrlHost.startsWith("ftps://") || processedUrlHost.startsWith("sftp://")) {
        return { data: await callFTP({ operation: endpoint.body, credentials, options }), statusCode: 200, headers: {} };
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
  
      const axiosResult = await callAxios(axiosConfig, options);
      lastResponse = axiosResult.response;
    
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
          const maskedBody = maskCredentials(processedBody, credentials);
          const maskedParams = maskCredentials(JSON.stringify(processedQueryParams), credentials);
          const maskedHeaders = maskCredentials(JSON.stringify(processedHeaders), credentials);
  
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
  
  export async function evaluateStopCondition(
    stopConditionCode: string,
    response: AxiosResponse,
    pageInfo: { page: number; offset: number; cursor: any; totalFetched: number }
  ): Promise<{ shouldStop: boolean; error?: string }> {
  
  
    const isolate = new ivm.Isolate({ memoryLimit: 128 });
  
    try {
      const context = await isolate.createContext();
  
      // Inject the response and pageInfo as JSON strings
      // legacy support for direct response data access
      await context.global.set('responseJSON', JSON.stringify({ data: response.data, headers: response.headers, ...response.data }));
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
