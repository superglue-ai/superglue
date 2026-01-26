"use client";

import { Button } from "@/src/components/ui/button";
import { SystemIcon } from "@/src/components/ui/system-icon";
import { composeUrl } from "@/src/lib/general-utils";
import { System, Tool } from "@superglue/shared";
import { Hammer, Pencil, X, ChevronDown, ChevronRight, Maximize2, Minimize2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Handle, Position } from "reactflow";

interface SystemNodeData {
  label: string;
  system?: System;
  isExpanded?: boolean;
  tools?: Tool[];
  onClick?: () => void;
  onClose?: (e: React.MouseEvent) => void;
  onEdit?: () => void;
}

export const SystemNode = ({ data }: { data: SystemNodeData }) => {
  const { system, isExpanded, tools = [] } = data;
  const [isTechnicalDetailsExpanded, setIsTechnicalDetailsExpanded] = useState(false);
  const [isFullSize, setIsFullSize] = useState(false);

  // Find tools that use this system
  const dependentTools = useMemo(() => {
    if (!system) return [];
    return tools.filter((tool) => {
      if (tool.systemIds?.includes(system.id)) return true;
      if (tool.steps?.some((step: any) => step.systemId === system.id)) return true;
      return false;
    });
  }, [system, tools]);

  // Extract metadata fields
  const capabilities = system?.metadata?.capabilities as string[] | undefined;
  const technicalDetails = system?.metadata?.systemDetails as string | undefined;

  if (isExpanded && system) {
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
          className={`bg-card border-2 border-border rounded-lg shadow-xl animate-in fade-in zoom-in-95 duration-200 relative z-[9999] transition-all ${isFullSize ? "w-[700px]" : "w-80"}`}
        >
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <SystemIcon system={system} size={16} />
              <span className="font-medium text-sm truncate">{data.label}</span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsFullSize(!isFullSize);
                }}
                title={isFullSize ? "Collapse" : "Expand"}
              >
                {isFullSize ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={data.onClose}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
          <div
            className={`p-3 space-y-2.5 overflow-y-auto ${isFullSize ? "max-h-[600px]" : "max-h-96"}`}
          >
            {system.urlHost && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Endpoint</div>
                <div
                  className={`font-mono text-xs bg-muted/50 px-2 py-1.5 rounded border border-border ${isFullSize ? "break-all" : "truncate"}`}
                  title={composeUrl(system.urlHost, system.urlPath)}
                >
                  {composeUrl(system.urlHost, system.urlPath)}
                </div>
              </div>
            )}

            {/* Capabilities */}
            {capabilities && capabilities.length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Capabilities</div>
                <ul className="list-disc list-inside space-y-0.5">
                  {capabilities.map((cap, idx) => (
                    <li key={idx} className="text-xs text-foreground">
                      {cap}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Technical Details - Collapsible */}
            {technicalDetails && (
              <div>
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-left"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsTechnicalDetailsExpanded(!isTechnicalDetailsExpanded);
                  }}
                >
                  {isTechnicalDetailsExpanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                  Technical Details
                </button>
                {isTechnicalDetailsExpanded && (
                  <pre
                    className={`text-xs text-muted-foreground leading-relaxed font-mono whitespace-pre-wrap bg-muted/50 p-2 rounded border mt-1.5 overflow-x-auto overflow-y-auto ${isFullSize ? "max-h-[400px]" : "max-h-32"}`}
                  >
                    {technicalDetails}
                  </pre>
                )}
              </div>
            )}

            <div>
              <div className="text-xs text-muted-foreground mb-1">
                Tools ({dependentTools.length})
              </div>
              {dependentTools.length === 0 ? (
                <div className="text-xs text-muted-foreground italic py-1.5">No tools yet</div>
              ) : (
                <div className="space-y-1">
                  {dependentTools.slice(0, 5).map((tool) => (
                    <div
                      key={tool.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(`/tools/${tool.id}`, "_blank");
                      }}
                    >
                      <Hammer className="h-2.5 w-2.5 text-[#FFA500] flex-shrink-0" />
                      <span className="text-xs truncate flex-1">{tool.id}</span>
                    </div>
                  ))}
                  {dependentTools.length > 5 && (
                    <div className="text-xs text-muted-foreground text-center pt-0.5">
                      +{dependentTools.length - 5} more
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="pt-2 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={(e) => {
                  e.stopPropagation();
                  data.onEdit?.();
                }}
              >
                <Pencil className="h-3 w-3 mr-2" />
                Edit System
              </Button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        id="target-top"
        className="!w-2.5 !h-2.5 !border-border !bg-background"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="target-left"
        className="!w-2.5 !h-2.5 !border-border !bg-background"
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="target-bottom"
        className="!w-2.5 !h-2.5 !border-border !bg-background"
      />
      <Handle
        type="target"
        position={Position.Right}
        id="target-right"
        className="!w-2.5 !h-2.5 !border-border !bg-background"
      />
      <Handle
        type="source"
        position={Position.Top}
        id="source-top"
        className="!w-2.5 !h-2.5 !border-border !bg-background"
      />
      <Handle
        type="source"
        position={Position.Left}
        id="source-left"
        className="!w-2.5 !h-2.5 !border-border !bg-background"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="source-bottom"
        className="!w-2.5 !h-2.5 !border-border !bg-background"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="source-right"
        className="!w-2.5 !h-2.5 !border-border !bg-background"
      />

      <div
        className={`px-4 py-3 rounded-lg border-2 border-border bg-card shadow-lg cursor-pointer hover:border-[#FFA500] transition-colors overflow-hidden ${
          capabilities && capabilities.length > 0
            ? "min-w-[180px] max-w-[200px]"
            : "min-w-[120px] max-w-[200px]"
        }`}
        onClick={data.onClick}
      >
        <div className="flex flex-col items-center gap-2">
          {system && <SystemIcon system={system} size={24} />}
          <div
            className="text-base font-medium text-center break-words w-full truncate"
            title={data.label}
          >
            {data.label}
          </div>

          {/* Capabilities preview in collapsed view */}
          {capabilities && capabilities.length > 0 && (
            <div className="w-full mt-1">
              <ul className="list-disc list-inside space-y-0.5 text-left">
                {capabilities.slice(0, 3).map((cap, idx) => (
                  <li key={idx} className="text-[10px] text-muted-foreground">
                    {cap}
                  </li>
                ))}
              </ul>
              {capabilities.length > 3 && (
                <p className="text-[10px] text-muted-foreground/70 mt-1 text-center">
                  +{capabilities.length - 3} more
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};
