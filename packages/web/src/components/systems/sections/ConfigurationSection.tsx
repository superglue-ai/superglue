"use client";

import { useSystems, useDeleteSystem } from "@/src/queries/systems";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/src/components/ui/alert-dialog";
import { Button } from "@/src/components/ui/button";
import { EnvironmentBadge } from "@/src/components/ui/environment-label";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { SystemIcon } from "@/src/components/ui/system-icon";
import { HelpTooltip } from "@/src/components/utils/HelpTooltip";
import { URLField } from "@/src/components/utils/URLField";
import { useToast } from "@/src/hooks/use-toast";
import { cn, searchSimpleIcons } from "@/src/lib/general-utils";
import { icons, Shield, GitBranch, Plus, Trash2, Loader2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSystemConfig } from "../context";

export function ConfigurationSection() {
  const { system, isNewSystem, setSystemId, setSystemName, setUrl, setIcon } = useSystemConfig();
  const { toast } = useToast();
  const { systems, isTunnelConnected } = useSystems();
  const deleteSystemMutation = useDeleteSystem();
  const router = useRouter();

  const [isIdManuallyEdited, setIsIdManuallyEdited] = useState(false);
  const [isIconMenuOpen, setIsIconMenuOpen] = useState(false);
  const [iconSearch, setIconSearch] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const isPrivateSystem = !!system.tunnel;
  const tunnelConnected = isPrivateSystem && isTunnelConnected(system.tunnel!.tunnelId);

  // Environment state computation
  // With composite key model, linked systems have the same ID but different environment
  const linkedDevSystem = useMemo(() => {
    if (!system.id) return null;
    // Find a dev system with the same ID (but we're not viewing dev)
    if (system.environment === "dev") return null;
    return systems.find((s) => s.id === system.id && s.environment === "dev") || null;
  }, [systems, system.id, system.environment]);

  const linkedProdSystem = useMemo(() => {
    if (!system.id) return null;
    // Find a prod system with the same ID (but we're not viewing prod)
    if (system.environment === "prod") return null;
    return systems.find((s) => s.id === system.id && s.environment === "prod") || null;
  }, [systems, system.id, system.environment]);

  const envState = useMemo(() => {
    const isDev = system.environment === "dev";
    const isProd = system.environment === "prod";

    // With composite key, if both dev and prod exist for same ID, they're linked
    if (isDev && linkedProdSystem) return "linked-dev";
    if (isProd && linkedDevSystem) return "linked-prod";
    if (isDev) return "standalone-dev";
    if (isProd) return "standalone-prod";
    return "standalone-prod"; // Default to prod (all systems are now either dev or prod)
  }, [system.environment, linkedDevSystem, linkedProdSystem]);

  const handleCreateDevSystem = useCallback(() => {
    const systemName = system.name || system.id;
    const prompt = encodeURIComponent(
      `Create a development version of the "${systemName}" system with the same ID (${system.id}) but environment='dev'. The dev system should have the same structure but with development/sandbox credentials.`,
    );
    router.push(`/?prompt=${prompt}`);
  }, [system.id, system.name, router]);

  const handleCreateProdSystem = useCallback(() => {
    const systemName = system.name || system.id;
    const prompt = encodeURIComponent(
      `Create a production version of the "${systemName}" system with the same ID (${system.id}) but environment='prod'. The prod system should have the same structure but with production credentials.`,
    );
    router.push(`/?prompt=${prompt}`);
  }, [system.id, system.name, router]);

  const isViewingDev = system.environment === "dev";

  const handleDeleteLinkedSystem = useCallback(async () => {
    // With composite key model, delete the linked environment (same ID, different environment)
    const systemToDelete = isViewingDev ? linkedProdSystem : linkedDevSystem;
    if (!systemToDelete) return;

    deleteSystemMutation.mutate(
      { id: systemToDelete.id, options: { environment: systemToDelete.environment } },
      {
        onSuccess: () => {
          setDeleteDialogOpen(false);
          toast({
            title: "System deleted",
            description: `The ${isViewingDev ? "production" : "development"} configuration has been deleted.`,
          });
        },
        onError: (error) => {
          console.error("Error deleting system:", error);
          toast({
            title: "Error",
            description: "Failed to delete system",
            variant: "destructive",
          });
        },
      },
    );
  }, [isViewingDev, linkedProdSystem, linkedDevSystem, deleteSystemMutation, toast]);

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
      {isPrivateSystem && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-muted/30">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Private System</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span
              className={cn(
                "w-2 h-2 rounded-full",
                tunnelConnected ? "bg-green-500" : "bg-gray-400",
              )}
            />
            <span>{tunnelConnected ? "Connected" : "Disconnected"}</span>
          </div>
          <div className="ml-auto text-xs text-muted-foreground">
            Tunnel: <span className="font-mono">{system.tunnel!.tunnelId}</span>
            {system.tunnel!.targetName && (
              <>
                {" "}
                / Target: <span className="font-mono">{system.tunnel!.targetName}</span>
              </>
            )}
          </div>
        </div>
      )}

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

      {/* Environment Setting - only show for existing systems */}
      {!isNewSystem && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label className="text-sm font-medium">Environment</Label>
            <HelpTooltip text="Shows whether this system is for production or development use. Use the toggle in the header to switch between linked environments." />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-muted/30">
            {/* Left: Current environment */}
            <div className="flex items-center gap-2">
              <EnvironmentBadge type={system.environment === "dev" ? "dev" : "prod"} />
              <span className="text-sm text-muted-foreground">
                {system.environment === "dev" ? "Development" : "Production"}
              </span>
            </div>

            {/* Middle: Link indicator (only for linked systems) */}
            {(envState === "linked-dev" || envState === "linked-prod") && (
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-muted/50 border border-border/30">
                <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  Linked to {envState === "linked-dev" ? "prod" : "dev"}
                </span>
              </div>
            )}

            {/* Right: Action button */}
            <div>
              {/* Linked systems: Delete button */}
              {(envState === "linked-dev" || envState === "linked-prod") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteDialogOpen(true)}
                  className="h-8 gap-1.5 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete {envState === "linked-dev" ? "Prod" : "Dev"}
                </Button>
              )}

              {/* Standalone prod: Add dev button */}
              {envState === "standalone-prod" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCreateDevSystem}
                  className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
                >
                  <Plus className="h-4 w-4" />
                  Add Dev
                </Button>
              )}

              {/* Standalone dev: Add prod button */}
              {envState === "standalone-dev" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCreateProdSystem}
                  className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
                >
                  <Plus className="h-4 w-4" />
                  Add Prod
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete linked system confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {isViewingDev ? "Production" : "Development"} System?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the linked {isViewingDev ? "production" : "development"} system. The
              current system will become a standalone {isViewingDev ? "development" : "production"}{" "}
              system. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteSystemMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteLinkedSystem}
              disabled={deleteSystemMutation.isPending}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleteSystemMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
