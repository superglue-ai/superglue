"use client";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { parseCredentialsHelper } from "@/src/lib/client-utils";
import { cn } from "@/src/lib/general-utils";
import { Eye, EyeOff, KeyRound, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type Credential = {
  key: string;
  value: string;
};

interface CredentialsManagerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

function getDuplicateIndexesExceptFirst(creds: Credential[]): Set<number> {
  const keyMap = new Map<string, number[]>();
  creds.forEach((cred, idx) => {
    if (!cred.key.trim()) return;
    if (!keyMap.has(cred.key)) keyMap.set(cred.key, []);
    keyMap.get(cred.key)!.push(idx);
  });
  const dups = new Set<number>();
  for (const arr of keyMap.values()) {
    if (arr.length > 1) {
      // highlight all except the first
      arr.slice(1).forEach((idx) => dups.add(idx));
    }
  }
  return dups;
}

export function CredentialsManager({ value, onChange, className }: CredentialsManagerProps) {
  const [credentials, setCredentials] = useState<Credential[]>(() => {
    try {
      const parsedCreds = parseCredentialsHelper(value);
      return Object.entries(parsedCreds).map(([key, value]) => ({
        key,
        value: String(value),
      }));
    } catch {
      return [];
    }
  });
  const [showValues, setShowValues] = useState<Record<number, boolean>>({});
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newCredName, setNewCredName] = useState("");
  const [newCredValue, setNewCredValue] = useState("");
  const [showNewCredValue, setShowNewCredValue] = useState(false);
  const lastPushedValueRef = useRef(value);

  // Only set default row on first mount
  useEffect(() => {
    if (value === lastPushedValueRef.current) return;
    lastPushedValueRef.current = value;
    try {
      const parsedCreds = parseCredentialsHelper(value);
      const entries = Object.entries(parsedCreds).map(([key, value]) => ({
        key,
        value: String(value),
      }));
      setCredentials(entries.length > 0 ? entries : [{ key: "apiKey", value: "" }]);
    } catch (e) {
      setCredentials([{ key: "", value: "" }]);
    }
  }, [value]);

  // Compute duplicate indexes for UI and output
  const duplicateIndexes = useMemo(
    () => getDuplicateIndexesExceptFirst(credentials),
    [credentials],
  );

  // Update the parent component when credentials change
  const updateCredentials = (newCredentials: Credential[]) => {
    setCredentials(newCredentials);
    const seen = new Set<string>();
    const validCreds = newCredentials.filter((cred, idx) => {
      if (!cred.key.trim()) return false;
      if (duplicateIndexes.has(idx)) return false;
      if (seen.has(cred.key)) return false;
      seen.add(cred.key);
      return true;
    });
    const credObject = validCreds.reduce(
      (obj, cred) => {
        obj[cred.key] = cred.value;
        return obj;
      },
      {} as Record<string, string>,
    );
    onChange(JSON.stringify(credObject, null, 2));
    lastPushedValueRef.current = JSON.stringify(credObject, null, 2);
  };

  // Add a new credential
  const addCredential = () => {
    updateCredentials([...credentials, { key: "", value: "" }]);
  };

  // Remove a credential
  const removeCredential = (index: number) => {
    updateCredentials(credentials.filter((_, i) => i !== index));
  };

  // Update a credential key or value
  const updateCredential = (index: number, field: "key" | "value", newValue: string) => {
    const newCredentials = credentials.map((cred, i) =>
      i === index ? { ...cred, [field]: newValue } : cred,
    );
    updateCredentials(newCredentials);
  };

  const toggleShowValue = (index: number) => {
    setShowValues((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  return (
    <div className={cn(className)}>
      <div className="w-full">
        <div className="space-y-2">
          {credentials.map((cred, index) => (
            <div
              key={index}
              className={cn(
                "group flex items-center gap-3 p-3 rounded-lg border bg-card transition-all",
                "hover:shadow-sm hover:border-border/80",
                duplicateIndexes.has(index) && "border-red-500/50 bg-red-500/5",
              )}
            >
              <div className="flex-shrink-0 p-2 rounded-md bg-muted">
                <KeyRound className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium truncate">{cred.key}</span>
                  {duplicateIndexes.has(index) && (
                    <span className="text-[10px] text-red-500 font-medium">Duplicate</span>
                  )}
                </div>
                <div className="relative">
                  <Input
                    type={showValues[index] ? "text" : "password"}
                    value={cred.value}
                    onChange={(e) => updateCredentialValue(index, e.target.value)}
                    placeholder="Enter value..."
                    className="h-8 text-xs pr-8 bg-background"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-8 w-8 hover:bg-transparent"
                    onClick={() => toggleShowValue(index)}
                  >
                    {showValues[index] ? (
                      <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                onClick={() => removeCredential(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsAddDialogOpen(true)}
            className="h-10 border-dashed hover:border-solid hover:bg-muted/50 transition-all"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Credential
          </Button>
        </div>
      )}

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="p-2 rounded-md bg-primary/10">
                <KeyRound className="h-4 w-4 text-primary" />
              </div>
              Add Credential
            </DialogTitle>
            <DialogDescription>
              Add a new API key, token, or secret for this system.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="cred-name" className="text-sm font-medium">
                Credential Name
              </Label>
              <Input
                id="cred-name"
                value={newCredName}
                onChange={(e) => setNewCredName(e.target.value)}
                placeholder="e.g., api_key, bearer_token, client_secret"
                className={cn(
                  "h-10",
                  isDuplicateName &&
                    newCredName.trim() &&
                    "border-red-500 focus-visible:ring-red-500",
                )}
              />
              {isDuplicateName && newCredName.trim() && (
                <p className="text-xs text-red-500">A credential with this name already exists</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="cred-value" className="text-sm font-medium">
                Value
              </Label>
              <div className="relative">
                <Input
                  id="cred-value"
                  type={showNewCredValue ? "text" : "password"}
                  value={newCredValue}
                  onChange={(e) => setNewCredValue(e.target.value)}
                  placeholder="Enter your credential value"
                  className="h-10 pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-10 w-10 hover:bg-transparent"
                  onClick={() => setShowNewCredValue(!showNewCredValue)}
                >
                  {showNewCredValue ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2 min-w-[400px] p-1">
                {credentials.map((cred, index) => (
                  <div key={index} className="flex gap-1 w-full min-w-0 items-center">
                    <Input
                      value={cred.key}
                      onChange={(e) => updateCredential(index, "key", e.target.value)}
                      placeholder="apiKey"
                      className={cn(
                        "flex-1 h-7 text-xs min-w-0",
                        duplicateIndexes.has(index) && "border-2 border-red-500 bg-red-100/30",
                      )}
                    />
                    <div className="relative flex-[2]">
                      <Input
                        type={showValues[index] ? "text" : "password"}
                        value={cred.value}
                        onChange={(e) => updateCredential(index, "value", e.target.value)}
                        placeholder="Enter your API key"
                        className="h-7 text-xs min-w-0 pr-8"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-7 w-7 hover:bg-transparent"
                        onClick={() => toggleShowValue(index)}
                      >
                        {showValues[index] ? (
                          <EyeOff className="h-3 w-3 text-muted-foreground" />
                        ) : (
                          <Eye className="h-3 w-3 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 h-7 w-7"
                      onClick={() => removeCredential(index)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                    {duplicateIndexes.has(index) && cred.key.trim() && (
                      <span className="ml-2 text-xs text-red-600 whitespace-nowrap">
                        Credential "{cred.key}" already defined
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          {credentials.length > 0 && (
            <Button variant="outline" size="sm" onClick={addCredential} className="text-xs h-6">
              <Plus className="w-3 h-3 mr-1" />
              Add Field
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
