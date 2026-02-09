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
  updateApiKey,
} from "@/src/supabase/client-utils";
import {
  Check,
  Copy,
  Loader2,
  Pause,
  Pencil,
  Play,
  Plus,
  Shield,
  Trash2,
  User,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ApiKeyDialog, KeyType } from "@/src/app/api-keys/ApiKeyDialog";

function ApiKeyRow({
  apiKey,
  copiedId,
  onCopy,
  onEdit,
  onToggle,
  onDelete,
}: {
  apiKey: ApiKey;
  copiedId: string | null;
  onCopy: (text: string, id: string) => void;
  onEdit: (key: ApiKey) => void;
  onToggle: (id: string, currentState: boolean) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 sm:p-4 rounded-2xl bg-gradient-to-br from-muted/50 to-muted/30 dark:from-muted/50 dark:to-muted/30 backdrop-blur-sm border border-border/50 dark:border-border/70 shadow-sm gap-3 sm:gap-0">
      <div className={`flex-1 min-w-0 ${!apiKey.is_active ? "opacity-60" : ""}`}>
        <div className="font-mono text-sm text-foreground break-all">
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
            className={`whitespace-nowrap px-1.5 py-0.5 rounded text-xs ${apiKey.is_active ? "text-green-800 dark:text-green-300 bg-green-500/10" : "text-red-800 dark:text-red-300 bg-red-500/10"}`}
          >
            {apiKey.is_active ? "Active" : "Inactive"}
          </span>
          {apiKey.is_restricted && (
            <span className="text-muted-foreground">
              {apiKey.allowed_tools === null || apiKey.allowed_tools === undefined
                ? "All tools"
                : apiKey.allowed_tools.length > 0
                  ? `${apiKey.allowed_tools.length} tools`
                  : "No tools"}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 sm:space-x-1 sm:ml-4 self-end sm:self-auto">
        <Button
          onClick={() => onCopy(apiKey.key as string, apiKey.id)}
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title="Copy to clipboard"
        >
          {copiedId === apiKey.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
        {apiKey.is_restricted && (
          <Button
            onClick={() => onEdit(apiKey)}
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Edit allowed tools"
          >
            <Pencil className="h-4 w-4" />
          </Button>
        )}
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

export function ApiKeysView() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const { toast } = useToast();
  const supabase = useSupabaseClient();
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogKeyType, setDialogKeyType] = useState<KeyType>("admin");
  const [editingKey, setEditingKey] = useState<ApiKey | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Split keys by type
  const adminKeys = useMemo(() => apiKeys.filter((k) => !k.is_restricted), [apiKeys]);
  const endUserKeys = useMemo(() => apiKeys.filter((k) => k.is_restricted), [apiKeys]);

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

  const handleCreateClick = (keyType: KeyType) => {
    setEditingKey(null);
    setDialogKeyType(keyType);
    setDialogOpen(true);
  };

  const handleEditClick = (key: ApiKey) => {
    setEditingKey(key);
    setDialogKeyType(key.is_restricted ? "enduser" : "admin");
    setDialogOpen(true);
  };

  const handleDialogSave = async (data: {
    isRestricted: boolean;
    allowedTools: string[] | null;
  }) => {
    setIsSaving(true);
    try {
      if (editingKey) {
        const updated = await updateApiKey(editingKey.id, data, supabase);
        if (updated) {
          setApiKeys((list) =>
            list.map((k) =>
              k.id === editingKey.id
                ? {
                    ...k,
                    is_restricted: updated.is_restricted,
                    allowed_tools: updated.allowed_tools,
                  }
                : k,
            ),
          );
          setDialogOpen(false);
        }
      } else {
        const created = await createApiKey(supabase, data);
        if (created) {
          setApiKeys((prev) => [created, ...prev]);
          setDialogOpen(false);
        }
      }
    } catch (error) {
      console.error("Failed to save API key:", error);
      toast({
        title: editingKey ? "Failed to update API key" : "Failed to create API key",
        description: "Please try again later",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
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

  if (!supabase) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        API Keys are only available in multi-tenant mode.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">API Keys</h1>

      {/* Admin Keys Section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-lg font-semibold">Admin Keys</h2>
          </div>
          <Button onClick={() => handleCreateClick("admin")} size="sm" variant="glass">
            <Plus className="w-4 h-4" />
            New Admin Key
          </Button>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Full access to manage tools, systems, and GraphQL API. For internal use only.
        </p>
        {adminKeys.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm rounded-2xl bg-gradient-to-br from-muted/50 to-muted/30 dark:from-muted/50 dark:to-muted/30 backdrop-blur-sm border border-dashed border-border/50 dark:border-border/70">
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
                onEdit={handleEditClick}
                onToggle={handleToggleClick}
                onDelete={handleDeleteClick}
              />
            ))}
          </div>
        )}
      </section>

      {/* End User Keys Section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <h2 className="text-lg font-semibold">End User Keys</h2>
          </div>
          <Button onClick={() => handleCreateClick("enduser")} size="sm" variant="glass">
            <Plus className="w-4 h-4" />
            New End User Key
          </Button>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Limited to executing specific tools via REST API and MCP. Safe to distribute to external
          users or services.
        </p>
        {endUserKeys.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm rounded-2xl bg-gradient-to-br from-muted/50 to-muted/30 dark:from-muted/50 dark:to-muted/30 backdrop-blur-sm border border-dashed border-border/50 dark:border-border/70">
            No end user keys. Create one to give external users access to specific tools.
          </div>
        ) : (
          <div className="space-y-3">
            {endUserKeys.map((apiKey) => (
              <ApiKeyRow
                key={apiKey.id}
                apiKey={apiKey}
                copiedId={copiedId}
                onCopy={handleCopy}
                onEdit={handleEditClick}
                onToggle={handleToggleClick}
                onDelete={handleDeleteClick}
              />
            ))}
          </div>
        )}
      </section>

      <ApiKeyDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        keyType={dialogKeyType}
        editingKey={editingKey}
        onSave={handleDialogSave}
        isSaving={isSaving}
      />
    </div>
  );
}
