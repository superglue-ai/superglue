"use client";

import { useConfig } from "@/src/app/config-context";
import { SystemConfigProvider } from "@/src/components/systems/context";
import { SystemPlayground } from "@/src/components/systems/SystemPlayground";
import { createSuperglueClient } from "@/src/lib/client-utils";
import type { System } from "@superglue/shared";
import { Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function SystemPage() {
  const params = useParams();
  const router = useRouter();
  const config = useConfig();

  const systemId = params.id as string;
  const isNew = systemId === "new";

  const [system, setSystem] = useState<System | null>(null);
  const [isLoading, setIsLoading] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isNew) {
      setSystem(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    const loadSystem = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const client = createSuperglueClient(config.superglueEndpoint, config.apiEndpoint);
        const fetchedSystem = await client.getSystem(decodeURIComponent(systemId));

        if (fetchedSystem) {
          setSystem(fetchedSystem);
        } else {
          setError("System not found");
        }
      } catch (err) {
        console.error("Error loading system:", err);
        setError("Failed to load system");
      } finally {
        setIsLoading(false);
      }
    };

    loadSystem();
  }, [systemId, isNew, config.superglueEndpoint, config.apiEndpoint]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <p className="text-lg text-muted-foreground">{error}</p>
        <button onClick={() => router.push("/systems")} className="text-primary hover:underline">
          Back to Systems
        </button>
      </div>
    );
  }

  return (
    <SystemConfigProvider initialSystem={system || undefined} isNew={isNew} isOnboarding={isNew}>
      <SystemPlayground />
    </SystemConfigProvider>
  );
}
