"use client";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { SystemIcon } from "@/src/components/ui/system-icon";
import { HelpTooltip } from "@/src/components/utils/HelpTooltip";
import { URLField } from "@/src/components/utils/URLField";
import { cn, searchSimpleIcons } from "@/src/lib/general-utils";
import { icons } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useSystemConfig } from "../context";

export function ConfigurationSection() {
  const { system, isNewSystem, setSystemId, setSystemName, setUrl, setIcon } = useSystemConfig();

  const [isIdManuallyEdited, setIsIdManuallyEdited] = useState(false);
  const [isIconMenuOpen, setIsIconMenuOpen] = useState(false);
  const [iconSearch, setIconSearch] = useState("");

  const handleUrlChange = useCallback(
    (url: string, _queryParams: Record<string, string>) => {
      setUrl(url);

      if (isNewSystem && !isIdManuallyEdited && url) {
        const sanitizedId = sanitizeSystemId(url);
        if (sanitizedId) {
          setSystemId(sanitizedId);
        }
      }
    },
    [isNewSystem, isIdManuallyEdited, setUrl, setSystemId],
  );

  const handleIdChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSystemId(e.target.value);
      setIsIdManuallyEdited(true);
    },
    [setSystemId],
  );

  const lucideOptions = useMemo(() => {
    const toKebab = (value: string) =>
      value
        .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
        .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
        .toLowerCase();

    const unique = new Set<string>();
    for (const key of Object.keys(icons)) {
      if (key === "icons" || key === "Icon") continue;
      unique.add(toKebab(key));
    }
    return Array.from(unique).sort();
  }, []);

  const filteredLucide = useMemo(() => {
    if (!iconSearch || iconSearch.trim().length < 2) return [];
    const lower = iconSearch.toLowerCase();
    return lucideOptions.filter((name) => name.includes(lower)).slice(0, 12);
  }, [iconSearch, lucideOptions]);

  const simpleIconSuggestions = useMemo(() => {
    if (!iconSearch || iconSearch.trim().length < 2) return [];
    return searchSimpleIcons(iconSearch.trim(), 12);
  }, [iconSearch]);

  const handleIconSelect = useCallback(
    (value: string) => {
      setIcon(value);
      setIsIconMenuOpen(false);
      setIconSearch("");
    },
    [setIcon],
  );

  const currentIconLabel = useMemo(() => {
    if (!system.icon) return "Auto (template/default)";
    return system.icon.replace(/^simpleicons:/, "").replace(/^lucide:/, "");
  }, [system.icon]);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="systemName" className="text-sm font-medium">
            System Display Name
          </Label>
          <HelpTooltip text="A human-readable display name for this system." />
        </div>
        <Input
          id="systemName"
          value={system.name || ""}
          onChange={(e) => setSystemName(e.target.value)}
          placeholder="e.g., My CRM API"
          className="h-10 rounded-lg border shadow-sm bg-muted/30 border-border/50 focus:border-primary/50 transition-colors"
        />
      </div>

      {!isNewSystem && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="systemId" className="text-sm font-medium">
              System ID
            </Label>
            <HelpTooltip text="Auto-generated unique identifier. Cannot be changed." />
          </div>
          <Input
            id="systemId"
            value={system.id}
            disabled
            className="h-10 rounded-lg border shadow-sm bg-muted/30 border-border/50 font-mono text-xs"
          />
        </div>
      )}

      {isNewSystem && (
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
            className="h-10 rounded-lg border shadow-sm bg-muted/30 border-border/50 focus:border-primary/50 transition-colors"
          />
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="apiEndpoint" className="text-sm font-medium">
            System Endpoint
          </Label>
          <HelpTooltip text="The base URL of the API (e.g., https://api.example.com/v1)." />
        </div>
        <URLField url={system.url || ""} onUrlChange={handleUrlChange} />
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="systemIcon" className="text-sm font-medium">
            System Icon
          </Label>
          <HelpTooltip text="Override the system icon. Supports Simple Icons and Lucide icons." />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg border border-border/60 bg-muted/30">
            <SystemIcon system={system} size={18} />
          </div>
          <Button
            id="systemIcon"
            variant="outline"
            role="combobox"
            aria-expanded={isIconMenuOpen}
            className="flex-1 justify-between h-10 rounded-lg border shadow-sm bg-muted/30 border-border/50"
            onClick={() => setIsIconMenuOpen((prev) => !prev)}
          >
            <span className={cn("truncate text-sm", !system.icon && "text-muted-foreground")}>
              {currentIconLabel}
            </span>
            <span className="text-xs text-muted-foreground">Change</span>
          </Button>
        </div>
        {isIconMenuOpen && (
          <div
            className={cn(
              "mt-2 p-3 rounded-xl",
              "bg-muted/30 border border-border/50 backdrop-blur shadow-sm",
              "w-[min(360px,calc(100vw-2rem))]",
            )}
          >
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Search icons..."
                  value={iconSearch}
                  onChange={(e) => setIconSearch(e.target.value)}
                  className="h-9 bg-muted/40 border-border/50"
                />
                <Button variant="glass" className="h-9 px-3" onClick={() => handleIconSelect("")}>
                  Default
                </Button>
              </div>

              <div className="space-y-2">
                <div className="text-[11px] font-semibold text-muted-foreground">Simple Icons</div>
                {simpleIconSuggestions.length === 0 ? (
                  <div className="text-xs text-muted-foreground">
                    Type at least 2 characters to search.
                  </div>
                ) : (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
                    {simpleIconSuggestions.map((icon) => (
                      <button
                        key={`si-${icon.slug}`}
                        type="button"
                        onClick={() => handleIconSelect(`simpleicons:${icon.slug}`)}
                        className={cn(
                          "group rounded-lg px-2 py-1.5 text-left transition-colors",
                          "border border-border/50 bg-muted/20",
                          "hover:border-primary/50 hover:bg-muted/40",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <SystemIcon system={{ icon: `simpleicons:${icon.slug}` }} size={14} />
                          <span className="text-[11px] font-medium truncate">{icon.title}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="text-[11px] font-semibold text-muted-foreground">Lucide Icons</div>
                {filteredLucide.length === 0 ? (
                  <div className="text-xs text-muted-foreground">
                    Type at least 2 characters to search.
                  </div>
                ) : (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
                    {filteredLucide.map((name) => (
                      <button
                        key={`lucide-${name}`}
                        type="button"
                        onClick={() => handleIconSelect(`lucide:${name}`)}
                        className={cn(
                          "group rounded-lg px-2 py-1.5 text-left transition-colors",
                          "border border-border/50 bg-muted/20",
                          "hover:border-primary/50 hover:bg-muted/40",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <SystemIcon system={{ icon: `lucide:${name}` }} size={14} />
                          <span className="text-[11px] font-medium truncate">{name}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
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
