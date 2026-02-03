"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { AgentInterface } from "@/src/components/agent/AgentInterface";
import { getInvestigationPrompts } from "@/src/lib/agent/agent-context";
import { useConfig } from "@/src/app/config-context";
import { tokenRegistry } from "@/src/lib/token-registry";
import { Run, SuperglueClient, StoredRunResults } from "@superglue/shared";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { createEESuperglueClient } from "@/src/lib/ee-superglue-client";

// Test run ID used in Slack test notifications
const TEST_RUN_ID = "00000000-0000-0000-0000-000000000000";

function InvestigateAgentContent() {
  const searchParams = useSearchParams();
  const runId = searchParams.get("runId");
  const config = useConfig();

  const [run, setRun] = useState<Run | null>(null);
  const [storedResults, setStoredResults] = useState<StoredRunResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check if this is a test notification run
  const isTestRun = runId === TEST_RUN_ID;

  useEffect(() => {
    if (!runId || isTestRun) {
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

        // If the run has stored results, fetch them
        setStoredResults(null);
        if (runData.resultStorageUri) {
          try {
            const eeClient = createEESuperglueClient(config.superglueEndpoint, config.apiEndpoint);
            const results = await eeClient.getRunResults(runId);
            if (results) {
              setStoredResults(results);
            }
          } catch (err) {
            console.warn("Failed to fetch stored results:", err);
            // Don't fail the whole page if results fetch fails
          }
        }
      } catch (err: any) {
        console.error("Error fetching run:", err);
        setError(err.message || "Failed to load run details");
      } finally {
        setLoading(false);
      }
    };

    fetchRun();
  }, [runId, isTestRun, config.superglueEndpoint, config.apiEndpoint]);

  // Generate the prompts (memoized to prevent re-triggering)
  const prompts = useMemo(() => {
    if (!run) return null;
    return getInvestigationPrompts(run, storedResults);
  }, [run, storedResults]);

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

  // Show friendly message for test notification runs
  if (isTestRun) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <CheckCircle2 className="h-12 w-12 text-green-500" />
          <div className="text-center space-y-2">
            <h2 className="text-lg font-semibold">Test Notification</h2>
            <p className="text-muted-foreground max-w-md">
              This link came from a test notification. When a real tool run completes, clicking
              &quot;Investigate&quot; will open the AI agent with the run details pre-loaded, ready
              to help you understand or debug the execution.
            </p>
          </div>
          <div className="flex gap-3 mt-2">
            <Link href="/admin?view=runs" className="text-sm text-primary hover:underline">
              View All Runs
            </Link>
            <span className="text-muted-foreground">•</span>
            <Link href="/agent" className="text-sm text-primary hover:underline">
              Open Agent
            </Link>
          </div>
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
