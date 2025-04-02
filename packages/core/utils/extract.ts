import axios, { AxiosRequestConfig } from "axios";
import {  AuthType, RequestOptions, DecompressionMethod, ExtractConfig, ExtractInput, FileType, HttpMethod, Metadata } from "@superglue/shared";
import { callAxios, composeUrl, getSchemaFromData, replaceVariables } from "./tools.js";
import { z } from "zod";
import OpenAI from "openai";
import { zodToJsonSchema } from "zod-to-json-schema";
import { API_PROMPT } from "./prompts.js";
import { getDocumentation } from "./documentation.js";
import { decompressData, parseFile } from "./file.js";
import { createHash } from "crypto";
import { logMessage } from "./logs.js";

export async function prepareExtract(extractInput: ExtractInput, payload: any, credentials: any, lastError: string | null = null): Promise<ExtractConfig> {
    // Set the current timestamp
    const currentTime = new Date();

    // Initialize the ApiCallConfig object with provided input
    const hash = createHash('md5')
      .update(JSON.stringify({request: extractInput, payloadKeys: getSchemaFromData(payload)}))
      .digest('hex');
    let extractConfig: Partial<ExtractConfig> = { 
      ...extractInput,
      createdAt: currentTime,
      updatedAt: currentTime,
      id: hash,
    };

    // If a documentation URL is provided, fetch and parse additional details
    const documentation = await getDocumentation(extractConfig.documentationUrl, extractConfig.headers, extractConfig.queryParams);

    const availableVars = [...Object.keys(payload || {}), ...Object.keys(credentials || {})];
    const computedExtractConfig = await generateExtractConfig(extractConfig, documentation, availableVars, lastError);
    
    return computedExtractConfig;
}

export async function callExtract(extract: ExtractConfig, payload: Record<string, any>, credentials: Record<string, any>, options: RequestOptions, metadata?: Metadata): Promise<any> {
  const allVariables = { ...payload, ...credentials };
  const headers = Object.fromEntries(
    Object.entries(extract.headers || {}).map(([key, value]) => [key, replaceVariables(value, allVariables)])
  ) as Record<string, string>;
  const queryParams = Object.fromEntries(
    Object.entries(extract.queryParams || {}).map(([key, value]) => [key, replaceVariables(value, allVariables)])
  ) as Record<string, string>;
  const body = extract.body ? replaceVariables(extract.body, allVariables) : undefined;
  const url = composeUrl(extract.urlHost, extract.urlPath);
  const axiosConfig: AxiosRequestConfig = {
    method: extract.method,
    url: url,
    headers: headers,
    data: body,
    responseType: 'arraybuffer',
    params: queryParams,
    timeout: options?.timeout || 300000,
  };
  logMessage('info', `${extract.method} ${url}`, metadata);
  const response = await callAxios(axiosConfig, options);

  if(![200, 201, 204].includes(response?.status) || response.data?.error) {
    const error = JSON.stringify(String(response?.data?.error || response?.data));
    const message = `${extract.method} ${url} failed with status ${response.status}. Response: ${error}
    Headers: ${JSON.stringify(headers)}
    Body: ${JSON.stringify(body)}
    Params: ${JSON.stringify(queryParams)}
    `;
    throw new Error(`API call failed with status ${response.status}. Response: ${message}`);
  }

  let responseData = response.data;
  return responseData;
}

export async function processFile(data: Buffer, extractConfig: ExtractConfig) {
  if (extractConfig.decompressionMethod && extractConfig.decompressionMethod != DecompressionMethod.NONE) {
    data = await decompressData(data, extractConfig.decompressionMethod);
  }

  let responseJSON = await parseFile(data, extractConfig.fileType);

  if (extractConfig.dataPath) {
    // Navigate to the specified data path
    const pathParts = extractConfig.dataPath.split('.');
    for (const part of pathParts) {
      responseJSON = responseJSON[part] || responseJSON;  
    }
  }

  return responseJSON;
}

async function generateExtractConfig(extractConfig: Partial<ExtractConfig>, documentation: string, vars: string[] = [], lastError: string | null = null): Promise<ExtractConfig> {
  const schema = zodToJsonSchema(z.object({
    urlHost: z.string(),
    urlPath: z.string().optional(),
    queryParams: z.record(z.any()).optional(),
    method: z.enum(Object.values(HttpMethod) as [string, ...string[]]),
    headers: z.record(z.string()).optional(),
    body: z.string().optional(),
    authentication: z.enum(Object.values(AuthType) as [string, ...string[]]),
    dataPath: z.string().optional().describe('The path to the data array in the response JSON. e.g. "products"'),
    decompressionMethod: z.enum(Object.values(DecompressionMethod) as [string, ...string[]]).optional(),
    fileType: z.enum(Object.values(FileType) as [string, ...string[]]).optional(),
  }));

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_API_BASE_URL
  });
  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "api_definition",
        schema: schema,
      }
    },
    messages: [
      {
        role: "system",
        content: API_PROMPT
      },
      {
        role: "user", 
        content: 
`Generate API configuration for the following:

Instructions: ${extractConfig.instruction}

Base URL: ${composeUrl(extractConfig.urlHost, extractConfig.urlPath)}

Documentation: ${documentation}

Available variables: ${vars.join(", ")}

${lastError ? `We tried to call the API but it failed with the following error:
${lastError}` : ''}`
      }
    ]
  });
  const generatedConfig = JSON.parse(completion.choices[0].message.content);
  return {
    ...extractConfig,
    ...generatedConfig,
  } as ExtractConfig;
}