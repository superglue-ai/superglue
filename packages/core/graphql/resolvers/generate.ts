import { ApiConfig, Integration } from "@superglue/client";
import { GraphQLResolveInfo } from "graphql";
import { executeTool, ToolCall } from "../../execute/tools.js";
import { InstructionGenerationContext } from "../../utils/instructions.js";
import { telemetryClient } from "../../utils/telemetry.js";
import { Context, Metadata } from '../types.js';
import { IntegrationManager } from "../../integrations/integration-manager.js";
import { getGenerateStepConfigContext } from "../../context/context-builders.js";
import { LLMMessage } from "../../llm/language-model.js";
import { GENERATE_STEP_CONFIG_SYSTEM_PROMPT } from "../../context/context-prompts.js";
import { logMessage } from "../../utils/logs.js";

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
    const toolCall: ToolCall = {
      id: crypto.randomUUID(),
      name: "generate_instructions",
      arguments: {}
    };

    const toolContext: InstructionGenerationContext = {
      orgId: context.orgId,
      runId: crypto.randomUUID(),
      integrations: integrations
    };

    const callResult = await executeTool(toolCall, toolContext);

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
        
        const docs = await integrationManager.getDocumentation();
        integrationDocs = docs.content|| '';
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

    const generatedStepConfig = await executeTool({
      id: crypto.randomUUID(),
      name: "generate_step_config",
      arguments: { configInstruction: instruction, retryCount: 0 },
    }, 
    { runId: metadata.runId, orgId: metadata.orgId, messages, integration });
  
    if (!generatedStepConfig.success || !generatedStepConfig.data?.config) {
      return {
        success: false,
        error: generatedStepConfig.error || "Failed to generate step config",
        config: {}
      };
    }

    return {
      success: true,
      config: generatedStepConfig.data.config
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    telemetryClient?.captureException(error, context.orgId, {
      integrationId,
      error: errorMessage
    });
    
    return {
      success: false,
      error: errorMessage,
      config: {}
    };
  }
};
