import { CoreMessage, generateObject, generateText, LanguageModel } from 'ai';
import { ZodSchema } from 'zod';
import ModelProvider from './model-provider.js';

class LLMClient {
  private static instance: LLMClient;

  private constructor() {
  }

  public static getInstance(): LLMClient {
    if (!LLMClient.instance) {
      LLMClient.instance = new LLMClient();
    }
    return LLMClient.instance;
  }

  public async getObject({
    schema,
    schemaName,
    temperature,
    messages,
    model
  }: {
    schema: ZodSchema;
    schemaName: string;
    temperature?: number;
    messages: Array<CoreMessage>;
    model?: LanguageModel;
  }): Promise<any> {

    const result = await generateObject({
      model: model || ModelProvider.getModel(),
      schema,
      messages,
      temperature,
    });
    console.log("result.object", result.object);
    return result.object;
  }

  public async getText({
    temperature,
    messages,
    model
  }: {
    temperature?: number;
    messages: Array<CoreMessage>;
    model?: LanguageModel;
  }): Promise<any> {

    const result = await generateText({
      model: model || ModelProvider.getModel(),
      messages,
      temperature,
    });
    console.log("result.text", result.text);
    return result.text;
  }

}

export default LLMClient; 