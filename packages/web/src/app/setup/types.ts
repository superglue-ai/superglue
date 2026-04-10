export type CheckStatus = "ok" | "warn" | "missing";
export type ProviderKey = "openai" | "anthropic" | "gemini" | "azure" | "bedrock" | "vertex";

export type ProviderDetail = {
  label: string;
  value: string;
  copyValue?: string;
  status?: CheckStatus;
};

export type ProviderSummary = {
  key: ProviderKey;
  label: string;
  monogram: string;
  model: string | null;
  details: ProviderDetail[];
};
