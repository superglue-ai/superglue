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

export async function executeWorkflowStep(
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

  try {
    const response = await callEndpoint(endpoint, payload, credentials, options);

    if (!response.data) {
      throw new Error("No data returned from API. This could be due to a configuration error.");
    }

    // In test mode, always evaluate the response
    if (isTestMode && (endpoint.instruction || endpoint.responseSchema)) {
      const { Documentation } = await import('../../utils/documentation.js');

      let documentationString = "No documentation provided";
      if (integration?.documentation) {
        documentationString = Documentation.postProcess(integration.documentation, endpoint.instruction || "");
      }

      const evalResult = await evaluateResponse(
        response.data,
        endpoint.responseSchema,
        endpoint.instruction,
        documentationString
      );

      if (!evalResult.success) {
        throw new Error(`Response evaluation failed: ${evalResult.shortReason}`);
      }
    }

    // Direct execution succeeded - return immediately
    return { data: response.data, endpoint };

  } catch (initialError) {
    // If self-healing is disabled, throw the error immediately
    if (!isSelfHealing) {
      throw initialError;
    }

    const errorMessage = initialError instanceof Error ? initialError.message : String(initialError);
    logMessage('info', `Initial API call failed, entering self-healing mode: ${errorMessage}`, metadata);

    return executeWithAgentLoop(endpoint, payload, credentials, options, metadata, integration, errorMessage);
  }
}

async function executeWithAgentLoop(
  endpoint: ApiConfig,
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
  let documentationString = "No documentation provided";
  if (!integration) {
    logMessage('debug', `Self-healing enabled but no integration provided; skipping documentation-based healing.`, metadata);
  } else if (integration.documentationPending) {
    logMessage('warn', `Documentation for integration ${integration.id} is still being fetched. Proceeding without documentation.`, metadata);
  } else if (integration.documentation) {
    documentationString = Documentation.postProcess(integration.documentation, endpoint.instruction || "");
  }

  // Create context for tools
  const toolContext: WorkflowExecutionContext = {
    endpoint: endpoint,
    payload: payload,
    credentials: credentials,
    options: options,
    integrations: integration ? [integration] : [],
    runId: metadata.runId,
    orgId: metadata.orgId
  };

  // Simple tool executor
  const toolExecutor = async (toolCall: ToolCall): Promise<ToolCallResult> => {
    return executeTool(toolCall, toolContext);
  };

  const tools = [
    submitToolDefinition,
    searchDocumentationToolDefinition
  ];

  const availableVariables = [
    ...Object.keys(credentials || {}),
    ...Object.keys(payload || {})
  ].map(v => `<<${v}>>`).join(", ");

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: SELF_HEALING_API_AGENT_PROMPT
    },
    {
      role: "user",
      content: `Execute this API call successfully. The initial attempt failed with the following error:

ERROR: ${initialError}

INSTRUCTION: ${endpoint.instruction || "Make API call and retrieve data"}

FAILED CONFIGURATION:
${JSON.stringify(endpoint, null, 2)}

AVAILABLE CONTEXT:
- Payload keys: ${Object.keys(payload).join(", ") || "None"} (${Object.keys(payload).length} fields)
- Credentials: ${Object.keys(credentials).length > 0 ? Object.keys(credentials).join(", ") : "NONE PROVIDED"}
- Available variables: ${availableVariables || "None"}
${integration ? `- Integration: ${integration.id}` : ""}
${documentationString !== "No documentation provided" ? `- Documentation: Available (${documentationString.length} chars)` : "- Documentation: Not available"}

Analyze the error and generate a corrected API configuration. Submit it using the submit_tool.`
    }
  ];

  try {
    const result = await LanguageModel.executeTaskWithTools(
      messages,
      tools,
      toolExecutor,
      {
        maxIterations: 30,
        temperature: 0.1,
        shouldAbort: (trace) => {
          // Stop when submit_tool succeeds
          return trace.toolCall.name === 'submit_tool' &&
            trace.result.result?.resultForAgent?.success === true;
        }
      }
    );

    let finalEndpoint = endpoint;
    let responseData = null;
    let lastError = null;

    // Parse the tool calls to find successful execution
    for (const trace of result.executionTrace || []) {
      logMessage('debug', `Processing trace: ${trace.toolCall.name}, success: ${trace.result.result?.resultForAgent?.success}`, metadata);

      if (trace.toolCall.name === 'submit_tool') {
        if (trace.result.result?.resultForAgent?.success) {
          responseData = trace.result.result.fullResult?.data;
          finalEndpoint = trace.result.result.fullResult?.config || endpoint;
          logMessage('debug', `Found successful submit_tool with data`, metadata);
        } else {
          lastError = trace.result.result?.resultForAgent?.error;
          logMessage('debug', `Found failed submit_tool: ${lastError}`, metadata);
        }
      }
    }

    if (!responseData) {
      // Check if the agent decided to abort without making more tool calls
      const finalMessage = result.finalResult ? String(result.finalResult) : "";

      // If the agent provided a clear abort message, use that as the error
      if (finalMessage && !lastError && result.toolCalls?.length > 0) {
        // Agent made some attempts but then decided to abort with explanation
        const errorMessage = `Self-healing aborted: ${finalMessage}`;
        telemetryClient?.captureException(new Error(errorMessage), metadata.orgId, {
          endpoint: finalEndpoint,
          toolCalls: result.toolCalls?.length || 0,
          abortReason: "agent_decision"
        });
        throw new Error(errorMessage);
      }

      // If agent aborted immediately without any tool calls
      if (finalMessage && result.toolCalls?.length === 0) {
        const errorMessage = `Cannot proceed: ${finalMessage}`;
        telemetryClient?.captureException(new Error(errorMessage), metadata.orgId, {
          endpoint: finalEndpoint,
          toolCalls: 0,
          abortReason: "immediate_abort"
        });
        throw new Error(errorMessage);
      }

      // Otherwise, use the last error or a generic message
      const errorMessage = lastError || finalMessage || "Failed to execute API call after multiple attempts";
      telemetryClient?.captureException(new Error(errorMessage), metadata.orgId, {
        endpoint: finalEndpoint,
        toolCalls: result.toolCalls?.length || 0
      });
      throw new Error(errorMessage);
    }

    logMessage('info', `executeWorkflowStep completed successfully after self-healing`, metadata);
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

    const callResult = await executeWorkflowStep(endpoint, payload, credentials, options, metadata);
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