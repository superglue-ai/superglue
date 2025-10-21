const MODEL_CONTEXT_LENGTHS: Record<string, number> = {
  // Anthropic Claude models - 200K
  'claude-sonnet-4.5': 200_000,
  'claude-sonnet-4-20250514': 200_000,
  'claude-sonnet-4': 200_000,
  'claude-3.7-sonnet': 200_000,
  'claude-haiku-4.5': 200_000,
  'claude-3-haiku': 200_000,
  'claude-3.5-haiku': 200_000,
  'claude-3.5-sonnet': 200_000,

  // OpenAI GPT-5 models - 400K
  'gpt-5-nano': 400_000,
  'gpt-5': 400_000,
  'gpt-5-mini': 400_000,
  'gpt-5-codex': 400_000,

  // OpenAI GPT-4.1 models - 1M
  'gpt-4.1-mini': 1_000_000,
  'gpt-4.1': 1_000_000,

  // OpenAI GPT-4o models - 128K
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,

  // OpenAI other models
  'gpt-oss-120b': 131_000,

  // Google Gemini models - 1M
  'gemini-2.5-flash-lite': 1_000_000,
  'gemini-2.5-pro': 1_000_000,
  'gemini-2.0-flash': 1_000_000,
  'gemini-2.0-flash-lite': 1_000_000,
  'gemini-2.5-flash': 1_000_000,
  'gemini-2.5-flash-preview-09-2025': 1_000_000,
};

const DEFAULT_CONTEXT_LENGTH = 128_000;

export function getModelContextLength(modelId: string): number {
  if (!modelId) {
    return DEFAULT_CONTEXT_LENGTH;
  }

  // Remove provider prefix if present (e.g., "openai/gpt-4.1" -> "gpt-4.1")
  const modelName = modelId.includes('/') ? modelId.split('/')[1] : modelId;

  // Normalize model name (lowercase, remove extra spaces)
  const normalizedModel = modelName.toLowerCase().trim();

  // Direct match
  if (MODEL_CONTEXT_LENGTHS[normalizedModel]) {
    return MODEL_CONTEXT_LENGTHS[normalizedModel];
  }

  // Pattern matching for common variations
  for (const [key, value] of Object.entries(MODEL_CONTEXT_LENGTHS)) {
    // Check if the model name contains the key or vice versa
    if (normalizedModel.includes(key) || key.includes(normalizedModel)) {
      return value;
    }
  }

  return DEFAULT_CONTEXT_LENGTH;
}

export function getConfiguredModelContextLength(): number {
  const provider = process.env.LLM_PROVIDER?.toLowerCase();
  let modelId: string | undefined;

  switch (provider) {
    case 'anthropic':
      modelId = process.env.ANTHROPIC_MODEL;
      break;
    case 'openai':
      modelId = process.env.OPENAI_MODEL;
      break;
    case 'gemini':
      modelId = process.env.GEMINI_MODEL;
      break;
    case 'azure':
      modelId = process.env.AZURE_MODEL;
      break;
  }

  return modelId ? getModelContextLength(modelId) : DEFAULT_CONTEXT_LENGTH;
}

