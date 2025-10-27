import { AuthType, DecompressionMethod, ExtractConfig, FileType, HttpMethod, RequestOptions } from "@superglue/client";
import { Metadata } from "@superglue/shared";
import { AxiosRequestConfig } from "axios";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { getExtractContext } from "../context/context-builders.js";
import { BUILD_WORKFLOW_SYSTEM_PROMPT } from "../context/context-prompts.js";
import { LanguageModel, LLMMessage } from "../llm/language-model.js";
import { decompressData, parseFile } from "../utils/file.js";
import { composeUrl, replaceVariables } from "../utils/helpers.js";
import { logMessage } from "../utils/logs.js";
import { callAxios } from "./api/api.js";


export async function callExtract(extract: ExtractConfig, payload: Record<string, any>, credentials: Record<string, any>, options: RequestOptions, metadata?: Metadata): Promise<any> {
  const allVariables = { ...payload, ...credentials };
  const headers = Object.fromEntries(
    (await Promise.all(
      Object.entries(extract.headers || {}).map(async ([key, value]) => [key, await replaceVariables(value, allVariables)])
    )).filter(([_, value]) => value)
  ) as Record<string, string>;
  const queryParams = Object.fromEntries(
    (await Promise.all(
      Object.entries(extract.queryParams || {}).map(async ([key, value]) => [key, await replaceVariables(value, allVariables)])
    )).filter(([_, value]) => value)
  ) as Record<string, string>;
  const body = extract.body ? await replaceVariables(extract.body, allVariables) : undefined;
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
  const { response } = await callAxios(axiosConfig, options);

  if (![200, 201, 204].includes(response?.status) || response.data?.error) {
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
    queryParams: z.record(z.string()).optional(),
    method: z.enum(Object.values(HttpMethod) as [string, ...string[]]),
    headers: z.record(z.string()).optional(),
    body: z.string().optional(),
    authentication: z.enum(Object.values(AuthType) as [string, ...string[]]),
    dataPath: z.string().optional().describe('The path to the data array in the response JSON. e.g. "products"'),
    decompressionMethod: z.enum(Object.values(DecompressionMethod) as [string, ...string[]]).optional(),
    fileType: z.enum(Object.values(FileType) as [string, ...string[]]).optional(),
  }));
  const extractPrompt = getExtractContext({ extractConfig: extractConfig as ExtractConfig, documentation, payload, credentials, lastError: lastError }, { characterBudget: LanguageModel.contextLength / 10 });
  const messages: LLMMessage[] = [
    {
      role: "system",
      content: BUILD_WORKFLOW_SYSTEM_PROMPT
    },
    {
      role: "user",
      content: extractPrompt
    }
  ];
  const { response: generatedConfig } = await LanguageModel.generateObject(messages, schema);
  return {
    id: extractConfig.id,
    instruction: extractConfig.instruction,
    urlHost: generatedConfig.urlHost,
    urlPath: generatedConfig.urlPath,
    method: generatedConfig.method,
    queryParams: generatedConfig.queryParams,
    headers: generatedConfig.headers,
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