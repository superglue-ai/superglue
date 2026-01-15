"use client";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Switch } from "@/src/components/ui/switch";
import { FilterAction, FilterTarget, RemoveScope, ResponseFilter } from "@superglue/shared";
import {
  AlertTriangle,
  CreditCard,
  Hash,
  Key,
  Mail,
  Phone,
  Plus,
  Shield,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";

interface ResponseFiltersCardProps {
  filters: ResponseFilter[];
  onChange: (filters: ResponseFilter[]) => void;
  disabled?: boolean;
}

type MatchMode = "contains" | "equals" | "regex";

interface FilterUIState {
  matchMode: MatchMode;
  simpleValue: string;
  presetId?: string; // Track if this is a preset filter
}

// Presets for common filters
const PRESETS = [
  {
    id: "emails",
    label: "Emails",
    icon: Mail,
    pattern: "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}",
    target: FilterTarget.VALUES,
    action: FilterAction.MASK,
    name: "Email addresses",
  },
  {
    id: "ssn",
    label: "SSN",
    icon: Hash,
    pattern: "\\d{3}[- ]?\\d{2}[- ]?\\d{4}",
    target: FilterTarget.VALUES,
    action: FilterAction.MASK,
    name: "Social Security Numbers",
  },
  {
    id: "credit-card",
    label: "Credit Cards",
    icon: CreditCard,
    pattern: "\\d{4}[- ]?\\d{4}[- ]?\\d{4}[- ]?\\d{4}|\\d{4}[- ]?\\d{6}[- ]?\\d{5}",
    target: FilterTarget.VALUES,
    action: FilterAction.MASK,
    name: "Credit card numbers",
  },
  {
    id: "passwords",
    label: "Passwords",
    icon: Key,
    pattern: "password|passwd|secret|token|api[_-]?key",
    target: FilterTarget.KEYS,
    action: FilterAction.REMOVE,
    name: "Password fields",
  },
  {
    id: "phone",
    label: "Phone",
    icon: Phone,
    pattern: "\\+?\\d{1,3}[- ]?\\(?\\d{3}\\)?[- ]?\\d{3}[- ]?\\d{4}",
    target: FilterTarget.VALUES,
    action: FilterAction.MASK,
    name: "Phone numbers",
  },
];

// Convert simple value + mode to regex pattern
function toRegexPattern(value: string, mode: MatchMode): string {
  if (mode === "regex") return value;
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (mode === "equals") return `^${escaped}$`;
  return escaped;
}

// Try to detect if a pattern is simple equals/contains or complex regex
function detectMatchMode(pattern: string): { mode: MatchMode; simpleValue: string } {
  if (!pattern) return { mode: "contains", simpleValue: "" };

  if (pattern.startsWith("^") && pattern.endsWith("$")) {
    const inner = pattern.slice(1, -1);
    const unescaped = inner.replace(/\\(.)/g, "$1");
    if (
      !/[.*+?^${}()|[\]\\]/.test(unescaped) ||
      inner === unescaped.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    ) {
      return { mode: "equals", simpleValue: unescaped };
    }
  }

  const unescaped = pattern.replace(/\\(.)/g, "$1");
  const reEscaped = unescaped.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (pattern === reEscaped) {
    return { mode: "contains", simpleValue: unescaped };
  }

  return { mode: "regex", simpleValue: pattern };
}

function findPresetByPattern(pattern: string): (typeof PRESETS)[0] | undefined {
  return PRESETS.find((p) => p.pattern === pattern);
}

export function ResponseFiltersCard({ filters, onChange, disabled }: ResponseFiltersCardProps) {
  const [presetOverrides, setPresetOverrides] = useState<Record<string, boolean>>({});

  const getUIState = useCallback(
    (filter: ResponseFilter): FilterUIState => {
      const preset = findPresetByPattern(filter.pattern);
      const isPresetCustomized = presetOverrides[filter.id] === true;

      if (preset && !isPresetCustomized) {
        return { matchMode: "regex", simpleValue: preset.pattern, presetId: preset.id };
      }

      const detected = detectMatchMode(filter.pattern);
      return { matchMode: detected.mode, simpleValue: detected.simpleValue };
    },
    [presetOverrides],
  );

  // Memoize all UI states for stable references
  const filterUIStates = useMemo(() => {
    const states: Record<string, FilterUIState> = {};
    for (const f of filters) {
      states[f.id] = getUIState(f);
    }
    return states;
  }, [filters, getUIState]);

  const clearPresetMode = (filterId: string) => {
    setPresetOverrides((prev) => ({ ...prev, [filterId]: true }));
  };

  const addPresetFilter = useCallback(
    (preset: (typeof PRESETS)[0]) => {
      const newFilter: ResponseFilter = {
        id: crypto.randomUUID(),
        name: preset.name,
        enabled: true,
        target: preset.target,
        pattern: preset.pattern,
        action: preset.action,
        maskValue: "",
      };
      onChange([...filters, newFilter]);
    },
    [filters, onChange],
  );

  const addCustomFilter = useCallback(() => {
    const newFilter: ResponseFilter = {
      id: crypto.randomUUID(),
      name: "",
      enabled: true,
      target: FilterTarget.VALUES,
      pattern: "",
      action: FilterAction.MASK,
      maskValue: "",
    };
    onChange([...filters, newFilter]);
  }, [filters, onChange]);

  const updateFilter = useCallback(
    (id: string, updates: Partial<ResponseFilter>) => {
      onChange(filters.map((f) => (f.id === id ? { ...f, ...updates } : f)));
    },
    [filters, onChange],
  );

  const removeFilter = useCallback(
    (id: string) => {
      onChange(filters.filter((f) => f.id !== id));
      setPresetOverrides((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    },
    [filters, onChange],
  );

  const handleMatchModeChange = (filterId: string, mode: MatchMode) => {
    const uiState = filterUIStates[filterId];
    const newPattern = toRegexPattern(uiState?.simpleValue || "", mode);
    updateFilter(filterId, { pattern: newPattern });
  };

  const handleSimpleValueChange = (filterId: string, value: string) => {
    const uiState = filterUIStates[filterId];
    const newPattern = toRegexPattern(value, uiState?.matchMode || "contains");
    updateFilter(filterId, { pattern: newPattern });
  };

  const getActionLabel = (action: FilterAction) => {
    switch (action) {
      case FilterAction.MASK:
        return "mask";
      case FilterAction.REMOVE:
        return "remove";
      case FilterAction.FAIL:
        return "fail";
    }
  };

  return (
    <div className="space-y-3">
      {/* Add filter buttons */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={addCustomFilter}
          disabled={disabled}
          className="h-7 text-xs gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          New Filter
        </Button>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground pr-1">or add:</span>
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => addPresetFilter(preset)}
              disabled={disabled}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-muted-foreground hover:text-foreground bg-muted/30 hover:bg-muted transition-colors disabled:opacity-50"
            >
              <preset.icon className="h-3 w-3" />
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {filters.length === 0 ? (
        <div className="text-center py-4 text-muted-foreground text-sm border rounded-md bg-muted/5">
          Click a button above to add a filter
        </div>
      ) : (
        <div className="space-y-2">
          {filters.map((filter) => {
            const uiState = filterUIStates[filter.id];
            return (
              <div
                key={filter.id}
                className={`border rounded-md p-3 space-y-2 ${!filter.enabled ? "opacity-50" : ""}`}
              >
                {/* Header row: toggle, name, delete */}
                <div className="flex items-center gap-2">
                  <Switch
                    checked={filter.enabled}
                    onCheckedChange={(checked) => updateFilter(filter.id, { enabled: checked })}
                    disabled={disabled}
                    className="scale-75"
                  />
                  <input
                    type="text"
                    placeholder="Untitled filter"
                    value={filter.name || ""}
                    onChange={(e) => updateFilter(filter.id, { name: e.target.value })}
                    disabled={disabled}
                    className="text-xs font-medium bg-transparent border-none outline-none focus:ring-0 placeholder:text-muted-foreground/50 flex-1 max-w-[200px]"
                  />
                  <div className="flex-1" />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFilter(filter.id)}
                    disabled={disabled}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Sentence-style: When [values] [contain] [___] → [mask] */}
                <div className="flex items-center gap-1.5 flex-wrap text-sm">
                  <span className="text-muted-foreground">When</span>
                  <Select
                    value={filter.target}
                    onValueChange={(value) =>
                      updateFilter(filter.id, { target: value as FilterTarget })
                    }
                    disabled={disabled}
                  >
                    <SelectTrigger className="h-7 text-xs w-auto min-w-[70px] font-medium">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={FilterTarget.KEYS}>keys</SelectItem>
                      <SelectItem value={FilterTarget.VALUES}>values</SelectItem>
                      <SelectItem value={FilterTarget.BOTH}>keys or values</SelectItem>
                    </SelectContent>
                  </Select>

                  {uiState.presetId ? (
                    // Preset filter - show friendly badge
                    <>
                      <span className="text-muted-foreground">match</span>
                      {(() => {
                        const preset = PRESETS.find((p) => p.id === uiState.presetId);
                        if (!preset) return null;
                        const Icon = preset.icon;
                        return (
                          <button
                            type="button"
                            onClick={() => !disabled && clearPresetMode(filter.id)}
                            disabled={disabled}
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary font-medium hover:bg-primary/20 transition-colors"
                            title="Click to customize"
                          >
                            <Icon className="h-3 w-3" />
                            {preset.label}
                          </button>
                        );
                      })()}
                    </>
                  ) : (
                    // Custom filter - show match mode and input
                    <>
                      <Select
                        value={uiState.matchMode}
                        onValueChange={(value) =>
                          handleMatchModeChange(filter.id, value as MatchMode)
                        }
                        disabled={disabled}
                      >
                        <SelectTrigger className="h-7 text-xs w-auto min-w-[80px] font-medium">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="contains">contain</SelectItem>
                          <SelectItem value="equals">equal</SelectItem>
                          <SelectItem value="regex">match regex</SelectItem>
                        </SelectContent>
                      </Select>

                      <Input
                        placeholder={uiState.matchMode === "regex" ? "pattern" : "text"}
                        value={uiState.simpleValue}
                        onChange={(e) => handleSimpleValueChange(filter.id, e.target.value)}
                        disabled={disabled}
                        className={`h-7 !text-xs flex-1 min-w-[120px] !p-2 ${uiState.matchMode === "regex" ? "font-mono" : ""}`}
                      />
                    </>
                  )}

                  <span className="text-muted-foreground">→</span>

                  <Select
                    value={filter.action}
                    onValueChange={(value) =>
                      updateFilter(filter.id, { action: value as FilterAction })
                    }
                    disabled={disabled}
                  >
                    <SelectTrigger className="h-7 text-xs w-[120px] font-medium">
                      <SelectValue>
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                          {filter.action === FilterAction.REMOVE && (
                            <Trash2 className="h-3 w-3 text-orange-500 shrink-0" />
                          )}
                          {filter.action === FilterAction.MASK && (
                            <Shield className="h-3 w-3 text-blue-500 shrink-0" />
                          )}
                          {filter.action === FilterAction.FAIL && (
                            <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />
                          )}
                          {getActionLabel(filter.action)}
                        </span>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={FilterAction.MASK}>
                        <span className="flex items-center gap-1.5">
                          <Shield className="h-3 w-3 text-blue-500" />
                          mask
                        </span>
                      </SelectItem>
                      <SelectItem value={FilterAction.REMOVE}>
                        <span className="flex items-center gap-1.5">
                          <Trash2 className="h-3 w-3 text-orange-500" />
                          remove
                        </span>
                      </SelectItem>
                      <SelectItem value={FilterAction.FAIL}>
                        <span className="flex items-center gap-1.5">
                          <AlertTriangle className="h-3 w-3 text-red-500" />
                          fail
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  {(filter.action === FilterAction.REMOVE ||
                    filter.action === FilterAction.MASK) && (
                    <Select
                      value={filter.scope || RemoveScope.FIELD}
                      onValueChange={(value) =>
                        updateFilter(filter.id, { scope: value as RemoveScope })
                      }
                      disabled={disabled}
                    >
                      <SelectTrigger className="h-7 text-xs w-auto min-w-[110px] font-medium">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={RemoveScope.FIELD}>just this field</SelectItem>
                        <SelectItem value={RemoveScope.ITEM}>this item</SelectItem>
                        <SelectItem value={RemoveScope.ENTRY}>entire entry</SelectItem>
                      </SelectContent>
                    </Select>
                  )}

                  {filter.action === FilterAction.MASK && (
                    <>
                      <span className="text-muted-foreground whitespace-nowrap">with</span>
                      <Input
                        placeholder="[filtered]"
                        value={filter.maskValue || ""}
                        onChange={(e) => updateFilter(filter.id, { maskValue: e.target.value })}
                        disabled={disabled}
                        className="h-7 w-[100px] font-mono !text-xs !p-2"
                      />
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
