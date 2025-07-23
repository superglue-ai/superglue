import { type ApiConfig, FileType, PaginationType, type RequestOptions } from "@superglue/client";
import type { AxiosRequestConfig } from "axios";
import OpenAI from "openai";
import { JSONSchema } from "openai/lib/jsonschema.mjs";
import { LanguageModel } from "../llm/llm.js";
import { parseFile } from "./file.js";
import { callPostgres } from "./postgres.js";
import { callAxios, composeUrl, evaluateStopCondition, replaceVariables, sample } from "./tools.js";

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

export async function callEndpoint(endpoint: ApiConfig, payload: Record<string, any>, credentials: Record<string, any>, options: RequestOptions): Promise<{ data: any; }> {

  const allVariables = { ...payload, ...credentials };

  let allResults = [];
  let page = 1;
  let offset = 0;
  let cursor = null;
  let hasMore = true;
  let loopCounter = 0;
  let seenResponseHashes = new Set<string>();
  const MAX_PAGINATION_REQUESTS = 1000;

  while (hasMore && loopCounter < MAX_PAGINATION_REQUESTS) {
    // Generate pagination variables
    let paginationVars = {
      page,
      offset,
      cursor,
      limit: endpoint.pagination?.pageSize || "50",
      pageSize: endpoint.pagination?.pageSize || "50"
    };

    // Combine all variables
    const requestVars = { ...paginationVars, ...allVariables };

    // Generate request parameters with variables replaced
    const headers = Object.fromEntries(
      (await Promise.all(
        Object.entries(endpoint.headers || {})
          .map(async ([key, value]) => [key, await replaceVariables(value, requestVars)])
      )).filter(([_, value]) => value && value !== "undefined" && value !== "null")
    );

    // Process headers for Auth
    const processedHeaders = {};
    for (const [key, value] of Object.entries(headers)) {
      let processedValue = value;
      // Remove duplicate auth prefixes (e.g. "Basic Basic " or "Bearer Bearer ")
      if (key.toLowerCase() === 'authorization' && typeof value === 'string') {
        processedValue = value.replace(/^(Basic|Bearer)\s+(Basic|Bearer)\s+/, '$1 $2');
      }
      // Convert Basic Auth to Base64
      if (key.toLowerCase() === 'authorization' && typeof processedValue === 'string' && processedValue.startsWith('Basic ')) {
        processedValue = convertBasicAuthToBase64(processedValue);
      }

      processedHeaders[key] = processedValue;
    }

    const queryParams = Object.fromEntries(
      (await Promise.all(
        Object.entries(endpoint.queryParams || {})
          .map(async ([key, value]) => [key, await replaceVariables(value, requestVars)])
      )).filter(([_, value]) => value && value !== "undefined" && value !== "null")
    );

    const body = endpoint.body ?
      await replaceVariables(endpoint.body, requestVars) :
      "";

    // Replace variables in urlHost and urlPath separately
    const replacedUrlHost = await replaceVariables(endpoint.urlHost, requestVars);
    const replacedUrlPath = await replaceVariables(endpoint.urlPath, requestVars);

    // Check for postgres BEFORE composing URL (which would add https://)
    if (replacedUrlHost.startsWith("postgres://") || replacedUrlHost.startsWith("postgresql://")) {
      return { data: await callPostgres(endpoint, payload, credentials, options) };
    }

    // For non-postgres endpoints, compose the URL normally
    const url = composeUrl(replacedUrlHost, replacedUrlPath);

    const axiosConfig: AxiosRequestConfig = {
      method: endpoint.method,
      url: url,
      headers: processedHeaders,
      data: body,
      params: queryParams,
      timeout: options?.timeout || 60000,
    };

    const response = await callAxios(axiosConfig, options);

    if (![200, 201, 202, 203, 204, 205].includes(response?.status) ||
      response.data?.error ||
      (Array.isArray(response?.data?.errors) && response?.data?.errors.length > 0)
    ) {
      const error = JSON.stringify(response?.data?.error || response.data?.errors || response?.data || response?.statusText || "undefined");
      let message = `${endpoint.method} ${url} failed with status ${response.status}.
Response: ${String(error).slice(0, 1000)}`;

      // Add specific context for rate limit errors
      if (response.status === 429) {
        const retryAfter = response.headers['retry-after']
          ? `Retry-After: ${response.headers['retry-after']}`
          : 'No Retry-After header provided';

        message = `Rate limit exceeded. ${retryAfter}. Maximum wait time of 60s exceeded. 
        
        ${message}`;
      }

      throw new Error(`API call failed with status ${response.status}. Response: ${message}`);
    }
    if (typeof response.data === 'string' &&
      (response.data.slice(0, 100).trim().toLowerCase().startsWith('<!doctype html') ||
        response.data.slice(0, 100).trim().toLowerCase().startsWith('<html'))) {
      throw new Error(`Received HTML response instead of expected JSON data from ${url}. 
        This usually indicates an error page or invalid endpoint.\nResponse: ${response.data.slice(0, 2000)}`);
    }

    let dataPathSuccess = true;

    // TODO: we need to remove the data path and just join the data with the next page of data, otherwise we will have to do a lot of gymnastics to get the data path right

    let responseData = response.data;

    if (responseData && typeof responseData === 'string') {
      responseData = await parseFile(Buffer.from(responseData), FileType.AUTO);
    }

    if (endpoint.dataPath) {
      // Navigate to the specified data path
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

    // Handle pagination based on stop condition
    if (endpoint.pagination && (endpoint.pagination as any).stopCondition) {
      // Evaluate stop condition
      const pageInfo = {
        page,
        offset,
        cursor,
        totalFetched: allResults.length
      };

      const stopEval = await evaluateStopCondition(
        (endpoint.pagination as any).stopCondition,
        response.data,
        pageInfo
      );

      if (stopEval.error) {
        throw new Error(`Pagination stop condition error: ${stopEval.error}\nStop condition: ${(endpoint.pagination as any).stopCondition}`);
      }

      hasMore = !stopEval.shouldStop;
    } else {
      // Legacy pagination logic - only used if no stop condition is provided
      if (Array.isArray(responseData)) {
        const pageSize = parseInt(endpoint.pagination?.pageSize || "50");
        if (!pageSize || responseData.length < pageSize) {
          hasMore = false;
        }
        const currentResponseHash = JSON.stringify(responseData);
        if (!seenResponseHashes.has(currentResponseHash)) {
          seenResponseHashes.add(currentResponseHash);
          allResults = allResults.concat(responseData);
        }
        else {
          hasMore = false;
        }
      }
      else if (responseData && allResults.length === 0) {
        allResults.push(responseData);
        hasMore = false;
      }
      else {
        hasMore = false;
      }
    }

    // update pagination variables
    if (hasMore && endpoint.pagination?.type === PaginationType.PAGE_BASED) {
      page++;
    }
    else if (hasMore && endpoint.pagination?.type === PaginationType.OFFSET_BASED) {
      offset += parseInt(endpoint.pagination?.pageSize || "50");
    }
    else if (hasMore && endpoint.pagination?.type === PaginationType.CURSOR_BASED) {
      const cursorParts = (endpoint.pagination?.cursorPath || 'next_cursor').split('.');
      let nextCursor = response.data;
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

  if (loopCounter >= MAX_PAGINATION_REQUESTS && hasMore) {
    throw new Error(
      `Pagination limit exceeded: Made ${MAX_PAGINATION_REQUESTS} requests but pagination stop condition still not met. ` +
      `This may indicate an issue with the stop condition or an API that returns infinite results. ` +
      `Stop condition: ${(endpoint.pagination as any)?.stopCondition || 'Not provided'}`
    );
  }

  if (endpoint.pagination?.type === PaginationType.CURSOR_BASED) {
    return {
      data: {
        next_cursor: cursor,
        ...(Array.isArray(allResults) ? { results: allResults } : allResults)
      }
    };
  }

  return {
    data: allResults?.length === 1 ? allResults[0] : allResults
  };
}

export async function evaluateResponse(
  data: any,
  responseSchema: JSONSchema,
  instruction: string,
  documentation?: string
): Promise<{ success: boolean, refactorNeeded: boolean, shortReason: string; }> {
  let content = JSON.stringify(data);
  if (content.length > LanguageModel.contextLength / 2) {
    content = JSON.stringify(sample(data, 10)) + "\n\n...truncated...";
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
- Always consider the instruction type and consult the API documentation when provided to understand expected response patterns
- Do not assume empty responses are failures without checking the operation context

Do not make the mistake of thinking that the { success: true, shortReason: "", refactorNeeded: false } is the expected API response format. It is YOUR expected response format.
Keep in mind that the response can come in any shape or form, just validate that the response aligns with the instruction.
If the instruction contains a filter and the response contains data not matching the filter, return { success: true, refactorNeeded: true, shortReason: "Only results matching the filter XXX" }.
If the reponse is valid but hard to comprehend, return { success: true, refactorNeeded: true, shortReason: "The response is valid but hard to comprehend. Please refactor the instruction to make it easier to understand." }.
E.g. if the response is something like { "data": { "products": [{"id": 1, "name": "Product 1"}, {"id": 2, "name": "Product 2"}] } }, no refactoring is needed.
If the response reads something like [ "12/2", "22.2", "frejgeiorjgrdelo"] that makes it very hard to parse the required information of the instruction, refactoring is needed. 
If the response needs to be grouped or sorted or aggregated, this will be handled in a later step, so the appropriate response for you is to return { success: true, refactorNeeded: false, shortReason: "" }.
Refactoring is NOT needed if the response contains extra fields or needs to be grouped.

Instruction: ${instruction}${documentationContext}`
    },
    { role: "user", content: `API Response: ${content}` }
  ] as OpenAI.Chat.ChatCompletionMessageParam[];

  const response = await LanguageModel.generateObject(
    request,
    { type: "object", properties: { success: { type: "boolean" }, refactorNeeded: { type: "boolean" }, shortReason: { type: "string" } } },
    0
  );
  return response.response;
}