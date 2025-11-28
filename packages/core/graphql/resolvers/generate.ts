import { ApiConfig, Integration } from "@superglue/client";
import { GraphQLResolveInfo } from "graphql";
import { executeLLMTool, LLMToolCall } from "../../llm/llm-tool-utils.js";
import { InstructionGenerationContext } from "../../llm/llm-tools.js";
import { telemetryClient } from "../../utils/telemetry.js";
import { GraphQLRequestContext, Metadata } from '../types.js';
import { IntegrationManager } from "../../integrations/integration-manager.js";
import { getGenerateStepConfigContext } from "../../context/context-builders.js";
import { LLMMessage } from "../../llm/llm-base-model.js";
import { GENERATE_STEP_CONFIG_SYSTEM_PROMPT } from "../../context/context-prompts.js";
import { logMessage } from "../../utils/logs.js";
import { generateStepConfig } from "../../tools/tool-step-builder.js";

interface GenerateStepConfigArgs {
  integrationId?: string;
  currentStepConfig?: Partial<ApiConfig>;
  currentDataSelector?: string;
  stepInput?: Record<string, any>;
  credentials?: Record<string, string>;
  errorMessage?: string;
}

export const generateInstructionsResolver = async (
  _: any,
  { integrations }: { integrations: Integration[] },
  context: GraphQLRequestContext,
  info: GraphQLResolveInfo
) => {
  try {
    const toolCall: LLMToolCall = {
      id: crypto.randomUUID(),
      name: "generate_instructions",
      arguments: {}
    };

    const toolContext: InstructionGenerationContext = {
      orgId: context.orgId,
      runId: crypto.randomUUID(),
      integrations: integrations
    };

    const callResult = await executeLLMTool(toolCall, toolContext);

    if (callResult.error) {
      throw new Error(callResult.error);
    }

    if (callResult.success && Array.isArray(callResult.data)) {
      return callResult.data;
    }

    throw new Error("Failed to generate instructions");
  } catch (error) {
    telemetryClient?.captureException(error, context.orgId, {
      traceId: context.traceId,
      integrations: integrations
    });
    throw error;
  }
};

export const generateStepConfigResolver = async (
  _: any,
  { integrationId, currentStepConfig, currentDataSelector, stepInput, credentials, errorMessage }: GenerateStepConfigArgs,
  context: GraphQLRequestContext,
  info: GraphQLResolveInfo
): Promise<{config: ApiConfig, dataSelector: string}> => {
  try {
    const metadata: Metadata = { orgId: context.orgId, traceId: context.traceId };

  try {
    // Extract instruction from currentStepConfig
    const instruction = currentStepConfig?.instruction;
    if (!instruction) {
      throw new Error('Instruction is required in currentStepConfig');
    }

    let integration: Integration | undefined;
    let integrationDocs = '';
    let integrationSpecificInstructions = '';

    if (errorMessage && errorMessage.length < 100) {
      throw new Error('Error message must be at least 100 characters long');
    }

    if (integrationId) {
      try {
        logMessage('info', `Generating step config for integration ${integrationId}`, metadata);
        const integrationManager = new IntegrationManager(integrationId, context.datastore, context.orgId);
        integration = await integrationManager.getIntegration();
        integrationDocs = (await integrationManager.getDocumentation())?.content || '';
        integrationSpecificInstructions = integration.specificInstructions || '';
      } catch (error) {
        telemetryClient?.captureException(error, context.orgId, {
          integrationId
        });
      }
    }

    // Mode is either 'self-healing' if there's an error, or 'edit' (since we're always editing based on updated instruction)
    const mode = errorMessage ? 'self-healing' : 'edit';

    const userPrompt = getGenerateStepConfigContext({
      instruction,
      previousStepConfig: currentStepConfig,
      previousStepDataSelector: currentDataSelector,
      stepInput,
      credentials,
      integrationDocumentation: integrationDocs,
      integrationSpecificInstructions: integrationSpecificInstructions,
      errorMessage
    }, { characterBudget: 50000, mode });

    const messages: LLMMessage[] = [
      {
        role: "system",
        content: GENERATE_STEP_CONFIG_SYSTEM_PROMPT
      },
      {
        role: "user",
        content: userPrompt
      }
    ];

    const generateStepConfigResult = await generateStepConfig({
      retryCount: 0,
      messages,
      integration
    });
          
    if (!generateStepConfigResult.success || !generateStepConfigResult.config) {
      throw new Error(generateStepConfigResult.error || "No step config generated");
    }

    // Merge the generated config with the current config
    // Only preserve instruction and id which is not part of generated config
    const mergedConfig = {
      ...generateStepConfigResult.config,
      id: currentStepConfig.id || crypto.randomUUID(), // Add this line
      instruction: currentStepConfig.instruction,
    } as ApiConfig;

    return {config: mergedConfig, dataSelector: generateStepConfigResult.dataSelector};
  } catch (error) {
    telemetryClient?.captureException(error, context.orgId, {
      traceId: context.traceId,
      integrationId
    });

    throw error;
  }
};
