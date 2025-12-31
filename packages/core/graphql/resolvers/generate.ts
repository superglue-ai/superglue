import {
  ApiConfig,
  GenerateStepConfigArgs,
  GenerateTransformArgs,
  Integration,
} from "@superglue/shared";
import { GraphQLResolveInfo } from "graphql";
import { getGenerateStepConfigContext } from "../../context/context-builders.js";
import { GENERATE_STEP_CONFIG_SYSTEM_PROMPT } from "../../context/context-prompts.js";
import { IntegrationManager } from "../../integrations/integration-manager.js";
import { LLMMessage } from "../../llm/llm-base-model.js";
import { executeLLMTool, LLMToolCall } from "../../llm/llm-tool-utils.js";
import { InstructionGenerationContext } from "../../llm/llm-tools.js";
import { buildSourceData, generateStepConfig } from "../../tools/tool-step-builder.js";
import { generateWorkingTransform } from "../../tools/tool-transform.js";
import { logMessage } from "../../utils/logs.js";
import { telemetryClient } from "../../utils/telemetry.js";
import { GraphQLRequestContext } from "../types.js";

export const generateInstructionsResolver = async (
  _: any,
  { integrations }: { integrations: Integration[] },
  context: GraphQLRequestContext,
  info: GraphQLResolveInfo,
) => {
  try {
    const toolCall: LLMToolCall = {
      id: crypto.randomUUID(),
      name: "generate_instructions",
      arguments: {},
    };

    const toolContext: InstructionGenerationContext = {
      ...context.toMetadata(),
      integrations: integrations,
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
      integrations: integrations,
    });
    throw error;
  }
};

export const generateStepConfigResolver = async (
  _: any,
  {
    integrationId,
    currentStepConfig,
    currentDataSelector,
    stepInput,
    credentials,
    errorMessage,
  }: GenerateStepConfigArgs,
  context: GraphQLRequestContext,
  info: GraphQLResolveInfo,
): Promise<{ config: ApiConfig; dataSelector: string }> => {
  try {
    const metadata = context.toMetadata();

    // Extract instruction from currentStepConfig
    const instruction = currentStepConfig?.instruction;
    if (!instruction) {
      throw new Error("Instruction is required in currentStepConfig");
    }

    let integration: Integration | undefined;
    let integrationDocs = "";
    let integrationSpecificInstructions = "";
    let integrationCredentials: Record<string, string> = {};

    if (integrationId) {
      try {
        logMessage("info", `Generating step config for integration ${integrationId}`, metadata);
        const integrationManager = new IntegrationManager(
          integrationId,
          context.datastore,
          context.toMetadata(),
        );
        integration = await integrationManager.getIntegration();
        integrationDocs = (await integrationManager.getDocumentation())?.content || "";
        integrationSpecificInstructions = integration.specificInstructions || "";

        // Get integration credentials and prefix keys with integration ID
        if (integration?.credentials) {
          Object.entries(integration.credentials).forEach(([key, value]) => {
            integrationCredentials[`${integrationId}_${key}`] = String(value);
          });
        }
      } catch (error) {
        telemetryClient?.captureException(error, context.orgId, {
          integrationId,
        });
      }
    }

    // Merge provided credentials with integration credentials (provided credentials take precedence)
    const mergedCredentials = {
      ...integrationCredentials,
      ...(credentials || {}),
    };

    // Mode is either 'self-healing' if there's an error, or 'edit' (since we're always editing based on updated instruction)
    const mode = errorMessage ? "self-healing" : "edit";

    const userPrompt = getGenerateStepConfigContext(
      {
        instruction,
        previousStepConfig: currentStepConfig,
        previousStepDataSelector: currentDataSelector,
        stepInput,
        credentials: mergedCredentials,
        integrationDocumentation: integrationDocs,
        integrationSpecificInstructions: integrationSpecificInstructions,
        errorMessage,
      },
      { characterBudget: 50000, mode },
    );

    const messages: LLMMessage[] = [
      {
        role: "system",
        content: GENERATE_STEP_CONFIG_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: userPrompt,
      },
    ];

    const sourceData = await buildSourceData({
      stepInput,
      credentials: mergedCredentials,
      dataSelector: currentDataSelector,
      integrationUrlHost: integration?.urlHost,
      paginationPageSize: currentStepConfig?.pagination?.pageSize,
    });

    const generateStepConfigResult = await generateStepConfig({
      retryCount: 0,
      messages,
      sourceData,
      integration,
      metadata,
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

    return { config: mergedConfig, dataSelector: generateStepConfigResult.dataSelector };
  } catch (error) {
    telemetryClient?.captureException(error, context.orgId, {
      traceId: context.traceId,
      integrationId,
    });

    throw error;
  }
};

export const generateTransformResolver = async (
  _: any,
  { currentTransform, responseSchema, stepData, errorMessage, instruction }: GenerateTransformArgs,
  context: GraphQLRequestContext,
  info: GraphQLResolveInfo,
): Promise<{ transformCode: string; data?: any }> => {
  try {
    const metadata = context.toMetadata();

    const prompt =
      (instruction || "Create transformation code.") +
      (currentTransform
        ? `\nOriginally, we used the following transformation: ${currentTransform}`
        : "") +
      (errorMessage ? `\nThe transformation failed with the following error: ${errorMessage}` : "");

    const result = await generateWorkingTransform({
      targetSchema: responseSchema,
      inputData: stepData,
      instruction: prompt,
      metadata,
    });

    if (!result) {
      throw new Error("Failed to generate transform code");
    }

    return {
      transformCode: result.transformCode,
      data: result.data,
    };
  } catch (error) {
    telemetryClient?.captureException(error, context.orgId, {
      errorMessage,
      instruction,
    });
    throw error;
  }
};
