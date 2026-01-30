"use client";

import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { HelpTooltip } from "@/src/components/utils/HelpTooltip";
import { URLField } from "@/src/components/utils/URLField";
import { composeUrl } from "@/src/lib/general-utils";
import { useCallback, useState } from "react";
import { useSystemConfig } from "../context";

export function ConfigurationSection() {
  const { system, isNewSystem, setSystemId, setSystemName, setUrlHost, setUrlPath } =
    useSystemConfig();

  const [isIdManuallyEdited, setIsIdManuallyEdited] = useState(false);

  const handleUrlChange = useCallback(
    (host: string, path: string) => {
      setUrlHost(host);
      setUrlPath(path);

      if (isNewSystem && !isIdManuallyEdited) {
        const fullUrl = composeUrl(host, path);
        if (fullUrl) {
          const sanitizedId = sanitizeSystemId(fullUrl);
          if (sanitizedId) {
            setSystemId(sanitizedId);
          }
        }
      }
    },
    [isNewSystem, isIdManuallyEdited, setUrlHost, setUrlPath, setSystemId],
  );

  const handleIdChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSystemId(e.target.value);
      setIsIdManuallyEdited(true);
    },
    [setSystemId],
  );

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="systemId" className="text-sm font-medium">
            System ID
          </Label>
          <HelpTooltip text="A unique identifier for this system. You cannot change this after saving." />
        </div>
        <Input
          id="systemId"
          value={system.id}
          onChange={handleIdChange}
          placeholder="e.g., crm-api"
          disabled={!isNewSystem}
          className="h-10 bg-background/50 border-border/60 focus:border-primary/50 transition-colors"
        />
        {!isNewSystem && (
          <p className="text-xs text-muted-foreground/80">
            System ID cannot be changed after creation.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="systemName" className="text-sm font-medium">
            Display Name
          </Label>
          <HelpTooltip text="An optional friendly name for this system." />
        </div>
        <Input
          id="systemName"
          value={system.name || ""}
          onChange={(e) => setSystemName(e.target.value)}
          placeholder="e.g., My CRM API"
          className="h-10 bg-background/50 border-border/60 focus:border-primary/50 transition-colors"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="apiEndpoint" className="text-sm font-medium">
            System Endpoint
          </Label>
          <HelpTooltip text="The base URL of the API (e.g., https://api.example.com/v1)." />
        </div>
        <URLField
          url={composeUrl(system.urlHost, system.urlPath) || ""}
          onUrlChange={handleUrlChange}
        />
      </div>
    </div>
  );
}

function sanitizeSystemId(id: string): string {
  if (id.startsWith("postgres://") || id.startsWith("postgresql://")) {
    try {
      const url = new URL(id);
      let host = url.host;
      const database = url.pathname.substring(1);

      if (host.length > 20) {
        host = host.substring(0, 20);
      }

      let cleanId = `DB-${host}-${database}`;

      return cleanId
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
    } catch {}
  }

  try {
    const url = new URL(id);
    let cleanId = url.host;
    return cleanId
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  } catch {}

  let cleanId = id.replace(/^.*:\/\//, "");
  cleanId = cleanId.replace(/^[^@]*@/, "");

  const slashIndex = cleanId.indexOf("/");
  if (slashIndex !== -1) {
    cleanId = cleanId.substring(0, slashIndex);
  }

  return cleanId
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
