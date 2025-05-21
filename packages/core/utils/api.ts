import { type ApiConfig, AuthType, FileType, HttpMethod, PaginationType, type RequestOptions } from "@superglue/client";
import type { AxiosRequestConfig } from "axios";
import OpenAI from "openai";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { callAxios, composeUrl, generateId, replaceVariables } from "./tools.js";
import { API_PROMPT } from "../llm/prompts.js";
import { logMessage } from "./logs.js";
import { parseFile, parseXML } from "./file.js";
import { LanguageModel } from "../llm/llm.js";
import { callPostgres } from "./postgres.js";
import { error } from "console";
import { JSONSchema } from "openai/lib/jsonschema.mjs";

export function convertBasicAuthToBase64(headerValue: string){
    if(!headerValue) return headerValue;
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

export async function callEndpoint(endpoint: ApiConfig, payload: Record<string, any>, credentials: Record<string, any>, options: RequestOptions): Promise<{ data: any }> {  
  if(endpoint.urlHost.startsWith("postgres")) {
    return await callPostgres(endpoint, payload, credentials, options);
  }
  
  const allVariables = { ...payload, ...credentials };
  
  let allResults = [];
  let page = 1;
  let offset = 0;
  let cursor = null;
  let hasMore = true;
  let loopCounter = 0;
  let seenResponseHashes = new Set<string>();

  while (hasMore && loopCounter < 500) {
    // Generate pagination variables if enabled
    let paginationVars = {};
    switch (endpoint.pagination?.type) {
      case PaginationType.PAGE_BASED:
        const pageSize = endpoint.pagination?.pageSize || "50";
        paginationVars = { page, limit: pageSize, pageSize: pageSize };
        break;
      case PaginationType.OFFSET_BASED:
        const offsetPageSize = endpoint.pagination?.pageSize || "50";
        paginationVars = { offset, limit: offsetPageSize, pageSize: offsetPageSize };
        break;
      case PaginationType.CURSOR_BASED:
        const cursorPageSize = endpoint.pagination?.pageSize || "50";
        paginationVars = { cursor: cursor, limit: cursorPageSize, pageSize: cursorPageSize };
        break;
      default:
        hasMore = false;
        break;
    }

    // Combine all variables
    const requestVars = { ...paginationVars, ...allVariables };

    // Check for any {var} in the generated config that isn't in available variables
    //const invalidVars = validateVariables(endpoint, Object.keys(requestVars));
    
    //if (invalidVars.length > 0) {
    //  throw new Error(`The following variables are not defined: ${invalidVars.join(', ')}`);  
    //}

    // Generate request parameters with variables replaced
    const headers = Object.fromEntries(
      (await Promise.all(
        Object.entries(endpoint.headers || {})
          .map(async ([key, value]) => [key, await replaceVariables(value, requestVars)])
      )).filter(([_, value]) => value && value !== "undefined" && value !== "null")
    );

    // Process headers for Basic Auth
    const processedHeaders = {};
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === 'authorization' && typeof value === 'string' && value.startsWith('Basic ')) {
        processedHeaders[key] = convertBasicAuthToBase64(value);
      } else {
        processedHeaders[key] = value;
      }
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

    const url = await replaceVariables(composeUrl(endpoint.urlHost, endpoint.urlPath), requestVars);

    const axiosConfig: AxiosRequestConfig = {
      method: endpoint.method,
      url: url,
      headers: processedHeaders,
      data: body,
      params: queryParams,
      timeout: options?.timeout || 60000,
    };

    const response = await callAxios(axiosConfig, options);

    if(![200, 201, 204].includes(response?.status) || 
        response.data?.error || 
        (Array.isArray(response?.data?.errors) && response?.data?.errors.length > 0)
      ) {
      const error = JSON.stringify(response?.data?.error || response.data?.errors || response?.data || response?.statusText || "undefined");
      let message = `${endpoint.method} ${url} failed with status ${response.status}.
Response: ${String(error).slice(0, 1000)}
config: ${JSON.stringify(axiosConfig)}`;
      
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

    if(responseData && typeof responseData === 'string') {
      responseData = await parseFile(Buffer.from(responseData), FileType.AUTO);
    }

    if (endpoint.dataPath) {
      // Navigate to the specified data path
      const pathParts = endpoint.dataPath.split('.');

      for (const part of pathParts) {
        // sometimes a jsonata expression is used to get the data, so ignore the $
        // TODO: fix this later
        if(!responseData[part] && part !== '$') {
          dataPathSuccess = false;
          break;
        }
        responseData = responseData[part] || responseData;  
      }
    }
    
    if (Array.isArray(responseData)) {
      const pageSize = parseInt(endpoint.pagination?.pageSize || "50");
      if(!pageSize || responseData.length < pageSize) {
        hasMore = false;
      }
      const currentResponseHash = JSON.stringify(responseData);
      if(!seenResponseHashes.has(currentResponseHash)) {
        seenResponseHashes.add(currentResponseHash);
        allResults = allResults.concat(responseData);
      }
      else {
        hasMore = false;
      }
    } 
    else if(responseData && allResults.length === 0) {
      allResults.push(responseData);
      hasMore = false;
    }
    else {
      hasMore = false;
    }

    // update pagination
    if(endpoint.pagination?.type === PaginationType.PAGE_BASED) {
      page++;
    }
    else if(endpoint.pagination?.type === PaginationType.OFFSET_BASED) {
      offset += parseInt(endpoint.pagination?.pageSize || "50");
    }
    else if (endpoint.pagination?.type === PaginationType.CURSOR_BASED) {
        const cursorParts = (endpoint.pagination?.cursorPath || 'next_cursor').split('.');
        let nextCursor = response.data;
        for (const part of cursorParts) {
          nextCursor = nextCursor?.[part];
        }
        cursor = nextCursor;
        if(!cursor) {
          hasMore = false;
        }
    }
    loopCounter++;
  }

  if(endpoint.pagination?.type === PaginationType.CURSOR_BASED) {
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

export async function generateApiConfig(
  apiConfig: Partial<ApiConfig>, 
  documentation: string, 
  payload: Record<string, any>, 
  credentials: Record<string, any>, 
  retryCount = 0,
  messages: OpenAI.Chat.ChatCompletionMessageParam[] = []
): Promise<{ config: ApiConfig; messages: OpenAI.Chat.ChatCompletionMessageParam[] }> {
  const schema = zodToJsonSchema(z.object({
    urlHost: z.string(),
    urlPath: z.string(),
    queryParams: z.array(z.object({
      key: z.string(),
      value: z.string()
    })).optional(),
    method: z.enum(Object.values(HttpMethod) as [string, ...string[]]),
    headers: z.array(z.object({
      key: z.string(),
      value: z.string()
    })).optional(),
    body: z.string().optional().describe("Format as JSON if not instructed otherwise. Use <<>> to access variables."),
    authentication: z.enum(Object.values(AuthType) as [string, ...string[]]),
    dataPath: z.string().optional().describe("The path to the data you want to extract from the response. E.g. products.variants.size"),
    pagination: z.object({
      type: z.enum(Object.values(PaginationType) as [string, ...string[]]),
      pageSize: z.string().describe("Number of items per page. Set this to a number. In headers or query params, you can access it as {limit}."),
      cursorPath: z.string().optional().describe("If cursor_based: The path to the cursor in the response. E.g. cursor.current or next_cursor")
    }).optional()
  }));
  const availableVariables = [
    ...Object.keys(credentials || {}),
    ...Object.keys(payload || {}),
  ].map(v => `{${v}}`).join(", ");
  const userPrompt = `Generate API configuration for the following:

Instructions: ${apiConfig.instruction}

Base URL: ${composeUrl(apiConfig.urlHost, apiConfig.urlPath)}

${Object.values(apiConfig).filter(Boolean).length > 0 ? "Also, the user provided the following information, which is probably correct. Ensure to at least try where it makes sense: " : ""}
${apiConfig.headers ? `Headers: ${JSON.stringify(apiConfig.headers)}` : ""}
${apiConfig.queryParams ? `Query Params: ${JSON.stringify(apiConfig.queryParams)}` : ""}
${apiConfig.body ? `Body: ${JSON.stringify(apiConfig.body)}` : ''}
${apiConfig.authentication ? `Authentication: ${apiConfig.authentication}` : ''}
${apiConfig.dataPath ? `Data Path: ${apiConfig.dataPath}` : ''}
${apiConfig.pagination ? `Pagination: ${JSON.stringify(apiConfig.pagination)}` : ''}
${apiConfig.method ? `Method: ${apiConfig.method}` : ''}

Available variables: ${availableVariables}
Available pagination variables (if pagination is enabled): page, pageSize, offset, cursor, limit
Example payload: ${JSON.stringify(payload || {})}

Documentation: ${String(documentation)}`;

  if(messages.length === 0) {
    messages.push({
      role: "system",
      content: API_PROMPT
    });
    messages.push({
      role: "user",
      content: userPrompt
    });
  }
  const temperature = Math.min(retryCount * 0.2, 1);
  const {response: generatedConfig, messages: updatedMessages} = await LanguageModel.generateObject(messages, schema, temperature);
  
  return {
    config: {
      instruction: apiConfig.instruction,
      urlHost: generatedConfig.urlHost,
      urlPath: generatedConfig.urlPath,
      method: generatedConfig.method,
      queryParams: generatedConfig.queryParams ? Object.fromEntries(generatedConfig.queryParams.map(p => [p.key, p.value])) : undefined,
      headers: generatedConfig.headers ? Object.fromEntries(generatedConfig.headers.map(p => [p.key, p.value])) : undefined,
      body: generatedConfig.body,
      authentication: generatedConfig.authentication,
      pagination: generatedConfig.pagination,
      dataPath: generatedConfig.dataPath,
      documentationUrl: apiConfig.documentationUrl,
      responseSchema: apiConfig.responseSchema,
      responseMapping: apiConfig.responseMapping,
      createdAt: apiConfig.createdAt || new Date(),
      updatedAt: new Date(),
      id: apiConfig.id || generateId(generatedConfig.urlHost, generatedConfig.urlPath),
    } as ApiConfig,
    messages: updatedMessages
  };
}

export async function evaluateResponse(data: any, responseSchema: JSONSchema, instruction: string): Promise<{success: boolean, refactorNeeded: boolean, shortReason: string}> {
  const request = [
    {
      role: "system",
      content: `You are an API response validator. 
Validate the following api response and return { success: true, shortReason: "", refactorNeeded: false } if the response aligns with the instruction. 
If the response does not align with the instruction, return { success: false, shortReason: "reason why it does not align", refactorNeeded: false }.

Do not make the mistake of thinking that the { success: true, shortReason: "", refactorNeeded: false } is the expected API response format. It is YOUR expected response format.
Keep in mind that the response can come in any shape or form, just validate that the response aligns with the instruction.
If the instruction contains a filter and the response contains data not matching the filter, return { success: true, refactorNeeded: true, shortReason: "Only results matching the filter XXX" }.
If the reponse is valid but hard to comprehend, return { success: true, refactorNeeded: true, shortReason: "The response is valid but hard to comprehend. Please refactor the instruction to make it easier to understand." }.
E.g. if the response is something like { "data": { "products": [{"id": 1, "name": "Product 1"}, {"id": 2, "name": "Product 2"}] } }, no refactoring is needed.
If the response reads something like [ "12/2", "22.2", "frejgeiorjgrdelo"] that makes it very hard to parse the required information of the instruction, refactoring is needed. 
Instruction: ${instruction}`
    },
    {role: "user", content: JSON.stringify(data)}
  ] as OpenAI.Chat.ChatCompletionMessageParam[];

  const response = await LanguageModel.generateObject(
    request,
    {type: "object", properties: {success: {type: "boolean"}, refactorNeeded: {type: "boolean"}, shortReason: {type: "string"}}},
    0
  );
  return response.response;
}