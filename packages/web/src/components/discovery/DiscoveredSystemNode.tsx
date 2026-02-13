"use client";

import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";
import { getDiscoveryIcon } from "./discovery-utils";
import {
  Globe,
  X,
  Plus,
  Check,
  Loader2,
  Code,
  File,
  Users,
  Webhook,
  Database,
  Landmark,
  Brain,
  Bell,
  Mail,
  Workflow,
  Cloud,
  ScrollText,
  GitMerge,
  Square,
  CheckSquare,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Handle, Position } from "reactflow";
import { ExtendedSystem } from "@superglue/shared";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";

interface DiscoveredSystemNodeData {
  system: ExtendedSystem;
  label: string;
  isExpanded: boolean;
  isAdding: boolean;
  isAlreadyAdded: boolean;
  isJustAdded: boolean;
  isMatched: boolean;
  isMerging: boolean;
  isMerged: boolean;
  isSelectionMode: boolean;
  selectionModeType: "import" | "workWith" | null;
  isSelected: boolean;
  isCurrentlyImporting: boolean;
  onClick: () => void;
  onClose: () => void;
  onAddSystem: (system: ExtendedSystem) => void;
  onMergeSystem: (system: ExtendedSystem) => void;
  onToggleSelect: (systemId: string) => void;
}

// Map of lucide icon names to components
const lucideIcons: Record<string, any> = {
  code: Code,
  file: File,
  users: Users,
  webhook: Webhook,
  database: Database,
  landmark: Landmark,
  brain: Brain,
  bell: Bell,
  mail: Mail,
  workflow: Workflow,
  cloud: Cloud,
  "scroll-text": ScrollText,
};

export const DiscoveredSystemNode = ({ data }: { data: DiscoveredSystemNodeData }) => {
  const {
    system,
    isExpanded,
    isAdding,
    isAlreadyAdded,
    isJustAdded,
    isMatched,
    isMerging,
    isMerged,
    isSelectionMode,
    selectionModeType,
    isSelected,
    isCurrentlyImporting,
    onClick,
    onClose,
    onAddSystem,
    onMergeSystem,
    onToggleSelect,
  } = data;
  const iconData = getDiscoveryIcon(system.icon);
  const [isSystemDetailsExpanded, setIsSystemDetailsExpanded] = useState(false);
  const [isEvidenceExpanded, setIsEvidenceExpanded] = useState(false);

  // Helper to render icon based on type
  const renderIcon = (size: number = 28) => {
    if (iconData.type === "simpleicons") {
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill={`#${iconData.icon.hex}`}
          className="flex-shrink-0"
        >
          <path d={iconData.icon.path || ""} />
        </svg>
      );
    } else if (iconData.type === "lucide") {
      const LucideIcon = lucideIcons[iconData.name] || Globe;
      if (size === 28) {
        return (
          <div className="p-2 rounded-full bg-white dark:bg-gray-100 border border-border/50 flex items-center justify-center">
            <LucideIcon className="h-5 w-5 text-muted-foreground" />
          </div>
        );
      } else if (size === 16) {
        return (
          <div className="p-1.5 rounded-full bg-white dark:bg-gray-100 border border-border/50 flex items-center justify-center">
            <LucideIcon className="h-3 w-3 text-muted-foreground" />
          </div>
        );
      }
    }
    // Fallback globe icon
    if (size === 28) {
      return (
        <div className="p-2 rounded-full bg-white dark:bg-gray-100 border border-border/50 flex items-center justify-center">
          <Globe className="h-5 w-5 text-muted-foreground" />
        </div>
      );
    } else if (size === 16) {
      return (
        <div className="p-1.5 rounded-full bg-white dark:bg-gray-100 border border-border/50 flex items-center justify-center">
          <Globe className="h-3 w-3 text-muted-foreground" />
        </div>
      );
    }
  };

  if (isExpanded) {
    return (
      <>
        <Handle
          type="target"
          position={Position.Top}
          id="target-top"
          className="!opacity-0 !pointer-events-none"
        />
        <Handle
          type="target"
          position={Position.Left}
          id="target-left"
          className="!opacity-0 !pointer-events-none"
        />
        <Handle
          type="target"
          position={Position.Bottom}
          id="target-bottom"
          className="!opacity-0 !pointer-events-none"
        />
        <Handle
          type="target"
          position={Position.Right}
          id="target-right"
          className="!opacity-0 !pointer-events-none"
        />
        <Handle
          type="source"
          position={Position.Top}
          id="source-top"
          className="!opacity-0 !pointer-events-none"
        />
        <Handle
          type="source"
          position={Position.Left}
          id="source-left"
          className="!opacity-0 !pointer-events-none"
        />
        <Handle
          type="source"
          position={Position.Bottom}
          id="source-bottom"
          className="!opacity-0 !pointer-events-none"
        />
        <Handle
          type="source"
          position={Position.Right}
          id="source-right"
          className="!opacity-0 !pointer-events-none"
        />

        <div className="bg-card border-2 border-border rounded-lg shadow-xl w-96 animate-in fade-in zoom-in-95 duration-200 relative z-[9999]">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
            <div className="flex items-center gap-2 min-w-0">
              {renderIcon(16)}
              <span className="font-medium text-sm truncate">{system.name || system.id}</span>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
              <X className="h-3 w-3" />
            </Button>
          </div>
          <div className="p-4 space-y-4 max-h-[500px] overflow-y-auto">
            {/* Type */}
            {system.type && (
              <div>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Type
                </span>
                <p className="text-sm mt-1">{system.type}</p>
              </div>
            )}

            {/* URL */}
            {system.url && (
              <div>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  URL
                </span>
                <p className="text-sm mt-1 font-mono break-all">{system.url}</p>
              </div>
            )}

            {/* Capabilities */}
            {system.capabilities && system.capabilities.length > 0 && (
              <div>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Capabilities
                </span>
                <ul className="list-disc list-inside space-y-1 mt-2">
                  {system.capabilities.map((cap, idx) => (
                    <li key={idx} className="text-sm">
                      {cap}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Technical Details - Collapsible */}
            {system.systemDetails && (
              <div className="pt-3">
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors w-full text-left"
                  onClick={() => setIsSystemDetailsExpanded(!isSystemDetailsExpanded)}
                >
                  {isSystemDetailsExpanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                  Technical Details
                </button>

                {isSystemDetailsExpanded && (
                  <div className="mt-2">
                    <pre className="text-xs text-muted-foreground leading-relaxed font-mono whitespace-pre-wrap bg-muted/50 p-2 rounded border overflow-x-auto">
                      {system.systemDetails}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* Evidence - Collapsible (below technical details) */}
            {system.evidence && (
              <div className="pt-3">
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors w-full text-left"
                  onClick={() => setIsEvidenceExpanded(!isEvidenceExpanded)}
                >
                  {isEvidenceExpanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                  Evidence
                </button>

                {isEvidenceExpanded && (
                  <p className="text-xs text-muted-foreground italic mt-2 leading-relaxed">
                    {system.evidence}
                  </p>
                )}
              </div>
            )}

            {/* Confidence (only show if not high) */}
            {system.confidence !== "high" && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Confidence
                </span>
                <Badge
                  variant={system.confidence === "medium" ? "secondary" : "outline"}
                  className={
                    system.confidence === "medium"
                      ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400"
                      : "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400"
                  }
                >
                  {system.confidence}
                </Badge>
              </div>
            )}

            {/* Match Info for matched systems */}
            {isMatched && system.matchedSystemId && (
              <div className="pt-3 bg-blue-50 dark:bg-blue-950/30 -mx-4 px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <GitMerge className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wider">
                    Matches Existing System
                  </span>
                </div>
                <p className="text-sm font-mono text-blue-600 dark:text-blue-400">
                  {system.matchedSystemId}
                </p>
              </div>
            )}

            {/* Action Button */}
            <div className="pt-3">
              {isMatched ? (
                <Button
                  variant={isMerged ? "outline" : "default"}
                  className={`w-full ${isMerged ? "border-blue-500 text-blue-600 dark:border-blue-600 dark:text-blue-500 bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-50 dark:hover:bg-blue-950/30" : "bg-blue-600 hover:bg-blue-700"}`}
                  onClick={() => onMergeSystem(system)}
                  disabled={isMerging || isMerged}
                >
                  {isMerging ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Merging...
                    </>
                  ) : isMerged ? (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Merged
                    </>
                  ) : (
                    <>
                      <GitMerge className="h-4 w-4 mr-2" />
                      Merge System
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  variant={isAlreadyAdded ? "outline" : "default"}
                  className={`w-full ${isAlreadyAdded ? "border-green-500 text-green-600 dark:border-green-600 dark:text-green-500 bg-green-50 dark:bg-green-950/30 hover:bg-green-50 dark:hover:bg-green-950/30" : ""}`}
                  onClick={() => onAddSystem(system)}
                  disabled={isAdding || isAlreadyAdded}
                >
                  {isAdding ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Adding...
                    </>
                  ) : isJustAdded ? (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      System Added
                    </>
                  ) : isAlreadyAdded ? (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Already Added
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Add to Systems
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  // Determine if this node can be selected based on mode
  // - Import mode: only non-added, non-matched systems
  // - WorkWith mode: only already-added systems
  const isSelectable =
    selectionModeType === "workWith" ? isAlreadyAdded : !isAlreadyAdded && !isMatched;

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSelectable) {
      onToggleSelect(system.id);
    }
  };

  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        id="target-top"
        className="!opacity-0 !pointer-events-none"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="target-left"
        className="!opacity-0 !pointer-events-none"
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="target-bottom"
        className="!opacity-0 !pointer-events-none"
      />
      <Handle
        type="target"
        position={Position.Right}
        id="target-right"
        className="!opacity-0 !pointer-events-none"
      />
      <Handle
        type="source"
        position={Position.Top}
        id="source-top"
        className="!opacity-0 !pointer-events-none"
      />
      <Handle
        type="source"
        position={Position.Left}
        id="source-left"
        className="!opacity-0 !pointer-events-none"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="source-bottom"
        className="!opacity-0 !pointer-events-none"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="source-right"
        className="!opacity-0 !pointer-events-none"
      />

      <div
        className={`px-4 py-3 rounded-lg border-2 shadow-lg min-w-[220px] max-w-[240px] cursor-pointer transition-all duration-200 relative ${
          isMatched
            ? "border-blue-400 dark:border-blue-600 bg-blue-50/50 dark:bg-blue-950/20 hover:border-blue-500"
            : isSelectionMode && isSelected
              ? "border-[#FFA500] bg-orange-50/50 dark:bg-orange-950/20"
              : isSelectionMode && !isSelectable
                ? "border-border bg-card opacity-60"
                : "border-border bg-card hover:border-[#FFA500]"
        }`}
        onClick={isSelectionMode ? handleCheckboxClick : onClick}
      >
        {/* Selection Checkbox */}
        {isSelectionMode && (
          <div
            className={`absolute -top-2 -left-2 z-10 animate-in zoom-in-75 duration-200 ${
              !isSelectable ? "cursor-not-allowed" : "cursor-pointer"
            }`}
            onClick={handleCheckboxClick}
          >
            <div
              className={`rounded-md p-0.5 shadow-md transition-all duration-150 ${
                isSelected
                  ? "bg-[#FFA500] text-white"
                  : !isSelectable && isAlreadyAdded && selectionModeType === "import"
                    ? "bg-green-500 text-white"
                    : "bg-card border border-border hover:border-[#FFA500]"
              }`}
            >
              {/* In import mode, show green check for already-added systems */}
              {!isSelectable && isAlreadyAdded && selectionModeType === "import" ? (
                <Check className="h-4 w-4" />
              ) : isSelected ? (
                <CheckSquare className="h-4 w-4" />
              ) : (
                <Square className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </div>
        )}

        <div className="flex flex-col items-center gap-3">
          {/* Icon and Name */}
          <div className="flex flex-col items-center gap-2">
            {renderIcon(28)}
            <div className="text-sm font-medium text-center break-words w-full">
              {system.name || system.id}
            </div>
          </div>

          {/* Match indicator - below name, above capabilities */}
          {isMatched && (
            <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
              <GitMerge className="h-3 w-3" />
              <span className="text-[10px] font-medium uppercase">Matches existing</span>
            </div>
          )}

          {/* Capabilities List - max 4 in overview */}
          {system.capabilities && system.capabilities.length > 0 && (
            <div className="w-full">
              <ul className="list-disc list-inside space-y-0.5 text-left">
                {system.capabilities.slice(0, 4).map((cap, idx) => (
                  <li key={idx} className="text-[10px] text-muted-foreground">
                    {cap}
                  </li>
                ))}
              </ul>
              {system.capabilities.length > 4 && (
                <p className="text-[10px] text-muted-foreground/70 mt-1 text-center">
                  +{system.capabilities.length - 4} more
                </p>
              )}
            </div>
          )}

          {/* Sources Count */}
          {system.sources && system.sources.length > 0 && (
            <div className="text-[10px] text-muted-foreground">
              mentioned in {system.sources.length}{" "}
              {system.sources.length === 1 ? "source" : "sources"}
            </div>
          )}

          {/* Import hint in workWith mode for non-imported systems */}
          {selectionModeType === "workWith" && !isAlreadyAdded && (
            <div className="text-[11px] text-orange-600 dark:text-orange-400 font-medium mt-2 px-2 py-1 bg-orange-50 dark:bg-orange-950/30 rounded w-full text-center">
              Import first to work with
            </div>
          )}
        </div>
      </div>
    </>
  );
};
