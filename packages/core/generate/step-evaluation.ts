import { ApiConfig } from "@superglue/client";
import OpenAI from "openai";
import { LanguageModel } from "../llm/llm.js";
import { getObjectContext } from "../utils/context.js";

export async function evaluateStepResponse({
    data,
    endpoint,
    documentation
  }: {
    data: any,
    endpoint: ApiConfig,
    documentation?: string
  }): Promise<{ success: boolean, refactorNeeded: boolean, shortReason: string; }> {
    let dataDescription = getObjectContext(data, { include: { schema: true, preview: true, samples: true }, characterBudget: LanguageModel.contextLength / 2 });
  
    // Include documentation context if available
    const documentationContext = documentation
      ? `\n\nAPI DOCUMENTATION CONTEXT:\n=========================\n${documentation}\n=========================\n`
      : '';
  
    const request = [
      {
        role: "system",
        content: `You are an API response validator. 
  Validate the data returned by the step and return { success: true, shortReason: "", refactorNeeded: false } if the data aligns with the instruction. 
  If the data does not align with the instruction, return { success: false, shortReason: "reason why it does not align", refactorNeeded: false }.
  You will be shown the JSON schema of the response data, a preview of the data and some (NOT ALL) samples from the data. This is to help you understand the data and validate if it aligns with the instruction.
  
  IMPORTANT CONSIDERATIONS:
  - For operations that create, update, delete, or send data (non-retrieval operations), minimal or empty responses with 2xx status codes often indicate success
  - An empty response body (like {}, [], null, or "") can be a valid successful response, especially for:
    * Resource creation/updates where the API acknowledges receipt without returning data
    * Deletion operations that return no content
    * Asynchronous operations that accept requests for processing
    * Messaging/notification APIs that confirm delivery without response data
    * In cases where the instruction is a retrieval operation, an empty response is often a failure.
    * In cases where the instruction is unclear, it is always better to return non empty responses than empty responses.
  - Always consider the instruction type and consult the API documentation when provided to understand expected response patterns
  - Focus on whether the response contains the REQUESTED DATA, not the exact structure. If the instruction asks for "products" and the response contains product data (regardless of field names), it's successful.
  - DO NOT fail validation just because field names differ from what's mentioned in the instruction.
  
  Do not make the mistake of thinking that the { success: true, shortReason: "", refactorNeeded: false } is the expected API response format. It is YOUR expected response format.
  Keep in mind that the response can come in any shape or form, just validate that the response aligns with the instruction.
  If the instruction contains a filter and the response contains data not matching the filter, return { success: true, refactorNeeded: true, shortReason: "Only results matching the filter XXX" }.
  If the reponse is valid but hard to comprehend, return { success: true, refactorNeeded: true, shortReason: "The response is valid but hard to comprehend. Please refactor the instruction to make it easier to understand." }.
  E.g. if the response is something like { "data": { "products": [{"id": 1, "name": "Product 1"}, {"id": 2, "name": "Product 2"}] } }, no refactoring is needed.
  If the response reads something like [ "12/2", "22.2", "frejgeiorjgrdelo"] that makes it very hard to parse the required information of the instruction, refactoring is needed. 
  If the response needs to be grouped or sorted or aggregated, this will be handled in a later step, so the appropriate response for you is to return { success: true, refactorNeeded: false, shortReason: "" }.
  Refactoring is NOT needed if the response contains extra fields or needs to be grouped.
  
  <documentation>
  ${documentationContext}
  </documentation>`
      },
      {
        role: "user", content: `<request>${JSON.stringify(endpoint)}</request>
  <api_response>${dataDescription}</api_response>`
      }
    ] as OpenAI.Chat.ChatCompletionMessageParam[];
  
    const response = await LanguageModel.generateObject(
      request,
      { type: "object", properties: { success: { type: "boolean" }, refactorNeeded: { type: "boolean" }, shortReason: { type: "string" } } },
      0
    );
    return response.response;
  }
  