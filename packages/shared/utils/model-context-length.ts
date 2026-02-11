const DEFAULT_CONTEXT_LENGTH = 150_000;

export function getModelContextLength(modelId: string): number {
  return DEFAULT_CONTEXT_LENGTH;
}

export function getConfiguredModelContextLength(): number {
  const provider = process.env.LLM_PROVIDER?.toLowerCase();
  let modelId: string | undefined;

  switch (provider) {
    case "anthropic":
      modelId = process.env.ANTHROPIC_MODEL;
      break;
    case "openai":
      modelId = process.env.OPENAI_MODEL;
      break;
    case "gemini":
      modelId = process.env.GEMINI_MODEL;
      break;
    case "azure":
      modelId = process.env.AZURE_MODEL;
      break;
    case "bedrock":
      modelId = process.env.BEDROCK_MODEL;
      break;
  }

  return modelId ? getModelContextLength(modelId) : DEFAULT_CONTEXT_LENGTH;
}
