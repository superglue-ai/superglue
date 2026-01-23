"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { AgentInterface } from "@/src/components/agent/AgentInterface";
import { getDiscoveryPrompts } from "@/src/lib/agent/agent-context";

export default function DiscoveryAgentPage() {
  const searchParams = useSearchParams();

  const systemIds = searchParams.get("ids")?.split(",").filter(Boolean) || [];

  // Generate the prompts (memoized to prevent re-triggering)
  const prompts = useMemo(() => {
    if (systemIds.length === 0) return null;
    return getDiscoveryPrompts(systemIds);
  }, [systemIds.join(",")]);

  if (systemIds.length === 0) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <p className="text-muted-foreground">No systems specified.</p>
          <Link href="/discovery" className="text-primary hover:underline">
            Go to Discovery
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 w-full h-full">
      <AgentInterface discoveryPrompts={prompts} />
    </div>
  );
}
