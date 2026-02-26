"use client";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
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
  placeholder?: string; // Placeholder text for field name input
  templateMode?: boolean; // If true, only accept field names (no values)
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
      arr.slice(1).forEach((idx) => dups.add(idx));
    }
  }
  return dups;
}

export function CredentialsManager({
  value,
  onChange,
  className,
  placeholder = "e.g., api_key, bearer_token, client_secret",
  templateMode = false,
}: CredentialsManagerProps) {
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

  useEffect(() => {
    if (value === lastPushedValueRef.current) return;
    lastPushedValueRef.current = value;
    try {
      const parsedCreds = parseCredentialsHelper(value);
      const entries = Object.entries(parsedCreds).map(([key, value]) => ({
        key,
        value: String(value),
      }));
      setCredentials(entries);
    } catch (e) {
      setCredentials([]);
    }
  }, [value]);

  const duplicateIndexes = useMemo(
    () => getDuplicateIndexesExceptFirst(credentials),
    [credentials],
  );

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

  const handleAddCredential = () => {
    if (!newCredName.trim()) return;

    const isDuplicate = credentials.some((c) => c.key === newCredName.trim());
    if (isDuplicate) return;

    updateCredentials([
      ...credentials,
      { key: newCredName.trim(), value: templateMode ? "" : newCredValue },
    ]);
    setNewCredName("");
    setNewCredValue("");
    setShowNewCredValue(false);
    setIsAddDialogOpen(false);
  };

  const removeCredential = (index: number) => {
    updateCredentials(credentials.filter((_, i) => i !== index));
  };

  const updateCredentialValue = (index: number, newValue: string) => {
    const newCredentials = credentials.map((cred, i) =>
      i === index ? { ...cred, value: newValue } : cred,
    );
    updateCredentials(newCredentials);
  };

  const toggleShowValue = (index: number) => {
    setShowValues((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const isDuplicateName = credentials.some((c) => c.key === newCredName.trim());

  return (
    <div className={cn(className)}>
      {credentials.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-8 border border-dashed rounded-xl bg-background/40 backdrop-blur-sm hover:bg-background/60 transition-colors cursor-pointer"
          onClick={() => setIsAddDialogOpen(true)}
        >
          <div className="p-3 rounded-full bg-muted mb-3">
            <KeyRound className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-muted-foreground mb-1">
            No credentials configured
          </p>
          <p className="text-xs text-muted-foreground/70">Click to add your first credential</p>
        </div>
      ) : (
        <div className="space-y-2">
          {credentials.map((cred, index) => (
            <div
              key={index}
              className={cn(
                "group flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-muted/60 to-muted/30 border border-border/50 transition-all",
                "hover:from-muted/70 hover:to-muted/40",
                duplicateIndexes.has(index) && "border-red-500/50 bg-red-500/5",
              )}
            >
              <div className="flex-shrink-0 p-2 rounded-md">
                <KeyRound className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium truncate">{cred.key}</span>
                  {duplicateIndexes.has(index) && (
                    <span className="text-[10px] text-red-500 font-medium">Duplicate</span>
                  )}
                </div>
                {!templateMode && (
                  <div className="relative">
                    <Input
                      type={showValues[index] ? "text" : "password"}
                      value={cred.value}
                      onChange={(e) => updateCredentialValue(index, e.target.value)}
                      placeholder="Enter value..."
                      autoComplete="new-password"
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
                )}
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
            variant="glass"
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
              {templateMode ? "Add Credential Field" : "Add Credential"}
            </DialogTitle>
            <DialogDescription>
              {templateMode
                ? "Add the name of a credential field that end users will provide."
                : "Add a new API key, token, or secret for this system."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="cred-name" className="text-sm font-medium">
                {templateMode ? "Field Name" : "Credential Name"}
              </Label>
              <Input
                id="cred-name"
                value={newCredName}
                onChange={(e) => setNewCredName(e.target.value)}
                placeholder={placeholder}
                autoComplete="off"
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
            {!templateMode && (
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
                    autoComplete="new-password"
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
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="glass"
              onClick={() => {
                setIsAddDialogOpen(false);
                setNewCredName("");
                setNewCredValue("");
                setShowNewCredValue(false);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleAddCredential} disabled={!newCredName.trim() || isDuplicateName}>
              {templateMode ? "Add Field" : "Add Credential"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
