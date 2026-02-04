"use client";

import React from "react";
import { RequestSource, RunStatus } from "@superglue/shared";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/src/components/ui/popover";
import { Input } from "@/src/components/ui/input";
import { Checkbox } from "@/src/components/ui/checkbox";
import {
  AlertTriangle,
  Check,
  CheckCircle,
  ChevronDown,
  Clock,
  Code,
  Cpu,
  Link,
  MousePointerClick,
  Play,
  Search,
  Webhook,
  X,
  XCircle,
} from "lucide-react";

export interface FilterState {
  status: string;
  triggers: string[];
  timeRange: string;
  toolId: string;
}

interface RunFiltersProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  onToolIdConfirm?: (toolId: string) => void;
}

const statusOptions = [
  {
    value: "all",
    label: "All Statuses",
    icon: null,
    className: "bg-muted text-muted-foreground",
  },
  {
    value: RunStatus.FAILED,
    label: "Failed",
    icon: XCircle,
    className: "bg-red-500/10 text-red-800 dark:text-red-300",
  },
  {
    value: RunStatus.SUCCESS,
    label: "Success",
    icon: CheckCircle,
    className: "bg-green-500/10 text-green-800 dark:text-green-300",
  },
  {
    value: RunStatus.RUNNING,
    label: "Running",
    icon: Play,
    className: "bg-blue-500/10 text-blue-600 dark:text-blue-300",
  },
  {
    value: RunStatus.ABORTED,
    label: "Aborted",
    icon: AlertTriangle,
    className: "bg-amber-500/10 text-amber-800 dark:text-amber-300",
  },
];

const triggerOptions = [
  { value: RequestSource.SCHEDULER, label: "Scheduler", icon: Clock },
  { value: RequestSource.WEBHOOK, label: "Webhook", icon: Webhook },
  { value: RequestSource.API, label: "API", icon: Code },
  { value: RequestSource.MCP, label: "MCP", icon: Cpu },
  { value: RequestSource.FRONTEND, label: "Manual", icon: MousePointerClick },
  { value: RequestSource.TOOL_CHAIN, label: "Tool Chain", icon: Link },
];

const timeRangeOptions = [
  { value: "1h", label: "Last hour" },
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
];

function StatusBadgeOption({
  option,
  selected,
}: {
  option: (typeof statusOptions)[0];
  selected: boolean;
}) {
  const Icon = option.icon;
  return (
    <div
      className={`inline-flex items-center gap-1 rounded-md border border-transparent px-2.5 py-0.5 text-xs font-medium ${option.className} ${selected ? "ring-2 ring-offset-1 ring-foreground/20" : ""}`}
    >
      {Icon && <Icon className="h-3 w-3" />}
      {option.label}
    </div>
  );
}

export function RunFilters({ filters, onFiltersChange, onToolIdConfirm }: RunFiltersProps) {
  const [triggersOpen, setTriggersOpen] = React.useState(false);
  const [toolIdInput, setToolIdInput] = React.useState(filters.toolId);

  // Sync local input with filters when filters change externally (e.g., URL params)
  React.useEffect(() => {
    setToolIdInput(filters.toolId);
  }, [filters.toolId]);

  const selectedStatus = statusOptions.find((s) => s.value === filters.status) || statusOptions[0];
  const selectedTriggerCount = filters.triggers.length;

  const handleTriggerToggle = (triggerValue: string) => {
    const newTriggers = filters.triggers.includes(triggerValue)
      ? filters.triggers.filter((t) => t !== triggerValue)
      : [...filters.triggers, triggerValue];
    onFiltersChange({ ...filters, triggers: newTriggers });
  };

  const handleSelectAllTriggers = () => {
    if (filters.triggers.length === triggerOptions.length) {
      onFiltersChange({ ...filters, triggers: [] });
    } else {
      onFiltersChange({ ...filters, triggers: triggerOptions.map((t) => t.value) });
    }
  };

  const handleToolIdConfirm = () => {
    onFiltersChange({ ...filters, toolId: toolIdInput });
    onToolIdConfirm?.(toolIdInput);
  };

  const handleToolIdClear = () => {
    setToolIdInput("");
    onFiltersChange({ ...filters, toolId: "" });
    onToolIdConfirm?.("");
  };

  const handleToolIdKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleToolIdConfirm();
    }
  };

  const hasToolIdChanged = toolIdInput !== filters.toolId;

  return (
    <div className="flex flex-wrap gap-4 items-end">
      {/* Status Filter with Badge-style options */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground block">Status</label>
        <Select
          value={filters.status}
          onValueChange={(value) => onFiltersChange({ ...filters, status: value })}
        >
          <SelectTrigger className="w-auto min-w-[140px] h-9">
            <StatusBadgeOption option={selectedStatus} selected={false} />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((option) => (
              <SelectItem key={option.value} value={option.value} className="py-2">
                <StatusBadgeOption option={option} selected={filters.status === option.value} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Triggers Multi-Select */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground block">Trigger</label>
        <Popover open={triggersOpen} onOpenChange={setTriggersOpen}>
          <PopoverTrigger asChild>
            <button className="inline-flex items-center justify-between gap-2 h-9 px-3 border border-input rounded-md bg-transparent shadow-sm text-sm [&>span]:line-clamp-1">
              {selectedTriggerCount === 0 ? (
                <span>All Triggers</span>
              ) : selectedTriggerCount === triggerOptions.length ? (
                <span>All Triggers</span>
              ) : (
                <span>
                  {selectedTriggerCount} trigger{selectedTriggerCount > 1 ? "s" : ""}
                </span>
              )}
              <ChevronDown className="h-4 w-4 opacity-50" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[220px] p-2" align="start">
            <div className="space-y-1">
              <div
                onClick={handleSelectAllTriggers}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-accent cursor-pointer"
              >
                <Checkbox
                  checked={
                    filters.triggers.length === triggerOptions.length ||
                    filters.triggers.length === 0
                  }
                  className="h-4 w-4 pointer-events-none"
                />
                <span className="font-medium">All Triggers</span>
              </div>
              <div className="h-px bg-border my-1" />
              {triggerOptions.map((option) => {
                const Icon = option.icon;
                const isSelected =
                  filters.triggers.length === 0 || filters.triggers.includes(option.value);
                return (
                  <div
                    key={option.value}
                    onClick={() => handleTriggerToggle(option.value)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-sm font-normal rounded hover:bg-accent cursor-pointer"
                  >
                    <Checkbox
                      checked={isSelected && filters.triggers.length > 0}
                      className="h-4 w-4 pointer-events-none"
                    />
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span>{option.label}</span>
                  </div>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Time Range */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground block">Time Range</label>
        <Select
          value={filters.timeRange}
          onValueChange={(value) => onFiltersChange({ ...filters, timeRange: value })}
        >
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue placeholder="Time range" />
          </SelectTrigger>
          <SelectContent>
            {timeRangeOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tool ID Search - with confirmation button */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground block">Tool ID</label>
        <div className="flex items-center gap-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={toolIdInput}
              onChange={(e) => setToolIdInput(e.target.value)}
              onKeyDown={handleToolIdKeyDown}
              className="pl-9 w-[180px] h-9"
            />
          </div>
          {(toolIdInput || filters.toolId) && (
            <div className="flex items-center gap-1">
              {hasToolIdChanged && toolIdInput && (
                <button
                  onClick={handleToolIdConfirm}
                  className="h-9 w-9 flex items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
                  title="Apply filter"
                >
                  <Check className="h-4 w-4 text-green-600" />
                </button>
              )}
              {(filters.toolId || toolIdInput) && (
                <button
                  onClick={handleToolIdClear}
                  className="h-9 w-9 flex items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
                  title="Clear filter"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
