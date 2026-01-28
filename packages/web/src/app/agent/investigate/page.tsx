"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { AgentInterface } from "@/src/components/agent/AgentInterface";
import { getInvestigationPrompts } from "@/src/lib/agent/agent-context";
import { useConfig } from "@/src/app/config-context";
import { tokenRegistry } from "@/src/lib/token-registry";
import { Run, SuperglueClient } from "@superglue/shared";
import { AlertCircle, Loader2 } from "lucide-react";
import Link from "next/link";

function InvestigateAgentContent() {
  const searchParams = useSearchParams();
  const runId = searchParams.get("runId");
  const config = useConfig();

  const [run, setRun] = useState<Run | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) {
      setLoading(false);
      return;
    }

    const fetchRun = async () => {
      try {
        setLoading(true);
        setError(null);
        const superglueClient = new SuperglueClient({
          endpoint: config.superglueEndpoint,
          apiKey: tokenRegistry.getToken(),
          apiEndpoint: config.apiEndpoint,
        });

        const runData = await superglueClient.getRun(runId);
        if (!runData) {
          setError("Run not found");
          return;
        }
        setRun(runData);
      } catch (err: any) {
        console.error("Error fetching run:", err);
        setError(err.message || "Failed to load run details");
      } finally {
        setLoading(false);
      }
    };

    fetchRun();
  }, [runId, config.superglueEndpoint, config.apiEndpoint]);

  // Generate the prompts (memoized to prevent re-triggering)
  const prompts = useMemo(() => {
    if (!run) return null;
    return getInvestigationPrompts(run);
  }, [run]);

  if (!runId) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <AlertCircle className="h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">No run ID specified.</p>
          <Link href="/admin?view=failures" className="text-primary hover:underline">
            Go to Failed Runs
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading run details...</p>
        </div>
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <p className="text-muted-foreground">{error || "Run not found"}</p>
          <Link href="/admin?view=failures" className="text-primary hover:underline">
            Go to Failed Runs
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 w-full h-full">
      <AgentInterface initialPrompts={prompts} />
    </div>
  );
}

export default function InvestigateAgentPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <InvestigateAgentContent />
    </Suspense>
  );
}
