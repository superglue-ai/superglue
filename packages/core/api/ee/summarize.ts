import { generateText } from "ai";
import { registerApiModule } from "../registry.js";
import { sendError, addTraceHeader } from "../response-helpers.js";
import type { AuthenticatedFastifyRequest } from "../types.js";
import { logMessage } from "../../utils/logs.js";
import { initializeAIModel } from "@superglue/shared/utils/ai-model-init";

const MAX_INPUT_CHARS = 10000;
const MAX_OUTPUT_TOKENS = 80;

// Check if summarization is available (LLM provider configured)
function isSummarizeAvailable(): boolean {
  return !!(process.env.SUMMARIZE_LLM_PROVIDER || process.env.LLM_PROVIDER);
}

// Initialize summarize model - uses SUMMARIZE_LLM_PROVIDER env var, falls back to main LLM_PROVIDER
// SUMMARIZE_MODEL overrides the provider's default model for fast/cheap summaries
function getSummarizeModel() {
  return initializeAIModel({
    providerEnvVar: process.env.SUMMARIZE_LLM_PROVIDER ? "SUMMARIZE_LLM_PROVIDER" : "LLM_PROVIDER",
    modelOverride: process.env.SUMMARIZE_MODEL,
    defaultModel: "anthropic.claude-4-5-haiku",
  });
}

interface SummarizeRequestBody {
  prompt: string;
}

async function summarizeHandler(request: any, reply: any) {
  const authReq = request as AuthenticatedFastifyRequest;
  const body = request.body as SummarizeRequestBody;
  const timings: Record<string, number> = {};
  const overallStart = Date.now();

  if (!body?.prompt || typeof body.prompt !== "string") {
    return sendError(reply, 400, "Missing required field: prompt (string)");
  }

  if (body.prompt.length > MAX_INPUT_CHARS) {
    return sendError(reply, 400, `Prompt too large. Maximum ${MAX_INPUT_CHARS} characters.`);
  }

  if (!isSummarizeAvailable()) {
    return sendError(
      reply,
      503,
      "Summarization not available. Configure LLM_PROVIDER or SUMMARIZE_LLM_PROVIDER.",
    );
  }

  try {
    const modelInitStart = Date.now();
    const model = getSummarizeModel();
    timings.modelInit = Date.now() - modelInitStart;

    const llmStart = Date.now();
    const result = await generateText({
      model,
      prompt: body.prompt,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      temperature: 0.3,
    });
    timings.llmCall = Date.now() - llmStart;

    const summary = result.text.trim();
    timings.total = Date.now() - overallStart;

    return addTraceHeader(reply, authReq.traceId).code(200).send({
      summary,
      durationMs: timings.total,
      timings,
    });
  } catch (error) {
    timings.total = Date.now() - overallStart;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logMessage("error", `Summarize failed: ${errorMessage}`, {
      orgId: authReq.authInfo.orgId,
      traceId: authReq.traceId,
      error: errorMessage,
      timings,
    } as any);

    return sendError(reply, 500, `Summarization failed: ${errorMessage}`);
  }
}

registerApiModule({
  name: "summarize",
  routes: [
    {
      method: "POST",
      path: "/summarize",
      handler: summarizeHandler,
      permissions: {
        type: "read",
        resource: "runs",
        allowedBaseRoles: ["admin", "member", "enduser"],
      },
    },
  ],
});
