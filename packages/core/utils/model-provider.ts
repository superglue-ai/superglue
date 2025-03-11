import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { anthropic } from '@ai-sdk/anthropic';
import { mistral } from '@ai-sdk/mistral';
import { xai } from '@ai-sdk/xai';
import { deepseek } from '@ai-sdk/deepseek';
import { LanguageModel } from 'ai';

class ModelProvider {
  private static model: any = null;
  private static schemaModel: any = null;

  private static initializeLlmModel() {
    const llmProvider = process.env.LLM_PROVIDER;
    const llmModel = process.env.LLM_MODEL;

    if (!llmProvider) {
      throw new Error('LLM_PROVIDER is not specified in the environment variables');
    }

    ModelProvider.model = ModelProvider.selectModel(llmProvider, llmModel);
  }
  private static selectModel(llmProvider: string, llmModel: string) : LanguageModel {
    switch (llmProvider.toLowerCase()) {
      case 'openai':
        return openai(llmModel, { structuredOutputs: true });
      case 'google':
        return google(llmModel, { structuredOutputs: true });
      case 'anthropic':
        return anthropic(llmModel);
      case 'mistral':
        return mistral(llmModel);
      case 'deepseek':
        return deepseek(llmModel);
      case 'xai':
        return xai(llmModel);
      default:
        throw new Error(`Unsupported LLM provider: ${llmProvider}`);
    }
  }
  private static initializeSchemaModel() {
    const schemaGenerationProvider = process.env.SCHEMA_GENERATION_PROVIDER || process.env.LLM_PROVIDER;
    const schemaGenerationModel = process.env.SCHEMA_GENERATION_MODEL || process.env.LLM_MODEL;

    if (!schemaGenerationProvider || !schemaGenerationModel) {
      ModelProvider.schemaModel = ModelProvider.getModel();
      return;
    }

    ModelProvider.schemaModel = ModelProvider.selectModel(schemaGenerationProvider, schemaGenerationModel);
  }

  public static getModel() {
    if (!ModelProvider.model) {
      ModelProvider.initializeLlmModel();
    }
    return ModelProvider.model;
  }

  public static getSchemaModel() {
    if (!ModelProvider.schemaModel) {
      ModelProvider.initializeSchemaModel();
    }
    return ModelProvider.schemaModel;
  }
}

export default ModelProvider;