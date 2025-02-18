import { ApiConfig, ApiInput, AuthType, HttpMethod, PaginationType, RequestOptions } from "@superglue/shared";
import { AxiosRequestConfig } from "axios";
import OpenAI from "openai";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { getDocumentation } from "./documentation.js";
import { API_PROMPT } from "./prompts.js";
import { callAxios, composeUrl, replaceVariables } from "./tools.js";


export async function prepareEndpoint(
  endpointInput: ApiInput, 
  payload: any, 
  credentials: any, 
  lastError: string | null = null,
  previousMessages: OpenAI.Chat.ChatCompletionMessageParam[] = []
): Promise<{ config: ApiConfig; messages: OpenAI.Chat.ChatCompletionMessageParam[] }> {
    // Set the current timestamp
    const currentTime = new Date();

    // Initialize the ApiCallConfig object with provided input
    let apiCallConfig: Partial<ApiConfig> = { 
      ...endpointInput,
      createdAt: currentTime,
      updatedAt: currentTime,
      id: crypto.randomUUID()
    };

    // If a documentation URL is provided, fetch and parse additional details
    const documentation = await getDocumentation(apiCallConfig.documentationUrl || composeUrl(apiCallConfig.urlHost, apiCallConfig.urlPath), apiCallConfig.headers, apiCallConfig.queryParams, apiCallConfig?.urlPath);

    const availableVars = [...Object.keys(payload || {}), ...Object.keys(credentials || {})];
    const computedApiCallConfig = await generateApiConfig(apiCallConfig, documentation, availableVars, lastError, previousMessages);
    
    return computedApiCallConfig;
}

export async function callEndpoint(endpoint: ApiConfig, payload: Record<string, any>, credentials: Record<string, any>, options: RequestOptions): Promise<any> {  
  const allVariables = { ...payload, ...credentials };
  
  let allResults = [];
  let page = 1;
  let offset = 0;
  let hasMore = true;
  let loopCounter = 0;

  while (hasMore && loopCounter <= 500) {
    // Generate pagination variables if enabled
    let paginationVars = {};
    if (endpoint.pagination?.type === PaginationType.PAGE_BASED) {
      paginationVars = { page, limit: endpoint.pagination?.pageSize || 50 };
      page++;
    } else if (endpoint.pagination?.type === PaginationType.OFFSET_BASED) {
      paginationVars = { offset, limit: endpoint.pagination?.pageSize || 50 };
      offset += endpoint.pagination?.pageSize || 50;
    }
    else {
      hasMore = false;
    }

    // Combine all variables
    const requestVars = { ...paginationVars, ...allVariables };

    // Generate request parameters with variables replaced
    const headers = Object.fromEntries(
      Object.entries(endpoint.headers || {})
        .map(([key, value]) => [key, replaceVariables(value, requestVars)])
    );

    const queryParams = Object.fromEntries(
      Object.entries(endpoint.queryParams || {})
        .map(([key, value]) => [key, replaceVariables(value, requestVars)])
    );

    const body = endpoint.body ? 
      JSON.parse(replaceVariables(endpoint.body, requestVars)) : 
      {};

    const url = composeUrl(endpoint.urlHost, endpoint.urlPath);
    const axiosConfig: AxiosRequestConfig = {
      method: endpoint.method,
      url: url,
      headers,
      data: body,
      params: queryParams,
      timeout: options?.timeout || 60000,
    };

    console.log(`${endpoint.method} ${url}`);
    const response = await callAxios(axiosConfig, options);

    if(![200, 201, 204].includes(response?.status) || response.data?.error) {
      const error = JSON.stringify(response?.data?.error || response?.data);
      const message = `${endpoint.method} ${url} failed with status ${response.status}. Response: ${error}
      Headers: ${JSON.stringify(headers)}
      Body: ${JSON.stringify(body)}
      Params: ${JSON.stringify(queryParams)}
      `;
      throw new Error(`API call failed with status ${response.status}. Response: ${message}`);
    }
    if (typeof response.data === 'string' && 
      (response.data.slice(0, 100).trim().toLowerCase().startsWith('<!doctype html') || 
       response.data.slice(0, 100).trim().toLowerCase().startsWith('<html'))) {
      throw new Error(`Received HTML response instead of expected JSON data from ${url}. 
        This usually indicates an error page or invalid endpoint.\nResponse: ${response.data.slice(0, 2000)}`);
    }

    let responseData = response.data;
    let dataPathSuccess = true;
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
      if(responseData.length < endpoint.pagination?.pageSize) {
        hasMore = false;
      }
      
      if(JSON.stringify(responseData) !== JSON.stringify(allResults)) {
        allResults = allResults.concat(responseData);
      }
      else {
        hasMore = false;
      }
    } 
    else if(responseData && dataPathSuccess) {
      allResults.push(responseData);
      hasMore = false;
    }
    else {
      hasMore = false;
    }
    loopCounter++;
  }

  return {
    data: allResults
  };
}

async function generateApiConfig(
  apiConfig: Partial<ApiConfig>, 
  documentation: string, 
  vars: string[] = [], 
  lastError: string | null = null,
  previousMessages: OpenAI.Chat.ChatCompletionMessageParam[] = []
): Promise<{ config: ApiConfig; messages: OpenAI.Chat.ChatCompletionMessageParam[] }> {
  console.log("Generating API config for " + apiConfig.urlHost);
  const schema = zodToJsonSchema(z.object({
    urlHost: z.string(),
    urlPath: z.string(),
    queryParams: z.record(z.any()).optional(),
    method: z.enum(Object.values(HttpMethod) as [string, ...string[]]),
    headers: z.record(z.string()).optional(),
    body: z.string().optional().describe("Format as JSON if not instructed otherwise."),
    authentication: z.enum(Object.values(AuthType) as [string, ...string[]]),
    dataPath: z.string().optional().describe("The path to the data you want to extract from the response. E.g. products.variants.size"),
    pagination: z.object({
      type: z.enum(Object.values(PaginationType) as [string, ...string[]]),
      pageSize: z.number().describe("Number of items per page. Use as {limit} in the pagination variables"),
    }).optional()
  }));
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  const userProvidedAdditionalInfo = Boolean(
    apiConfig.headers ||
    apiConfig.queryParams ||
    apiConfig.body ||
    apiConfig.authentication ||
    apiConfig.dataPath ||
    apiConfig.pagination ||
    apiConfig.method
  );

  const initialUserMessage: OpenAI.Chat.ChatCompletionUserMessageParam = {
    role: "user", 
    content: 
`Generate API configuration for the following:

Instructions: ${apiConfig.instruction}

Base URL: ${composeUrl(apiConfig.urlHost, apiConfig.urlPath)}

${userProvidedAdditionalInfo ? `Also, the user provided the following information, which is probably correct: ` : ''}
${userProvidedAdditionalInfo ? `Ensure to use the provided information. You must try them at least where they make sense.` : ''}
${apiConfig.headers ? `Headers: ${JSON.stringify(apiConfig.headers)}` : ''}
${apiConfig.queryParams ? `Query Params: ${JSON.stringify(apiConfig.queryParams)}` : ''}
${apiConfig.body ? `Body: ${JSON.stringify(apiConfig.body)}` : ''}
${apiConfig.authentication ? `Authentication: ${apiConfig.authentication}` : ''}
${apiConfig.dataPath ? `Data Path: ${apiConfig.dataPath}` : ''}
${apiConfig.pagination ? `Pagination: ${JSON.stringify(apiConfig.pagination)}` : ''}
${apiConfig.method ? `Method: ${apiConfig.method}` : ''}

Available variables: ${vars.join(", ")}

Documentation: ${String(documentation).slice(0, 80000)}
`
  }


  const subsequentUserMessage: OpenAI.Chat.ChatCompletionUserMessageParam = {
    role: "user",
    content: 
`You made an error, the configuration you generated was incorrect and failed with the following error: ${lastError}

The previous configuration was: ${JSON.stringify(apiConfig)}.

In case of a 401 error, please pay special attention to the authentication type and headers.

You will get to try again, so feel free to experiment and iterate on the configuration.
Make sure to try a fix before generating a new configuration. I will loose my job if I don't get this right.`
  }

  const systemMessage: OpenAI.Chat.ChatCompletionSystemMessageParam = {
    role: "system",
    content: API_PROMPT
  };

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = previousMessages.length > 0 
    ? [...previousMessages, subsequentUserMessage]
    : [systemMessage, initialUserMessage];

  const numInitialMessages = 2;
  const retryCount = previousMessages.length > 0 ? (messages.length - numInitialMessages) / 2 : 0;
  const temperature = Math.min(retryCount * 0.1, 0.7);

  console.log(`Attempt ${retryCount + 1} with temperature ${temperature}`);

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL,
    temperature,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "api_definition",
        schema: schema,
      }
    },
    messages
  });

  const generatedConfig = JSON.parse(completion.choices[0].message.content);
  
  // Add the assistant's response to messages for future context
  messages.push({
    role: "assistant",
    content: completion.choices[0].message.content
  });

  // Check for any {var} in the generated config that isn't in available variables
  const invalidVars = validateVariables(generatedConfig, vars);
  
  if (invalidVars.length > 0) {
    throw new Error(`Generated config contains variables that are not available. Please remove them: ${invalidVars.join(', ')}`);
  }

  return {
    config: {
      // we want to iterate, therefore we only use the generated config
      instruction: apiConfig.instruction,
      urlHost: generatedConfig.urlHost,
      urlPath: generatedConfig.urlPath,
      method: generatedConfig.method,
      queryParams: generatedConfig.queryParams,
      headers: generatedConfig.headers,
      body: generatedConfig.body,
      authentication: generatedConfig.authentication,
      // TODO: pagination, dataPath are not currently modified?
      pagination: apiConfig.pagination || generatedConfig.pagination,
      dataPath: apiConfig.dataPath || generatedConfig.dataPath,
      documentationUrl: apiConfig.documentationUrl,
      responseSchema: apiConfig.responseSchema,
      responseMapping: apiConfig.responseMapping,
      createdAt: apiConfig.createdAt || new Date(),
      updatedAt: new Date(),
      id: apiConfig.id,
    } as ApiConfig,
    messages
  };
}

function validateVariables(generatedConfig: any, vars: string[]) {
  vars = [
    ...vars,
    "page",
    "limit",
    "offset"
  ]
  
  // Helper function to find only template variables in a string
  const findTemplateVars = (str: string) => {
    if (!str) return [];
    // Only match {varName} patterns that aren't within JSON quotes
    const matches = str.match(/\{(\w+)\}/g) || [];
    return matches.map(match => match.slice(1, -1));
  };

  const varMatches = [
    generatedConfig.urlPath,
    ...Object.values(generatedConfig.queryParams || {}),
    ...Object.values(generatedConfig.headers || {}),
    generatedConfig.body
  ].flatMap(value => findTemplateVars(String(value)));

  const invalidVars = varMatches.filter(v => !vars.includes(v));
  return invalidVars;
}
