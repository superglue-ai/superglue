import { ApiConfig } from "@superglue/client";
import { getEvaluateStepResponseContext } from "../context/context-builders.js";
import { EVALUATE_STEP_RESPONSE_SYSTEM_PROMPT } from "../context/context-prompts.js";
import { LanguageModel, LLMMessage } from "../llm/language-model.js";

export async function evaluateStepResponse({
  data,
  endpoint,
  docSearchResultsForStepInstruction
}: {
  data: any,
  endpoint: ApiConfig,
  docSearchResultsForStepInstruction?: string
}): Promise<{ success: boolean, refactorNeeded: boolean, shortReason: string; }> {

  const evaluateStepResponsePrompt = getEvaluateStepResponseContext({ data, endpoint, docSearchResultsForStepInstruction }, { characterBudget: LanguageModel.contextLength / 10 });

  const request = [
    {
      role: "system",
      content: EVALUATE_STEP_RESPONSE_SYSTEM_PROMPT
    },
    {
      role: "user", content: evaluateStepResponsePrompt
    }
  ] as LLMMessage[];

  const response = await LanguageModel.generateObject(
    request,
    { type: "object", properties: { success: { type: "boolean" }, refactorNeeded: { type: "boolean" }, shortReason: { type: "string" } } },
    0
  );
  return response.response;
}
