import { ApiConfig, ApiInputRequest, CacheMode, Integration, RequestOptions, SelfHealingMode, TransformConfig } from "@superglue/client";
import type { Context, Metadata } from "@superglue/shared";
import { GraphQLResolveInfo } from "graphql";
import OpenAI from "openai";
import { LanguageModel, ToolCall, ToolResult } from "../../llm/llm.js";
import { EXECUTE_API_CALL_AGENT_PROMPT } from "../../llm/prompts.js";
import { executeTool } from "../../tools/tools.js";
import { callEndpoint, evaluateResponse } from "../../utils/api.js";
import { Documentation } from "../../utils/documentation.js";
import { logMessage } from "../../utils/logs.js";
import { telemetryClient } from "../../utils/telemetry.js";
import { maskCredentials } from "../../utils/tools.js";
import { executeTransform } from "../../utils/transform.js";
import { notifyWebhook } from "../../utils/webhook.js";
import { executeWorkflowStepDefinition, modifyStepConfigDefinition } from "../../workflow/workflow-execution-tools.js";
import { searchDocumentationDefinition } from "../../workflow/workflow-tools.js";

export async function executeApiCall(
  endpoint: ApiConfig,
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
  let isTestMode = options?.testMode || false;

  if (!isSelfHealing && !isTestMode) {
    const response = await callEndpoint(endpoint, payload, credentials, options);
    if (!response.data) {
      throw new Error("No data returned from API. This could be due to a configuration error.");
    }
    return { data: response.data, endpoint };
  }

  let documentationString = "No documentation provided";
  if (!integration && isSelfHealing) {
    logMessage('debug', `Self-healing enabled but no integration provided; skipping documentation-based healing.`, metadata);
  } else if (integration && integration.documentationPending) {
    logMessage('warn', `Documentation for integration ${integration.id} is still being fetched. Proceeding without documentation.`, metadata);
  } else if (integration && integration.documentation) {
    documentationString = Documentation.postProcess(integration.documentation, endpoint.instruction || "");
  }

  // Track attempts for modify_step_config
  const attemptHistory: Array<{
    config: any;
    error: string;
    statusCode?: number;
  }> = [];

  // Create a stateful tool executor that:
  // 1. Tracks failed execute_workflow_step attempts
  // 2. Intercepts modify_step_config to inject attempt history
  const statefulToolExecutor = async (toolCall: ToolCall): Promise<ToolResult> => {
    let modifiedToolCall = toolCall;

    // Intercept execute_workflow_step to ensure payload/credentials are passed
    if (toolCall.name === 'execute_workflow_step') {
      modifiedToolCall = {
        ...toolCall,
        arguments: {
          ...toolCall.arguments,
          payload: payload,
          credentials: credentials
        }
      };
    }

    // Intercept modify_step_config to inject attempt history
    if (toolCall.name === 'modify_step_config') {
      modifiedToolCall = {
        ...toolCall,
        arguments: {
          ...toolCall.arguments,
          payload: payload,
          credentials: credentials,
          documentation: toolCall.arguments.documentation ?? documentationString,
          previousAttempts: attemptHistory // Always inject our tracked history
        }
      };
    }

    const toolMetadata = {
      ...metadata,
      integrations: integration ? [integration] : []
    };

    const result = await executeTool(modifiedToolCall, toolMetadata);

    if (toolCall.name === 'execute_workflow_step' && !result.result?.success) {
      attemptHistory.push({
        config: toolCall.arguments.endpoint,
        error: result.result?.error || 'Unknown error',
        statusCode: result.result?.context?.statusCode
      });
    }

    return result;
  };

  // Define available tools
  const tools = [
    executeWorkflowStepDefinition,
    modifyStepConfigDefinition,
    searchDocumentationDefinition
  ];

  // Prepare initial messages
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: EXECUTE_API_CALL_AGENT_PROMPT
    },
    {
      role: "user",
      content: `Execute this API call successfully:

INSTRUCTION: ${endpoint.instruction || "Make API call and retrieve data"}

CURRENT CONFIGURATION:
${JSON.stringify(endpoint, null, 2)}

AVAILABLE DATA:
- Payload: ${Object.keys(payload).length > 10 ? `${Object.keys(payload).length} fields available` : JSON.stringify(payload, null, 2)}
- Credentials: ${Object.keys(credentials).join(", ") || "None"}
${integration ? `- Integration: ${integration.id}` : ""}
${documentationString !== "No documentation provided" ? `- Documentation: Available (${documentationString.length} chars)` : "- Documentation: Not available"}

Start by executing the API call with execute_workflow_step using the current configuration.
Remember: Always pass payload: { placeholder: true } and credentials: { placeholder: true } - the actual values will be injected automatically.`
    }
  ];

  try {
    const result = await LanguageModel.executeTaskWithTools(
      messages,
      tools,
      statefulToolExecutor,
      {
        maxIterations: 10,
        temperature: 0.1,
        shouldAbort: (trace) => trace.toolCall.name === 'execute_workflow_step' && trace.result.result?.success,
      }
    );

    // Log the result for debugging
    logMessage('debug', `executeTaskWithTools completed with ${result.executionTrace?.length || 0} trace entries`, metadata);

    // Extract the final configuration and response data from the result
    let finalEndpoint = endpoint;
    let responseData = null;
    let lastError = null;

    // Parse the tool calls to find successful execution
    for (const trace of result.executionTrace || []) {
      logMessage('debug', `Processing trace: ${trace.toolCall.name}, success: ${trace.result.result?.success}`, metadata);

      if (trace.toolCall.name === 'execute_workflow_step' && trace.result.result?.success) {
        responseData = trace.result.result.data;
        logMessage('debug', `Found successful execute_workflow_step with data`, metadata);
      } else if (trace.toolCall.name === 'modify_step_config' && trace.result.result?.success) {
        finalEndpoint = trace.result.result.config;
        logMessage('debug', `Updated endpoint configuration from modify_step_config`, metadata);
      } else if (trace.toolCall.name === 'execute_workflow_step' && !trace.result.result?.success) {
        lastError = trace.result.result?.error;
        logMessage('debug', `Found failed execute_workflow_step: ${lastError}`, metadata);
      }
    }

    if (!responseData) {
      const errorMessage = lastError || "Failed to execute API call after multiple attempts";
      telemetryClient?.captureException(new Error(errorMessage), metadata.orgId, {
        endpoint: finalEndpoint,
        toolCalls: result.toolCalls?.length || 0
      });
      throw new Error(errorMessage);
    }

    // Evaluate response if needed
    if (isTestMode || isSelfHealing) {
      logMessage('info', `Evaluating response for ${finalEndpoint?.urlHost}`, metadata);
      const evalResult = await evaluateResponse(responseData, finalEndpoint.responseSchema, finalEndpoint.instruction, documentationString);
      if (!evalResult.success) {
        throw new Error(evalResult.shortReason + " " + JSON.stringify(responseData).slice(0, 1000));
      }
    }

    logMessage('info', `executeApiCall completed successfully, returning data`, metadata);
    return { data: responseData, endpoint: finalEndpoint };

  } catch (error) {
    const errorMessage = error?.message || "Unknown error during API execution";
    const maskedError = maskCredentials(errorMessage, credentials).slice(0, 1000);

    telemetryClient?.captureException(new Error(maskedError), metadata.orgId, {
      endpoint: endpoint,
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