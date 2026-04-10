export type SetupSeverity = "blocker" | "warning";

export type SetupIssue = {
  id: string;
  severity: SetupSeverity;
  title: string;
  detail: string;
};

function env(name: string): string | undefined {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0 ? v : undefined;
}

function postgresIssue(): SetupIssue | null {
  const keys = [
    "POSTGRES_HOST",
    "POSTGRES_PORT",
    "POSTGRES_USERNAME",
    "POSTGRES_PASSWORD",
    "POSTGRES_DB",
  ] as const;
  const missing = keys.filter((k) => !env(k));
  if (missing.length === 0) return null;
  return {
    id: "postgres",
    severity: "blocker",
    title: "Postgres",
    detail: `Set: ${missing.join(", ")}.`,
  };
}

function authIssue(): SetupIssue | null {
  if (env("AUTH_TOKEN") || env("NEXT_PUBLIC_SUPERGLUE_API_KEY")) return null;
  return {
    id: "auth",
    severity: "blocker",
    title: "API authentication",
    detail: "Set AUTH_TOKEN on the API server (required for REST/MCP).",
  };
}

function llmIssue(): SetupIssue | null {
  const raw = env("LLM_PROVIDER");
  if (!raw) {
    return {
      id: "llm-provider-missing",
      severity: "blocker",
      title: "LLM provider",
      detail:
        "LLM_PROVIDER is not set. Set it to one of: openai, anthropic, gemini, azure, bedrock, vertex.",
    };
  }

  const p = raw.toLowerCase();
  switch (p) {
    case "openai":
      if (!env("OPENAI_API_KEY")) {
        return {
          id: "llm-openai",
          severity: "blocker",
          title: "LLM (OpenAI)",
          detail: "Set OPENAI_API_KEY.",
        };
      }
      return null;
    case "gemini":
      if (!env("GEMINI_API_KEY")) {
        return {
          id: "llm-gemini",
          severity: "blocker",
          title: "LLM (Gemini)",
          detail: "Set GEMINI_API_KEY.",
        };
      }
      return null;
    case "anthropic":
      if (!env("ANTHROPIC_API_KEY")) {
        return {
          id: "llm-anthropic",
          severity: "blocker",
          title: "LLM (Anthropic)",
          detail: "Set ANTHROPIC_API_KEY.",
        };
      }
      return null;
    case "azure":
      if (!env("AZURE_API_KEY")) {
        return {
          id: "llm-azure",
          severity: "blocker",
          title: "LLM (Azure)",
          detail: "Set AZURE_API_KEY.",
        };
      }
      if (!env("AZURE_RESOURCE_NAME") && !env("AZURE_BASE_URL")) {
        return {
          id: "llm-azure-endpoint",
          severity: "blocker",
          title: "LLM (Azure)",
          detail: "Set AZURE_RESOURCE_NAME or AZURE_BASE_URL.",
        };
      }
      return null;
    case "bedrock":
      if (!env("AWS_ACCESS_KEY_ID") || !env("AWS_SECRET_ACCESS_KEY") || !env("AWS_REGION")) {
        return {
          id: "llm-bedrock",
          severity: "blocker",
          title: "LLM (Bedrock)",
          detail: "Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION.",
        };
      }
      return null;
    case "vertex": {
      const model = (env("VERTEX_MODEL") || "").toLowerCase();
      const isAnthropicModel = model.startsWith("claude");
      const hasSa = !!(env("VERTEX_CLIENT_EMAIL") && env("VERTEX_PRIVATE_KEY"));
      const hasAdc = !!env("GOOGLE_APPLICATION_CREDENTIALS");
      const hasApiKey = !!env("VERTEX_API_KEY");

      if (isAnthropicModel) {
        if (!hasSa && !hasAdc) {
          return {
            id: "llm-vertex",
            severity: "blocker",
            title: "LLM (Vertex + Claude)",
            detail:
              "Claude on Vertex needs VERTEX_CLIENT_EMAIL + VERTEX_PRIVATE_KEY, or GOOGLE_APPLICATION_CREDENTIALS (not VERTEX_API_KEY alone).",
          };
        }
        return null;
      }

      if (!hasApiKey && !hasSa && !hasAdc) {
        return {
          id: "llm-vertex",
          severity: "blocker",
          title: "LLM (Vertex)",
          detail:
            "Set VERTEX_API_KEY for Gemini on Vertex, or VERTEX_CLIENT_EMAIL + VERTEX_PRIVATE_KEY, or GOOGLE_APPLICATION_CREDENTIALS.",
        };
      }
      return null;
    }
    default:
      return {
        id: "llm-provider",
        severity: "blocker",
        title: "LLM provider",
        detail: `Unknown LLM_PROVIDER "${p}". Use openai, anthropic, gemini, azure, bedrock, or vertex.`,
      };
  }
}

function objectStorageIssues(): SetupIssue[] {
  const provider = (env("FILE_STORAGE_PROVIDER") || "aws").toLowerCase();
  const out: SetupIssue[] = [];

  if (provider === "aws") {
    const missing: string[] = [];
    if (!env("AWS_ACCESS_KEY_ID")) missing.push("AWS_ACCESS_KEY_ID");
    if (!env("AWS_SECRET_ACCESS_KEY")) missing.push("AWS_SECRET_ACCESS_KEY");
    if (!env("AWS_BUCKET_NAME")) missing.push("AWS_BUCKET_NAME");
    if (missing.length > 0) {
      out.push({
        id: "s3-aws",
        severity: "warning",
        title: "Object storage (AWS S3)",
        detail: `File uploads need ${missing.join(", ")}. Region defaults to us-east-1 if unset.`,
      });
    }
    return out;
  }

  if (provider === "minio") {
    const missing: string[] = [];
    if (!env("MINIO_ROOT_USER")) missing.push("MINIO_ROOT_USER");
    if (!env("MINIO_ROOT_PASSWORD")) missing.push("MINIO_ROOT_PASSWORD");
    if (!env("S3_ENDPOINT")) missing.push("S3_ENDPOINT");
    if (!env("MINIO_BUCKET_NAME")) missing.push("MINIO_BUCKET_NAME");
    if (missing.length > 0) {
      out.push({
        id: "s3-minio",
        severity: "warning",
        title: "Object storage (MinIO)",
        detail: `Set ${missing.join(", ")}. Use S3_PUBLIC_ENDPOINT if the browser uses a different host than the API.`,
      });
    }
    return out;
  }

  out.push({
    id: "s3-provider",
    severity: "warning",
    title: "Object storage",
    detail: `FILE_STORAGE_PROVIDER "${provider}" is not supported. Use aws or minio.`,
  });
  return out;
}

export function getSetupReport(): { blockers: SetupIssue[]; warnings: SetupIssue[] } {
  const blockers: SetupIssue[] = [];
  const warnings: SetupIssue[] = [];

  const a = authIssue();
  if (a) blockers.push(a);

  const pg = postgresIssue();
  if (pg) blockers.push(pg);

  const llm = llmIssue();
  if (llm) blockers.push(llm);

  if (!env("AUTH_TOKEN") && env("NEXT_PUBLIC_SUPERGLUE_API_KEY")) {
    warnings.push({
      id: "auth-legacy-public",
      severity: "warning",
      title: "API authentication",
      detail:
        "Prefer AUTH_TOKEN on the server; NEXT_PUBLIC_SUPERGLUE_API_KEY is legacy and client-visible.",
    });
  }

  warnings.push(...objectStorageIssues());

  return { blockers, warnings };
}
