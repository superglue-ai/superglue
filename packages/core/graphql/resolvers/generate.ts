import { ApiConfig, Integration } from "@superglue/client";
import { GraphQLResolveInfo } from "graphql";
import { executeLLMTool, LLMToolCall } from "../../llm/llm-tool-utils.js";
import { InstructionGenerationContext } from "../../llm/llm-tools.js";
import { telemetryClient } from "../../utils/telemetry.js";
import { Context, Metadata } from '../types.js';
import { IntegrationManager } from "../../integrations/integration-manager.js";
import { getGenerateStepConfigContext } from "../../context/context-builders.js";
import { LLMMessage } from "../../llm/llm-base-model.js";
import { GENERATE_STEP_CONFIG_SYSTEM_PROMPT } from "../../context/context-prompts.js";
import { logMessage } from "../../utils/logs.js";
import { generateStepConfig } from "../../tools/tool-steps/tool-step-builder.js";

interface GenerateStepConfigArgs {
  integrationId?: string;
  instruction: string;
  currentStepConfig?: Partial<ApiConfig>;
  stepInput?: Record<string, any>;
  credentials?: Record<string, string>;
  errorMessage?: string;
  editInstruction?: string;
}

export const generateInstructionsResolver = async (
  _: any,
  { integrations }: { integrations: Integration[] },
  context: Context,
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
      integrations: integrations
    });
    throw error;
  }
};

export const generateStepConfigResolver = async (
  _: any,
  { integrationId, instruction, currentStepConfig, stepInput, credentials, errorMessage, editInstruction }: GenerateStepConfigArgs,
  context: Context,
  info: GraphQLResolveInfo
) => {
  try {
    const metadata: Metadata = { orgId: context.orgId, runId: crypto.randomUUID() };
    
    let integration: Integration | undefined;
    let integrationDocs = '';
    let integrationSpecificInstructions = '';

    if (editInstruction && editInstruction.length < 100) {
      logMessage('error', `Edit instruction must be at least 100 characters long`, metadata);
      throw new Error('Edit instruction must be at least 100 characters long');
    }
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
    
    const mode = errorMessage ? 'self-healing' 
      : editInstruction ? 'edit' 
      : 'create';
    
    const userPrompt = getGenerateStepConfigContext({
      instruction,
      previousStepConfig: currentStepConfig,
      stepInput,
      credentials,
      integrationDocumentation: integrationDocs,
      integrationSpecificInstructions: integrationSpecificInstructions,
      errorMessage,
      editInstruction
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

    const generateStepConfigResult = await generateStepConfig(0, messages);
          
    if (!generateStepConfigResult.success || !generateStepConfigResult.config) {
      throw new Error(generateStepConfigResult.error || "No step config generated");
    }
          
    return generateStepConfigResult.config;
  } catch (error) {
    telemetryClient?.captureException(error, context.orgId, {
      integrationId
    });
    throw error;
  }
};
