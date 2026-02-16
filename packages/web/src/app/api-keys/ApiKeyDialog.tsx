"use client";

import { useTools } from "@/src/app/tools-context";
import { Button } from "@/src/components/ui/button";
import { Checkbox } from "@/src/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Label } from "@/src/components/ui/label";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Switch } from "@/src/components/ui/switch";
import { useEndUsers } from "@/src/hooks/use-end-users";
import { ApiKey } from "@/src/supabase/client-utils";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

export type KeyType = "admin" | "enduser";

export interface ApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The type of key being created/edited */
  keyType: KeyType;
  /** If provided, we're editing an existing key. Otherwise, creating a new one. */
  editingKey?: ApiKey | null;
  onSave: (data: {
    isRestricted: boolean;
    allowedTools: string[] | null;
    endUserId?: string | null;
  }) => Promise<void>;
  isSaving?: boolean;
}

export function ApiKeyDialog({
  open,
  onOpenChange,
  keyType,
  editingKey,
  onSave,
  isSaving = false,
}: ApiKeyDialogProps) {
  // null = all tools allowed, string[] = specific tools only
  const [allowAllTools, setAllowAllTools] = useState(true);
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [selectedEndUserId, setSelectedEndUserId] = useState<string | null>(null);
  const { tools } = useTools();
  const { endUsers, isLoading: isLoadingEndUsers, error: endUsersError } = useEndUsers();

  const isCreateMode = !editingKey;
  const isEndUser = keyType === "enduser";

  // Reset state when dialog opens or editingKey changes
  useEffect(() => {
    if (open) {
      if (editingKey) {
        // ['*'] means all tools allowed, also treat legacy null/undefined as "all tools"
        // to avoid downgrading existing keys when editing
        const isAllTools =
          !editingKey.allowed_tools ||
          (editingKey.allowed_tools.length === 1 && editingKey.allowed_tools[0] === "*");
        setAllowAllTools(isAllTools);
        setSelectedTools(isAllTools ? [] : editingKey.allowed_tools);
        setSelectedEndUserId(editingKey.user_id || null);
      } else {
        // New keys default to all tools allowed
        setAllowAllTools(true);
        setSelectedTools([]);
        setSelectedEndUserId(null);
      }
    }
  }, [open, editingKey]);

  const toggleToolSelection = (toolId: string) => {
    setSelectedTools((prev) =>
      prev.includes(toolId) ? prev.filter((id) => id !== toolId) : [...prev, toolId],
    );
  };

  const handleSave = async () => {
    await onSave({
      isRestricted: isEndUser,
      // ['*'] = all tools, otherwise the selected list
      allowedTools: isEndUser ? (allowAllTools ? ["*"] : selectedTools) : ["*"],
      endUserId: isEndUser ? selectedEndUserId : null,
    });
  };

  const title = isCreateMode
    ? isEndUser
      ? "Create End User Key"
      : "Create Admin Key"
    : isEndUser
      ? "Edit End User Key"
      : "Edit Admin Key";

  const description = isEndUser
    ? "End user keys can only execute specific tools via REST API and MCP."
    : "Admin keys have full access to manage tools, systems, and use the GraphQL API.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {isEndUser ? (
            <div className="space-y-4">
              {/* End User Assignment */}
              <div className="space-y-2">
                <Label htmlFor="end-user-select">
                  Assign to End User <span className="text-destructive">*</span>
                </Label>
                {endUsersError ? (
                  <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-center">
                    <p className="text-sm text-destructive">
                      Failed to load end users. Please try again.
                    </p>
                  </div>
                ) : endUsers.length === 0 && !isLoadingEndUsers ? (
                  <div className="rounded-md bg-muted/50 border border-border p-3 text-center">
                    <p className="text-sm text-muted-foreground mb-2">
                      No end users found. Create one first.
                    </p>
                    <a
                      href="/?view=organization"
                      className="text-sm text-primary hover:underline"
                      onClick={() => onOpenChange(false)}
                    >
                      Go to Organization →
                    </a>
                  </div>
                ) : (
                  <Select
                    value={selectedEndUserId || ""}
                    onValueChange={(value) => setSelectedEndUserId(value || null)}
                  >
                    <SelectTrigger id="end-user-select">
                      <SelectValue placeholder="Select an end user..." />
                    </SelectTrigger>
                    <SelectContent>
                      {isLoadingEndUsers ? (
                        <SelectItem value="loading" disabled>
                          Loading...
                        </SelectItem>
                      ) : (
                        endUsers.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.name || user.email || user.externalId}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                )}
                <p className="text-xs text-muted-foreground">
                  This key will use the end user's credentials for multi-tenancy systems.
                </p>
              </div>

              {/* Tool Access */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="allow-all-tools">Allow All Tools</Label>
                  <Switch
                    id="allow-all-tools"
                    checked={allowAllTools}
                    onCheckedChange={setAllowAllTools}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {allowAllTools
                    ? "This key can execute any tool, including newly created ones."
                    : "Restrict this key to specific tools only."}
                </p>
              </div>

              {!allowAllTools && (
                <>
                  <div className="flex items-center justify-between pt-2">
                    <Label>Select Tools</Label>
                    <span className="text-xs text-muted-foreground">
                      {selectedTools.length} selected
                    </span>
                  </div>
                  <ScrollArea className="h-[200px] rounded-md border p-2">
                    {tools.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No tools available
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {tools
                          .filter((t) => !t.archived)
                          .map((tool) => (
                            <label
                              key={tool.id}
                              className="flex items-center space-x-3 p-2 rounded hover:bg-muted cursor-pointer"
                            >
                              <Checkbox
                                checked={selectedTools.includes(tool.id)}
                                onCheckedChange={() => toggleToolSelection(tool.id)}
                              />
                              <span className="text-sm truncate">{tool.id}</span>
                            </label>
                          ))}
                      </div>
                    )}
                  </ScrollArea>
                  {selectedTools.length === 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      ⚠️ No tools selected — this key won't be able to execute anything
                    </p>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                This key will have <strong>full admin access</strong>. Only share with trusted team
                members or systems.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || (isEndUser && !selectedEndUserId)}>
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isCreateMode ? "Create Key" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
