import type { ReactElement } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { BrainCircuit, ClipboardList, Database, KeyRound } from "lucide-react";
import { ModelProviderCard, SetupConfigRow } from "./setup-config-rows";
import { getSetupReport } from "./setup-validation";
import type { ProviderKey, ProviderSummary } from "./types";

const ALLOWED_LLM: readonly ProviderKey[] = [
  "openai",
  "anthropic",
  "gemini",
  "azure",
  "bedrock",
  "vertex",
];

function getEnv(name: string): string | undefined {
  const value = process.env[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function maskSecret(value: string | undefined, visibleChars: number = 4): string {
  if (!value) return "Not set";
  if (value.length <= visibleChars) return "•".repeat(value.length);
  return `${"•".repeat(Math.max(6, value.length - visibleChars))}${value.slice(-visibleChars)}`;
}

const providerMeta: Record<ProviderKey, { label: string; monogram: string }> = {
  openai: { label: "OpenAI", monogram: "O" },
  anthropic: { label: "Anthropic", monogram: "A" },
  gemini: { label: "Gemini", monogram: "G" },
  azure: { label: "Azure", monogram: "Az" },
  bedrock: { label: "Bedrock", monogram: "B" },
  vertex: { label: "Vertex", monogram: "V" },
};

function getProviderSummary(providerRaw: string | undefined): ProviderSummary {
  if (!providerRaw || !providerRaw.trim()) {
    return {
      key: "openai",
      label: "LLM_PROVIDER not set",
      monogram: "?",
      model: null,
      details: [{ label: "LLM_PROVIDER", value: "Not set" }],
    };
  }
  const normalized = providerRaw.toLowerCase();
  if (!ALLOWED_LLM.includes(normalized as ProviderKey)) {
    return {
      key: "openai",
      label: "Invalid LLM_PROVIDER",
      monogram: "?",
      model: null,
      details: [{ label: "Current value", value: providerRaw }],
    };
  }
  const resolved = normalized as ProviderKey;
  const meta = providerMeta[resolved];

  switch (resolved) {
    case "openai": {
      const baseUrl = getEnv("OPENAI_BASE_URL") || "https://api.openai.com/v1";
      return {
        key: resolved,
        label: meta.label,
        monogram: meta.monogram,
        model: getEnv("OPENAI_MODEL") || "gpt-4.1",
        details: [
          {
            label: "API Key",
            value: maskSecret(getEnv("OPENAI_API_KEY")),
            status: getEnv("OPENAI_API_KEY") ? "ok" : "missing",
          },
          { label: "Base URL", value: baseUrl, copyValue: baseUrl },
        ],
      };
    }
    case "anthropic": {
      const baseUrl = getEnv("ANTHROPIC_BASE_URL") || "https://api.anthropic.com";
      return {
        key: resolved,
        label: meta.label,
        monogram: meta.monogram,
        model: getEnv("ANTHROPIC_MODEL") || "claude-sonnet-4-5",
        details: [
          {
            label: "API Key",
            value: maskSecret(getEnv("ANTHROPIC_API_KEY")),
            status: getEnv("ANTHROPIC_API_KEY") ? "ok" : "missing",
          },
          { label: "Base URL", value: baseUrl, copyValue: baseUrl },
        ],
      };
    }
    case "gemini": {
      const baseUrl =
        getEnv("GEMINI_BASE_URL") || "https://generativelanguage.googleapis.com/v1beta";
      return {
        key: resolved,
        label: meta.label,
        monogram: meta.monogram,
        model: getEnv("GEMINI_MODEL") || "gemini-2.5-flash",
        details: [
          {
            label: "API Key",
            value: maskSecret(getEnv("GEMINI_API_KEY")),
            status: getEnv("GEMINI_API_KEY") ? "ok" : "missing",
          },
          { label: "Base URL", value: baseUrl, copyValue: baseUrl },
        ],
      };
    }
    case "azure": {
      const endpoint = getEnv("AZURE_BASE_URL") || getEnv("AZURE_RESOURCE_NAME");
      const endpointDisplay = endpoint || "Not set";
      const apiVersion = getEnv("AZURE_API_VERSION");
      const details: {
        label: string;
        value: string;
        copyValue?: string;
        status?: "ok" | "warn" | "missing";
      }[] = [
        {
          label: "API Key",
          value: maskSecret(getEnv("AZURE_API_KEY")),
          status: getEnv("AZURE_API_KEY") ? "ok" : "missing",
        },
        {
          label: "Endpoint",
          value: endpointDisplay,
          status: getEnv("AZURE_BASE_URL") || getEnv("AZURE_RESOURCE_NAME") ? "ok" : "missing",
          ...(endpoint ? { copyValue: endpointDisplay } : {}),
        },
      ];
      if (apiVersion) {
        details.push({ label: "API Version", value: apiVersion, copyValue: apiVersion });
      }
      return {
        key: resolved,
        label: meta.label,
        monogram: meta.monogram,
        model: getEnv("AZURE_MODEL") || "gpt-4.1",
        details,
      };
    }
    case "bedrock": {
      const region = getEnv("AWS_REGION");
      return {
        key: resolved,
        label: meta.label,
        monogram: meta.monogram,
        model: getEnv("BEDROCK_MODEL") || "anthropic.claude-3-5-sonnet-20240620-v1:0",
        details: [
          {
            label: "Access Key",
            value: maskSecret(getEnv("AWS_ACCESS_KEY_ID")),
            status: getEnv("AWS_ACCESS_KEY_ID") ? "ok" : "missing",
          },
          {
            label: "Secret Key",
            value: maskSecret(getEnv("AWS_SECRET_ACCESS_KEY")),
            status: getEnv("AWS_SECRET_ACCESS_KEY") ? "ok" : "missing",
          },
          {
            label: "Region",
            value: region || "Not set",
            status: region ? "ok" : "missing",
            ...(region ? { copyValue: region } : {}),
          },
        ],
      };
    }
    case "vertex": {
      const email = getEnv("VERTEX_CLIENT_EMAIL");
      const adc = getEnv("GOOGLE_APPLICATION_CREDENTIALS");
      return {
        key: resolved,
        label: meta.label,
        monogram: meta.monogram,
        model: getEnv("VERTEX_MODEL") || "Not set",
        details: [
          {
            label: "Express API Key",
            value: maskSecret(getEnv("VERTEX_API_KEY")),
            status: getEnv("VERTEX_API_KEY") ? "ok" : "warn",
          },
          {
            label: "Service Account",
            value: email || "Not set",
            status: email && getEnv("VERTEX_PRIVATE_KEY") ? "ok" : "warn",
            ...(email ? { copyValue: email } : {}),
          },
          {
            label: "ADC Credentials",
            value: adc || "Not set",
            status: adc ? "ok" : "warn",
            ...(adc ? { copyValue: adc } : {}),
          },
        ],
      };
    }
  }
}

const GLASS_CARD = "border-border/40 bg-card/40 backdrop-blur-xl min-w-0 overflow-hidden";

export default function ApiKeysPage(): ReactElement {
  const { blockers, warnings } = getSetupReport();

  const apiPort = getEnv("API_PORT") || "3002";
  const apiEndpoint = getEnv("API_ENDPOINT") || `http://localhost:${apiPort}`;
  const webPort = getEnv("WEB_PORT") || "3001";
  const appUrl = getEnv("SUPERGLUE_APP_URL") || `http://localhost:${webPort}`;
  const mcpUrl = `${apiEndpoint.replace(/\/$/, "")}/mcp`;
  const restBase = `${apiEndpoint.replace(/\/$/, "")}/v1`;

  const authToken = getEnv("AUTH_TOKEN");

  const postgresConfigured =
    !!getEnv("POSTGRES_HOST") &&
    !!getEnv("POSTGRES_PORT") &&
    !!getEnv("POSTGRES_USERNAME") &&
    !!getEnv("POSTGRES_PASSWORD") &&
    !!getEnv("POSTGRES_DB");

  const llmProvider = getProviderSummary(getEnv("LLM_PROVIDER"));

  const postgresConnection = postgresConfigured
    ? `${getEnv("POSTGRES_USERNAME")}@${getEnv("POSTGRES_HOST")}:${getEnv("POSTGRES_PORT")}/${getEnv("POSTGRES_DB")}`
    : "Incomplete (host, port, user, password, database)";

  const fileProvider = (getEnv("FILE_STORAGE_PROVIDER") || "aws").toLowerCase();
  const awsRegionEffective = getEnv("AWS_REGION") || "us-east-1";
  const awsBucket = getEnv("AWS_BUCKET_NAME");
  const awsKey = getEnv("AWS_ACCESS_KEY_ID");
  const awsSecret = getEnv("AWS_SECRET_ACCESS_KEY");
  const minioUser = getEnv("MINIO_ROOT_USER");
  const minioPass = getEnv("MINIO_ROOT_PASSWORD");
  const s3Endpoint = getEnv("S3_ENDPOINT");
  const minioBucket = getEnv("MINIO_BUCKET_NAME");

  return (
    <div className="min-w-0 p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-5xl min-w-0 space-y-6">
        <section>
          <Card className={GLASS_CARD}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base font-medium">
                <ClipboardList className="h-4 w-4 text-muted-foreground" />
                Setup checklist
              </CardTitle>
              <CardDescription>
                Blockers match what the API process expects to start cleanly; warnings are for file
                uploads and related features.
              </CardDescription>
            </CardHeader>
            <CardContent className="min-w-0 space-y-4 text-sm">
              {blockers.length === 0 && warnings.length === 0 ? (
                <p className="text-muted-foreground">No issues matched these checks.</p>
              ) : null}
              {blockers.length > 0 ? (
                <div className="min-w-0 space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-foreground/80">
                    Must fix
                  </div>
                  <ul className="list-inside list-disc space-y-1.5 text-muted-foreground marker:text-foreground/50">
                    {blockers.map((issue) => (
                      <li key={issue.id}>
                        <span className="font-medium text-foreground">{issue.title}</span>
                        <span> — {issue.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {warnings.length > 0 ? (
                <div className="min-w-0 space-y-2 border-t border-border/40 pt-4">
                  <div className="text-xs font-medium uppercase tracking-wide text-foreground/70">
                    Recommended
                  </div>
                  <ul className="list-inside list-disc space-y-1.5 text-muted-foreground marker:text-foreground/40">
                    {warnings.map((issue) => (
                      <li key={issue.id}>
                        <span className="font-medium text-foreground/90">{issue.title}</span>
                        <span> — {issue.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </section>

        <section>
          <Card className={GLASS_CARD}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base font-medium">
                <KeyRound className="h-4 w-4 text-muted-foreground" />
                Auth & endpoints
              </CardTitle>
              <CardDescription>
                Effective values from this server (masked where sensitive).
              </CardDescription>
            </CardHeader>
            <CardContent className="grid min-w-0 gap-2 md:grid-cols-2">
              <SetupConfigRow
                className="md:col-span-2"
                label="AUTH_TOKEN"
                value={maskSecret(authToken)}
                copyText={authToken}
                statusHint={authToken ? null : "Required"}
              />
              <SetupConfigRow label="REST API base URL" value={restBase} copyText={restBase} />
              <SetupConfigRow label="MCP endpoint URL" value={mcpUrl} copyText={mcpUrl} />
              <SetupConfigRow label="Web app URL" value={appUrl} copyText={appUrl} />
            </CardContent>
          </Card>
        </section>

        <section>
          <Card className={GLASS_CARD}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base font-medium">
                <BrainCircuit className="h-4 w-4 text-muted-foreground" />
                Model provider
              </CardTitle>
            </CardHeader>
            <CardContent className="min-w-0 grid gap-3">
              <ModelProviderCard summary={llmProvider} />
            </CardContent>
          </Card>
        </section>

        <section>
          <Card className={GLASS_CARD}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base font-medium">
                <Database className="h-4 w-4 text-muted-foreground" />
                Datastore & object storage
              </CardTitle>
              <CardDescription>
                Postgres plus S3-compatible file storage. S3 is required to support system knowledge
                bases.
              </CardDescription>
            </CardHeader>
            <CardContent className="min-w-0 space-y-6">
              <div className="min-w-0 space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Postgres</div>
                <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                  <SetupConfigRow
                    label="Postgres connection"
                    value={postgresConnection}
                    copyText={postgresConfigured ? postgresConnection : undefined}
                    statusHint={postgresConfigured ? null : "Incomplete"}
                  />
                  <SetupConfigRow
                    label="POSTGRES_PASSWORD"
                    value={maskSecret(getEnv("POSTGRES_PASSWORD"))}
                    statusHint={getEnv("POSTGRES_PASSWORD") ? null : "Missing"}
                  />
                </div>
              </div>

              <div className="min-w-0 space-y-2 border-t border-border/35 pt-4">
                <div className="text-xs font-medium text-muted-foreground">Object storage</div>
                {fileProvider === "aws" ? (
                  <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                    <SetupConfigRow label="FILE_STORAGE_PROVIDER" value="aws" copyText="aws" />
                    <SetupConfigRow
                      label="AWS_REGION"
                      value={
                        getEnv("AWS_REGION")
                          ? awsRegionEffective
                          : `${awsRegionEffective} (default if unset)`
                      }
                      copyText={awsRegionEffective}
                    />
                    <SetupConfigRow
                      label="AWS_BUCKET_NAME"
                      value={awsBucket || "Not set"}
                      copyText={awsBucket}
                      statusHint={awsBucket ? null : "Missing"}
                    />
                    <SetupConfigRow
                      label="AWS_BUCKET_PREFIX"
                      value={getEnv("AWS_BUCKET_PREFIX") || "—"}
                      copyText={getEnv("AWS_BUCKET_PREFIX")}
                    />
                    <SetupConfigRow
                      label="AWS_ACCESS_KEY_ID"
                      value={maskSecret(awsKey)}
                      copyText={awsKey}
                      statusHint={awsKey ? null : "Missing"}
                    />
                    <SetupConfigRow
                      label="AWS_SECRET_ACCESS_KEY"
                      value={maskSecret(awsSecret)}
                      statusHint={awsSecret ? null : "Missing"}
                    />
                  </div>
                ) : fileProvider === "minio" ? (
                  <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                    <SetupConfigRow label="FILE_STORAGE_PROVIDER" value="minio" copyText="minio" />
                    <SetupConfigRow
                      label="S3_ENDPOINT"
                      value={s3Endpoint || "Not set"}
                      copyText={s3Endpoint}
                      statusHint={s3Endpoint ? null : "Missing"}
                    />
                    <SetupConfigRow
                      label="S3_PUBLIC_ENDPOINT"
                      value={getEnv("S3_PUBLIC_ENDPOINT") || "—"}
                      copyText={getEnv("S3_PUBLIC_ENDPOINT")}
                    />
                    <SetupConfigRow
                      label="MINIO_BUCKET_NAME"
                      value={minioBucket || "Not set"}
                      copyText={minioBucket}
                      statusHint={minioBucket ? null : "Missing"}
                    />
                    <SetupConfigRow
                      label="MINIO_BUCKET_PREFIX"
                      value={getEnv("MINIO_BUCKET_PREFIX") || "—"}
                      copyText={getEnv("MINIO_BUCKET_PREFIX")}
                    />
                    <SetupConfigRow
                      label="MINIO_ROOT_USER"
                      value={maskSecret(minioUser)}
                      copyText={minioUser}
                      statusHint={minioUser ? null : "Missing"}
                    />
                    <SetupConfigRow
                      label="MINIO_ROOT_PASSWORD"
                      value={maskSecret(minioPass)}
                      statusHint={minioPass ? null : "Missing"}
                    />
                  </div>
                ) : (
                  <SetupConfigRow
                    label="FILE_STORAGE_PROVIDER"
                    value={fileProvider}
                    statusHint="Unsupported"
                  />
                )}
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
