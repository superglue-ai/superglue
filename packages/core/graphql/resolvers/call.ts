import { ApiConfig, ApiInputRequest, CacheMode, Integration, RequestOptions, SelfHealingMode, TransformConfig } from "@superglue/client";
import type { Context, Metadata } from "@superglue/shared";
import { GraphQLResolveInfo } from "graphql";
import OpenAI from "openai";
import { LanguageModel } from "../../llm/llm.js";
import { SELF_HEALING_API_AGENT_PROMPT } from "../../llm/prompts.js";
import { executeTool, ToolCall, ToolCallResult, WorkflowExecutionContext } from "../../tools/tools.js";
import { callEndpoint, evaluateResponse } from "../../utils/api.js";
import { Documentation } from "../../utils/documentation.js";
import { logMessage } from "../../utils/logs.js";
import { telemetryClient } from "../../utils/telemetry.js";
import { maskCredentials } from "../../utils/tools.js";
import { executeTransform } from "../../utils/transform.js";
import { notifyWebhook } from "../../utils/webhook.js";
import { searchDocumentationToolDefinition, submitToolDefinition } from "../../workflow/workflow-tools.js";

export async function executeApiCall(
  originalEndpoint: ApiConfig,
  payload: any,
  credentials: Record<string, string>,
  options: RequestOptions,
  metadata: Metadata,
  integration?: Integration,
): Promise<{
  data: any;
  endpoint: ApiConfig;
}> {
  let isSelfHealing = isSelfHealingEnabled(options);
  let shouldEvaluateResponse = options?.testMode || false;

  try {
    const response = await callEndpoint(originalEndpoint, payload, credentials, options);

    if (!response.data) {
      throw new Error("No data returned from API. This could be due to a configuration error.");
    }

    if (shouldEvaluateResponse) {
      let documentationString = "No documentation provided";
      if (integration?.documentation) {
        documentationString = Documentation.extractRelevantSections(integration.documentation, originalEndpoint.instruction || "");
      }

      const evalResult = await evaluateResponse(
        response.data,
        originalEndpoint.responseSchema,
        originalEndpoint.instruction,
        documentationString
      );

      if (!evalResult.success) {
        throw new Error(`Response evaluation failed: ${evalResult.shortReason}`);
      }
    }

    return { data: response.data, endpoint: originalEndpoint };

  } catch (initialError) {
    // If self-healing is disabled, throw the error immediately
    if (!isSelfHealing) {
      throw initialError;
    }

    const errorMessage = initialError instanceof Error ? initialError.message : String(initialError);
    logMessage('info', `Initial API call failed, entering self-healing mode: ${errorMessage}`, metadata);

    return executeWithSelfHealing(
      originalEndpoint,
      payload,
      credentials,
      options,
      metadata,
      integration,
      errorMessage
    );
  }
}

async function executeWithSelfHealing(
  originalEndpoint: ApiConfig,
  payload: any,
  credentials: Record<string, string>,
  options: RequestOptions,
  metadata: Metadata,
  integration: Integration | undefined,
  initialError: string
): Promise<{
  data: any;
  endpoint: ApiConfig;
}> {

  const staticToolContext: WorkflowExecutionContext = {
    originalEndpoint: originalEndpoint,
    payload: payload,
    credentials: credentials,
    options: options,
    integration: integration,
    runId: metadata.runId,
    orgId: metadata.orgId
  };

  // Simple tool executor
  const toolExecutor = async (toolCall: ToolCall): Promise<ToolCallResult> => {
    return executeTool(toolCall, staticToolContext);
  };

  const tools = [
    submitToolDefinition,
    searchDocumentationToolDefinition
  ];


  const paginationVariables = originalEndpoint.pagination ? ['page', 'offset', 'cursor', 'limit', 'pageSize'] : [];
  const allVariableNames = [
    ...Object.keys(credentials || {}),
    ...Object.keys(payload || {}),
    ...paginationVariables
  ];
  const availableVariables = allVariableNames.map(v => `<<${v}>>`).join(", ");

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: SELF_HEALING_API_AGENT_PROMPT
    },
    {
      role: "user",
      content: `Execute this API call successfully. The initial attempt failed.

<error>
${initialError.slice(0, 2000)}${initialError.length > 2000 ? '... [truncated]' : ''}
</error>

<instruction>
${originalEndpoint.instruction}
</instruction>

<failed_configuration>
  <url>${originalEndpoint.urlHost}${originalEndpoint.urlPath}</url>
  <method>${originalEndpoint.method}</method>
  <authentication>${originalEndpoint.authentication || 'None'}</authentication>
  ${originalEndpoint.pagination ? `<pagination>${JSON.stringify(originalEndpoint.pagination, null, 2)}</pagination>` : ''}
</failed_configuration>

<available_context>
  <payload_fields>${Object.keys(payload).length > 0 ? Object.keys(payload).join(", ") : "None"}</payload_fields>
  <credentials>${Object.keys(credentials).length > 0 ? Object.keys(credentials).join(", ") : "None"}</credentials>
  <all_variables>${availableVariables || "None"}</all_variables>
  ${integration ? `<integration>${integration.id}</integration>` : ''}
</available_context>

Analyze the error. Then generate a corrected API configuration and submit it using the submit_tool.`
    }
  ];

  try {
    const result = await LanguageModel.executeTaskWithTools(
      messages,
      tools,
      toolExecutor,
      {
        maxIterations: 20,
        shouldAbort: (trace) => {
          return trace.toolCall.name === 'submit_tool' &&
            trace.result.result?.fullResult?.success === true;
        }
      }
    );

    if (result.success && result.lastSuccessfulToolCall) {
      const { result: data, additionalData: finalEndpoint } = result.lastSuccessfulToolCall;

      logMessage('info', `executeWorkflowStep completed successfully after self-healing`, finalEndpoint);
      return { data, endpoint: finalEndpoint };
    }

    // Handle failure scenarios
    const errorMessage = result.lastError || result.finalResult || "Failed to execute API call after multiple attempts";

    telemetryClient?.captureException(new Error(errorMessage), metadata.orgId, {
      endpoint: originalEndpoint,
      toolCalls: result.toolCalls?.length || 0,
      terminationReason: result.terminationReason
    });

    throw new Error(errorMessage);

  } catch (error) {
    const errorMessage = error?.message || "Unknown error during API execution";
    const maskedError = maskCredentials(errorMessage, credentials).slice(0, 1000);

    telemetryClient?.captureException(new Error(maskedError), metadata.orgId, {
      endpoint: originalEndpoint,
      error: errorMessage
    });

    throw new Error(`API execution failed: ${maskedError}`);
  }
}

function isSelfHealingEnabled(options: RequestOptions): boolean {
  return options?.selfHealing ? options.selfHealing === SelfHealingMode.ENABLED || options.selfHealing === SelfHealingMode.REQUEST_ONLY : true;
}

export const callResolver = async (
  _: any,
  { input, payload, credentials, options }: {
    input: ApiInputRequest;
    payload: any;
    credentials?: Record<string, string>;
    options: RequestOptions;
  },
  context: Context,
  info: GraphQLResolveInfo
) => {
  const startedAt = new Date();
  const callId = crypto.randomUUID();
  const metadata: Metadata = {
    runId: callId,
    orgId: context.orgId
  };
  let endpoint: ApiConfig;
  const readCache = options?.cacheMode ? options.cacheMode === CacheMode.ENABLED || options.cacheMode === CacheMode.READONLY : true;
  const writeCache = options?.cacheMode ? options.cacheMode === CacheMode.ENABLED || options.cacheMode === CacheMode.WRITEONLY : false;

  try {

    // Get endpoint from datastore or use the one provided in the input
    if (input.id) {
      endpoint = await context.datastore.getApiConfig(input.id, context.orgId);
    } else {
      endpoint = input.endpoint;
    }

    // Check if response schema is zod and throw an error if it is
    if ((endpoint?.responseSchema as any)?._def?.typeName === "ZodObject") {
      throw new Error("zod is not supported for response schema. Please use json schema instead. you can use the zod-to-json-schema package to convert zod to json schema.");
    }

    const callResult = await executeApiCall(endpoint, payload, credentials, options, metadata);
    endpoint = callResult.endpoint;
    const data = callResult.data;

    // Transform response with built-in retry logic
    const transformResult = await executeTransform(
      {
        datastore: context.datastore,
        fromCache: readCache,
        input: { endpoint: endpoint as TransformConfig },
        data: data,
        metadata: { runId: callId, orgId: context.orgId },
        options: options
      }
    );

    // Save configuration if requested
    const config = { ...endpoint, ...transformResult?.config };

    if (writeCache) {
      context.datastore.upsertApiConfig(input.id || endpoint.id, config, context.orgId);
    }

    // Notify webhook if configured
    if (options?.webhookUrl) {
      notifyWebhook(options.webhookUrl, callId, true, transformResult.data);
    }

    const result = {
      id: callId,
      success: true,
      config: config,
      startedAt,
      completedAt: new Date(),
    };
    context.datastore.createRun(result, context.orgId);
    return { ...result, data: transformResult.data };
  } catch (error) {
    const maskedError = maskCredentials(error.message, credentials);

    if (options?.webhookUrl) {
      await notifyWebhook(options.webhookUrl, callId, false, undefined, error.message);
    }
    const result = {
      id: callId,
      success: false,
      error: maskedError,
      config: endpoint,
      startedAt,
      completedAt: new Date(),
    };
    context.datastore.createRun(result, context.orgId);
    return result;
  }
};