import axios, { AxiosRequestConfig } from "axios";
import {  AuthType, RequestOptions, DecompressionMethod, ExtractConfig, FileType, HttpMethod, Metadata } from "@superglue/shared";
import { callAxios, composeUrl, generateId, replaceVariables } from "./tools.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { API_PROMPT } from "../llm/prompts.js";
import { decompressData, parseFile } from "./file.js";
import { logMessage } from "./logs.js";
import { LanguageModel } from "../llm/llm.js";
import { ChatCompletionMessageParam } from "openai/resources/index.mjs";


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

export async function generateExtractConfig(extractConfig: Partial<ExtractConfig>, documentation: string, payload: Record<string, any>, credentials: Record<string, any>, lastError: string | null = null): Promise<ExtractConfig> {
  const schema = zodToJsonSchema(z.object({
    urlHost: z.string(),
    urlPath: z.string().optional(),
    queryParams: z.array(z.object({
      key: z.string(),
      value: z.string()
    })).optional(),
    method: z.enum(Object.values(HttpMethod) as [string, ...string[]]),
    headers: z.array(z.object({
      key: z.string(),
      value: z.string()
    })).optional(),
    body: z.string().optional(),
    authentication: z.enum(Object.values(AuthType) as [string, ...string[]]),
    dataPath: z.string().optional().describe('The path to the data array in the response JSON. e.g. "products"'),
    decompressionMethod: z.enum(Object.values(DecompressionMethod) as [string, ...string[]]).optional(),
    fileType: z.enum(Object.values(FileType) as [string, ...string[]]).optional(),
  }));
  const messages: ChatCompletionMessageParam[] = [
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

Available credential variables: ${Object.keys(credentials || {}).join(", ")}
Available payload variables: ${Object.keys(payload || {}).join(", ")}
Example payload: ${JSON.stringify(payload || {})}

${lastError ? `We tried to call the API but it failed with the following error:
${lastError}` : ''}`
    }
  ];
  const { response: generatedConfig } = await LanguageModel.generateObject(messages, schema);
  return {
    id: extractConfig.id,
    instruction: extractConfig.instruction,
    urlHost: generatedConfig.urlHost,
    urlPath: generatedConfig.urlPath,
    method: generatedConfig.method,
    queryParams: generatedConfig.queryParams ? Object.fromEntries(generatedConfig.queryParams.map(p => [p.key, p.value])) : undefined,
    headers: generatedConfig.headers ? Object.fromEntries(generatedConfig.headers.map(p => [p.key, p.value])) : undefined,
    body: generatedConfig.body,
    authentication: generatedConfig.authentication,
    pagination: generatedConfig.pagination,
    dataPath: generatedConfig.dataPath,
    decompressionMethod: generatedConfig.decompressionMethod,
    fileType: generatedConfig.fileType,
    documentationUrl: extractConfig.documentationUrl,
    createdAt: extractConfig.createdAt || new Date(),
    updatedAt: new Date(),    
  } as ExtractConfig;
}