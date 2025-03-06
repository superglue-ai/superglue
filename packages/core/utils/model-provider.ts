import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { anthropic } from '@ai-sdk/anthropic';
import { mistral } from '@ai-sdk/mistral';
import { xai } from '@ai-sdk/xai';
import { deepseek } from '@ai-sdk/deepseek';

class ModelProvider {
  private static model: any = null;
  private static schemaModel: any = null;

  private static initializeLlmModel() {
    const llmProvider = process.env.LLM_PROVIDER;
    const llmModel = process.env.LLM_MODEL;

    if (!llmProvider) {
      throw new Error('LLM_PROVIDER is not specified in the environment variables');
    }

    switch (llmProvider.toLowerCase()) {
      case 'openai':
        ModelProvider.model = openai(llmModel, { structuredOutputs: true });
        break;
      case 'google':
        ModelProvider.model = google(llmModel, { structuredOutputs: true });
        break;
      case 'anthropic':
        ModelProvider.model = anthropic(llmModel);
        break;
      case 'mistral':
        ModelProvider.model = mistral(llmModel);
        break;
      case 'deepseek':
        ModelProvider.model = deepseek(llmModel);
        break;
      case 'xai':
        ModelProvider.model = xai(llmModel);
        break;
      default:
        throw new Error(`Unsupported LLM provider: ${llmProvider}`);
    }
  }

  private static initializeSchemaModel() {
    const schemaGenerationProvider = process.env.SCHEMA_GENERATION_PROVIDER;
    const schemaGenerationModel = process.env.SCHEMA_GENERATION_MODEL;
    const llmModel = process.env.LLM_MODEL;

    if (!schemaGenerationProvider || !schemaGenerationModel) {
      ModelProvider.schemaModel = ModelProvider.getModel();
      return;
    }

    switch (schemaGenerationProvider.toLowerCase()) {
      case 'openai':
        ModelProvider.schemaModel = openai(llmModel, { structuredOutputs: true });
        break;
      case 'google':
        ModelProvider.schemaModel = google(llmModel, { structuredOutputs: true });
        break;
      case 'anthropic':
        ModelProvider.schemaModel = anthropic(llmModel);
        break;
      case 'mistral':
        ModelProvider.schemaModel = mistral(llmModel);
        break;
      case 'deepseek':
        ModelProvider.schemaModel = deepseek(llmModel);
        break;
      case 'xai':
        ModelProvider.schemaModel = xai(llmModel);
        break;
      default:
        ModelProvider.schemaModel = ModelProvider.getModel();
    }
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