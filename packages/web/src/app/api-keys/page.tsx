"use client";

import { useSupabaseClient } from "@/src/app/config-context";
import { copyToClipboard } from "@/src/components/tools/shared/CopyButton";
import { Button } from "@/src/components/ui/button";
import { useToast } from "@/src/hooks/use-toast";
import {
  ApiKey,
  createApiKey,
  deleteApiKey,
  fetchApiKeys,
  toggleApiKey,
} from "@/src/supabase/client-utils";
import { Check, Copy, Loader2, Pause, Play, Plus, Shield, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

function ApiKeyRow({
  apiKey,
  copiedId,
  onCopy,
  onToggle,
  onDelete,
}: {
  apiKey: ApiKey;
  copiedId: string | null;
  onCopy: (text: string, id: string) => void;
  onToggle: (id: string, currentState: boolean) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 sm:p-4 bg-card rounded-lg border border-border gap-3 sm:gap-0">
      <div className={`flex-1 min-w-0 ${!apiKey.is_active ? "opacity-60" : ""}`}>
        <div className="font-mono text-base text-foreground break-all">
          {(apiKey.key as string).slice(0, 6)}
          {"•".repeat(Math.max(0, (apiKey.key as string).length - 6))}
        </div>
        <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-2 gap-y-0.5 items-center">
          <span className="whitespace-nowrap">
            {new Date(apiKey.created_at).toLocaleDateString()}
          </span>
          {apiKey.created_by_email && (
            <span className="whitespace-nowrap truncate max-w-[150px] sm:max-w-none">
              {apiKey.created_by_email}
            </span>
          )}
          <span
            className={`whitespace-nowrap ${apiKey.is_active ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
          >
            {apiKey.is_active ? "Active" : "Inactive"}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1 sm:space-x-2 sm:ml-4 self-end sm:self-auto">
        <Button
          onClick={() => onCopy(apiKey.key as string, apiKey.id)}
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title="Copy to clipboard"
        >
          {copiedId === apiKey.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
        <Button
          onClick={() => onToggle(apiKey.id, apiKey.is_active)}
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title={apiKey.is_active ? "Deactivate key" : "Activate key"}
        >
          {apiKey.is_active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <Button
          onClick={() => onDelete(apiKey.id)}
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title="Delete key"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default function ApiKeysPage(): React.ReactElement {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const { toast } = useToast();
  const supabase = useSupabaseClient();
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Only show admin keys (non-restricted)
  const adminKeys = useMemo(() => apiKeys.filter((k) => !k.is_restricted), [apiKeys]);

  useEffect(() => {
    if (!supabase) return;
    const fetchKeys = async () => {
      setIsLoading(true);
      try {
        const keys = await fetchApiKeys(supabase);
        setApiKeys(keys);
      } catch (error) {
        console.error("Failed to fetch API keys:", error);
        toast({
          title: "Failed to fetch API keys",
          description: "Please try again later",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };
    fetchKeys();
  }, []);

  const handleCopy = async (text: string, id: string) => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1200);
    }
  };

  const handleCreateClick = async () => {
    try {
      const created = await createApiKey(supabase, { isRestricted: false, allowedTools: ["*"] });
      if (created) {
        setApiKeys((prev) => [created, ...prev]);
        // Copy to clipboard automatically
        const success = await copyToClipboard(created.key);
        if (success) {
          setCopiedId(created.id);
          setTimeout(() => setCopiedId(null), 2000);
          toast({
            title: "Admin key created",
            description: "The key has been copied to your clipboard.",
          });
        }
      }
    } catch (error) {
      console.error("Failed to create API key:", error);
      toast({
        title: "Failed to create API key",
        description: "Please try again later",
        variant: "destructive",
      });
    }
  };

  const handleDeleteClick = async (id: string) => {
    const prev = apiKeys;
    setApiKeys(prev.filter((k) => k.id !== id));
    try {
      const ok = await deleteApiKey(id, supabase);
      if (!ok) {
        setApiKeys(prev);
      }
    } catch (error) {
      console.error("Failed to delete API key:", error);
      setApiKeys(prev);
      toast({
        title: "Failed to delete API key",
        description: "Please try again later",
        variant: "destructive",
      });
    }
  };

  const handleToggleClick = async (id: string, currentState: boolean) => {
    const prev = apiKeys;
    setApiKeys(prev.map((k) => (k.id === id ? { ...k, is_active: !currentState } : k)));
    try {
      const updated = await toggleApiKey(id, currentState, supabase);
      if (updated) {
        setApiKeys((list) =>
          list.map((k) => (k.id === id ? { ...k, is_active: updated.is_active } : k)),
        );
      }
    } catch (error) {
      console.error("Failed to toggle API key:", error);
      setApiKeys(prev);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 max-w-none w-full min-h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-8">
      {/* Admin Keys Section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-lg font-semibold">Admin Keys</h2>
          </div>
          <Button onClick={handleCreateClick} size="sm" variant="outline">
            <Plus className="w-4 h-4 mr-1" />
            New Admin Key
          </Button>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Full access to manage tools, systems, and GraphQL API. For internal use only.
        </p>
        {adminKeys.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm border border-dashed rounded-lg">
            No admin keys. Create one for internal or CI/CD use.
          </div>
        ) : (
          <div className="space-y-3">
            {adminKeys.map((apiKey) => (
              <ApiKeyRow
                key={apiKey.id}
                apiKey={apiKey}
                copiedId={copiedId}
                onCopy={handleCopy}
                onToggle={handleToggleClick}
                onDelete={handleDeleteClick}
              />
            ))}
          </div>
        )}
      </section>

      <p className="text-sm text-muted-foreground">
        End user API keys are automatically created when you add end users in the Organization
        settings.
      </p>
    </div>
  );
}
