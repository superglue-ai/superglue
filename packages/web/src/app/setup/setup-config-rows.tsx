"use client";

import { CopyButton } from "@/src/components/tools/shared/CopyButton";
import { cn } from "@/src/lib/general-utils";
import type { SimpleIcon } from "simple-icons";
import {
  siAmazonwebservices,
  siAnthropic,
  siGooglecloud,
  siGooglegemini,
  siOpenai,
} from "simple-icons";
import type { CheckStatus, ProviderKey, ProviderSummary } from "./types";

const providerMeta: Record<ProviderKey, { label: string; monogram: string }> = {
  openai: { label: "OpenAI", monogram: "O" },
  anthropic: { label: "Anthropic", monogram: "A" },
  gemini: { label: "Gemini", monogram: "G" },
  azure: { label: "Azure", monogram: "Az" },
  bedrock: { label: "Bedrock", monogram: "B" },
  vertex: { label: "Vertex", monogram: "V" },
};

const BRAND_BY_PROVIDER: Partial<Record<ProviderKey, SimpleIcon>> = {
  openai: siOpenai,
  anthropic: siAnthropic,
  gemini: siGooglegemini,
  vertex: siGooglecloud,
  bedrock: siAmazonwebservices,
};

function statusHint(status?: CheckStatus): string | null {
  if (status === "missing") return "Missing";
  if (status === "warn") return "Partial";
  return null;
}

export function SetupConfigRow({
  label,
  value,
  copyText,
  statusHint: rowStatus,
  className,
}: {
  label: string;
  value: string;
  copyText?: string;
  statusHint?: string | null;
  className?: string;
}) {
  const showCopy = typeof copyText === "string" && copyText.length > 0;

  return (
    <div
      className={cn(
        "min-w-0 max-w-full rounded-xl border border-border/35 bg-background/25 px-3 py-2.5 backdrop-blur-md",
        className,
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <span className="min-w-0 truncate text-xs text-muted-foreground">{label}</span>
        {rowStatus ? (
          <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
            {rowStatus}
          </span>
        ) : null}
      </div>
      <div className="mt-1.5 flex min-h-[2rem] min-w-0 max-w-full items-center gap-1 overflow-hidden rounded-md border border-border/25 bg-muted/15 pr-1">
        <div className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5">
          <code className="inline-block min-h-[1.25rem] whitespace-nowrap px-2 py-1 text-xs leading-snug text-foreground/90">
            {value}
          </code>
        </div>
        {showCopy ? (
          <div className="flex shrink-0 self-stretch items-center border-l border-border/30 pl-0.5">
            <CopyButton text={copyText} className="h-8 w-8 shrink-0" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function BrandIcon({ providerKey }: { providerKey: ProviderKey }) {
  const brand = BRAND_BY_PROVIDER[providerKey];
  const meta = providerMeta[providerKey];
  if (!brand) {
    return (
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/35 bg-background/25 text-xs font-medium text-muted-foreground backdrop-blur-md">
        {meta.monogram}
      </div>
    );
  }
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/35 bg-background/25 backdrop-blur-md"
      aria-label={brand.title}
    >
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden>
        <path fill={`#${brand.hex}`} d={brand.path} />
      </svg>
    </div>
  );
}

export function ModelProviderCard({ summary }: { summary: ProviderSummary }) {
  return (
    <div className="min-w-0 max-w-full rounded-2xl border border-border/35 bg-background/20 p-4 backdrop-blur-md">
      <div className="flex min-w-0 items-start gap-3">
        <BrandIcon providerKey={summary.key} />
        <div className="min-w-0 flex-1 pt-1 text-sm font-medium">
          {summary.label}
          {summary.model ? ` · ${summary.model}` : ""}
        </div>
      </div>

      <div className="mt-3 grid min-w-0 gap-2">
        {summary.details.map((detail) => (
          <SetupConfigRow
            key={`${summary.key}-${detail.label}`}
            label={detail.label}
            value={detail.value}
            copyText={detail.copyValue}
            statusHint={statusHint(detail.status)}
          />
        ))}
      </div>
    </div>
  );
}
