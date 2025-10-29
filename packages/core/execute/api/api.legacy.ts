import { ApiConfig, FileType, PaginationType } from "@superglue/client";
import { AxiosRequestConfig, AxiosResponse } from "axios";
import { RequestOptions } from "http";
import ivm from "isolated-vm";
import { getGenerateApiConfigContext } from "../../context/context-builders.js";
import { getPaginationErrorContext, getPaginationStopConditionErrorContext, getVarResolverErrorContext } from "../../context/context-error-messages.js";
import { SELF_HEALING_SYSTEM_PROMPT } from "../../context/context-prompts.js";
import { server_defaults } from "../../default.js";
import { IntegrationManager } from "../../integrations/integration-manager.js";
import { LanguageModel, LLMMessage } from "../../llm/language-model.js";
import { searchDocumentationToolDefinition, submitToolDefinition } from "../../llm/llm-tools.js";
import { parseFile } from "../../utils/file.js";
import { composeUrl, convertBasicAuthToBase64, generateId, replaceVariables } from "../../utils/helpers.js";
import { callFTP } from "../ftp/ftp.legacy.js";
import { callPostgres } from "../postgres/postgres.legacy.js";
import { AbortError, ApiCallError, callAxios, handle2xxStatus, handle429Status, handleErrorStatus } from "./api.js";

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
    //validatePaginationConfig(endpoint);

    const requestVars = { ...paginationVars, ...allVariables };
    const { processedHeaders, processedQueryParams, processedBody, processedUrlHost, processedUrlPath } = await resolveApiConfig(endpoint, requestVars);

    if (processedUrlHost.startsWith("postgres://") || processedUrlHost.startsWith("postgresql://")) {
      const postgresEndpoint = {
        ...endpoint,
        urlHost: processedUrlHost,
        urlPath: processedUrlPath,
        body: processedBody
      };
      return { data: await callPostgres(postgresEndpoint, payload, credentials, options), statusCode: 200, headers: {} };
    }

    if (processedUrlHost.startsWith("ftp://") || processedUrlHost.startsWith("ftps://") || processedUrlHost.startsWith("sftp://")) {
      const ftpEndpoint = {
        ...endpoint,
        urlHost: processedUrlHost,
        urlPath: processedUrlPath,
        body: processedBody
      };
      return { data: await callFTP({ endpoint: ftpEndpoint, credentials, options }), statusCode: 200, headers: {} };
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

    const status = lastResponse?.status;
    let statusHandlerResult = null;

    const retriesAttempted = axiosResult.retriesAttempted || 0;
    const lastFailureStatus = axiosResult.lastFailureStatus;

    if ([200, 201, 202, 203, 204, 205].includes(status)) {
      statusHandlerResult = handle2xxStatus({ response: lastResponse, axiosConfig, credentials, payload: requestVars, retriesAttempted, lastFailureStatus });
    } else if (status === 429) {
      statusHandlerResult = handle429Status({ response: lastResponse, axiosConfig, credentials, payload: requestVars, retriesAttempted, lastFailureStatus });
    } else {
      statusHandlerResult = handleErrorStatus({ response: lastResponse, axiosConfig, credentials, payload: requestVars, retriesAttempted, lastFailureStatus });
    }
    if (statusHandlerResult.shouldFail) {
      throw new ApiCallError(statusHandlerResult.message, status);
    }

    let dataPathSuccess = true;
    // TODO: we need to remove the data path and just join the data with the next page of data, otherwise we will have to do a lot of gymnastics to get the data path right
    let responseData = lastResponse.data;

    if (responseData instanceof Buffer) {
      responseData = await parseFile(responseData, FileType.AUTO);
    }
    else if (responseData && typeof responseData === 'string') {
      responseData = await parseFile(Buffer.from(responseData), FileType.AUTO);
    }
    const parsedResponseData = responseData;

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
        const firstRequestParams = { page: 1, offset: 0, cursor: null };
        const secondRequestParams = { page, offset, cursor };

        throw new Error(getPaginationStopConditionErrorContext(
          {
            paginationType: endpoint.pagination.type,
            stopCondition: (endpoint.pagination as any).stopCondition,
            pageSize: endpoint.pagination.pageSize,
            firstRequestParams,
            secondRequestParams,
            responsePreview: responseData
          },
          { characterBudget: 5000 }
        ));
      }

      if (loopCounter === 1 && !hasValidData && !currentHasData) {
        const firstRequestParams = { page: 1, offset: 0, cursor: null };
        const secondRequestParams = { page, offset, cursor };

        throw new Error(getPaginationStopConditionErrorContext(
          {
            paginationType: endpoint.pagination.type,
            stopCondition: (endpoint.pagination as any).stopCondition,
            pageSize: endpoint.pagination.pageSize,
            firstRequestParams,
            secondRequestParams,
            responsePreview: responseData
          },
          { characterBudget: 5000 }
        ));
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

export async function generateApiConfig({
  failedConfig,
  stepInput,
  credentials,
  retryCount,
  messages,
  integrationManager,
}: {
  failedConfig: Partial<ApiConfig>,
  stepInput: Record<string, any>,
  credentials: Record<string, any>,
  retryCount?: number,
  messages?: LLMMessage[],
  integrationManager: IntegrationManager,
}): Promise<{ config: ApiConfig; messages: LLMMessage[]; }> {
  if (!retryCount) retryCount = 0;
  if (!messages) messages = [];

  if (messages.length === 0) {

    const userPrompt = await getGenerateApiConfigContext({
      instruction: failedConfig.instruction,
      previousStepConfig: failedConfig,
      stepInput: stepInput,
      credentials,
      integrationManager
    }, { characterBudget: LanguageModel.contextLength / 4 + 10000 });

    messages.push({
      role: "system",
      content: SELF_HEALING_SYSTEM_PROMPT
    });
    messages.push({
      role: "user",
      content: userPrompt
    });
  }

  const temperature = Math.min(retryCount * 0.1, 1); // TODO: Evaluate whether this helps
  const { response: generatedConfig, messages: updatedMessages } = await LanguageModel.generateObject(
    messages,
    submitToolDefinition.arguments,
    temperature,
    [searchDocumentationToolDefinition],
    { integration: await integrationManager?.getIntegration() }
  );

  if (generatedConfig?.error) {
    throw new AbortError(generatedConfig.error);
  }

  if (!generatedConfig?.apiConfig) {
    throw new AbortError('LLM did not return apiConfig in response. Response: ' + JSON.stringify(generatedConfig).slice(0, 500));
  }

  return {
    config: {
      instruction: failedConfig.instruction,
      urlHost: generatedConfig.apiConfig.urlHost,
      urlPath: generatedConfig.apiConfig.urlPath,
      method: generatedConfig.apiConfig.method,
      queryParams: generatedConfig.apiConfig.queryParams,
      headers: generatedConfig.apiConfig.headers,
      body: generatedConfig.apiConfig.body,
      authentication: generatedConfig.apiConfig.authentication,
      pagination: generatedConfig.apiConfig.pagination,
      dataPath: generatedConfig.apiConfig.dataPath,
      documentationUrl: failedConfig.documentationUrl,
      responseSchema: failedConfig.responseSchema,
      responseMapping: failedConfig.responseMapping,
      createdAt: failedConfig.createdAt || new Date(),
      updatedAt: new Date(),
      id: failedConfig.id || generateId(generatedConfig.apiConfig.urlHost, generatedConfig.apiConfig.urlPath),
    } as ApiConfig,
    messages: updatedMessages
  };
}

export function validatePaginationConfig(apiConfig: ApiConfig): void {
  if (!apiConfig.pagination?.type) return;

  const requestFields = JSON.stringify({
    queryParams: apiConfig.queryParams,
    body: apiConfig.body,
    headers: apiConfig.headers,
    urlPath: apiConfig.urlPath
  });
  const paginationType = apiConfig.pagination.type;
  const missingVariables: string[] = [];

  if (paginationType === PaginationType.PAGE_BASED) {
    if (!requestFields.includes('page')) {
      missingVariables.push('page');
    }
  } else if (paginationType === PaginationType.OFFSET_BASED) {
    if (!requestFields.includes('offset')) {
      missingVariables.push('offset');
    }
  } else if (paginationType === PaginationType.CURSOR_BASED) {
    if (!requestFields.includes('cursor')) {
      missingVariables.push('cursor');
    }
  }

  if (missingVariables.length > 0) {
    throw new Error(getPaginationErrorContext(
      { paginationType, apiConfig, missingVariables },
      { characterBudget: 5000 }
    ));
  }
}

type resolveVarReferencesInput = {
  apiConfig: ApiConfig;
  configField: string;
  rawStringWithReferences: string;
  allVariables: Record<string, any>;
};

export async function resolveVarReferences(input: resolveVarReferencesInput): Promise<string> {
  try {
    const stringInput = typeof input.rawStringWithReferences === 'string'
      ? input.rawStringWithReferences
      : JSON.stringify(input.rawStringWithReferences);
    return await replaceVariables(stringInput, input.allVariables);
  } catch (error) {
    const originalErrorMessage = error instanceof Error ? error.message : String(error);

    // check if the error is a variable reference not found error (which is thrown if a var resolves to undefined)
    const variableReferenceMatch = originalErrorMessage.match(/Variable reference not found: (.+?) - (.+)$/);
    if (variableReferenceMatch) {
      const varReference = variableReferenceMatch[1];

      if (varReference.trim().toLowerCase() === 'cursor') {
        return "";
      }

      throw new Error(getVarResolverErrorContext(
        {
          apiConfig: input.apiConfig,
          configField: input.configField,
          errorType: "undefined_variable",
          varReference: varReference,
          originalErrorMessage,
          allVariables: input.allVariables
        },
        { characterBudget: 10000 }
      ));
    }
    // check if the error is a code execution error (which is thrown if a js expression fails to execute)
    const codeExecutionMatch = originalErrorMessage.match(/Failed to run JS expression: (.+?) - (.+)$/);
    if (codeExecutionMatch) {
      const varReference = codeExecutionMatch[1];

      throw new Error(getVarResolverErrorContext(
        {
          apiConfig: input.apiConfig,
          configField: input.configField,
          errorType: "code_execution_error",
          varReference: varReference,
          originalErrorMessage,
          allVariables: input.allVariables
        },
        { characterBudget: 10000 }
      ));
    }
    throw new Error(`Unknown error while replacing variables: ${originalErrorMessage}`);
  }
}

async function resolveApiConfig(endpoint: ApiConfig, requestVars: Record<string, any>): Promise<{
  processedHeaders: Record<string, any>;
  processedQueryParams: Record<string, any>;
  processedBody: string;
  processedUrlHost: string;
  processedUrlPath: string;
}> {
  const headersWithReplacedVars = Object.fromEntries(
    (await Promise.all(
      Object.entries(endpoint.headers || {})
        .map(async ([key, value]) => [key, await resolveVarReferences({ apiConfig: endpoint, configField: "header", rawStringWithReferences: String(value), allVariables: requestVars })])
    )).filter(([_, value]) => value && value !== "undefined" && value !== "null")
  );

  const processedHeaders = {};
  for (const [key, value] of Object.entries(headersWithReplacedVars)) {
    let processedValue = value;
    if (key.toLowerCase() === 'authorization' && typeof value === 'string') {
      processedValue = value.replace(/^(Basic|Bearer)\s+(Basic|Bearer)\s+/, '$1 $2');
    }
    if (key.toLowerCase() === 'authorization' && typeof processedValue === 'string' && processedValue.startsWith('Basic ')) {
      processedValue = convertBasicAuthToBase64(processedValue);
    }

    processedHeaders[key] = processedValue;
  }

  const processedQueryParams = Object.fromEntries(
    (await Promise.all(
      Object.entries(endpoint.queryParams || {})
        .map(async ([key, value]) => [key, await resolveVarReferences({ apiConfig: endpoint, configField: "queryParam", rawStringWithReferences: String(value), allVariables: requestVars })])
    )).filter(([_, value]) => value && value !== "undefined" && value !== "null")
  );

  const processedBody = endpoint.body
    ? await resolveVarReferences({ apiConfig: endpoint, configField: "body", rawStringWithReferences: endpoint.body, allVariables: requestVars })
    : "";

  const processedUrlHost = await resolveVarReferences({ apiConfig: endpoint, configField: "urlHost", rawStringWithReferences: endpoint.urlHost, allVariables: requestVars });
  const processedUrlPath = await resolveVarReferences({ apiConfig: endpoint, configField: "urlPath", rawStringWithReferences: endpoint.urlPath, allVariables: requestVars });

  return { processedHeaders, processedQueryParams, processedBody, processedUrlHost, processedUrlPath };
}