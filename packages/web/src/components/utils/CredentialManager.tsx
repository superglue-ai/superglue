"use client";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { parseCredentialsHelper } from "@/src/lib/client-utils";
import { cn } from "@/src/lib/general-utils";
import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [showValues, setShowValues] = useState<Record<number, boolean>>({});

  // Only set default row on first mount
  useEffect(() => {
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
  }, []);

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
          <div className="overflow-x-auto w-full">
            {credentials.length === 0 ? (
              <div className="flex justify-center py-2 border rounded-md border-dashed">
                <Button variant="outline" size="sm" onClick={addCredential} className="h-7 text-xs">
                  <Plus className="w-3 h-3 mr-1" />
                  Add
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
