"use client";

import { DeployButton } from "@/src/components/tools/deploy/DeployButton";
import { Button } from "@/src/components/ui/button";
import { SystemIcon } from "@/src/components/ui/system-icon";
import { System, Tool } from "@superglue/shared";
import { ArrowLeftRight, Clock, Hammer, X } from "lucide-react";
import { useMemo } from "react";
import { Handle, Position } from "reactflow";

interface ToolNodeData {
  label: string;
  tool?: Tool;
  isExpanded?: boolean;
  activeSchedules?: number;
  systems?: System[];
  onClick?: () => void;
  onClose?: (e: React.MouseEvent) => void;
  onSelectSystem?: (system: System) => void;
}

export const ToolNode = ({ data }: { data: ToolNodeData }) => {
  const { tool, isExpanded, systems = [] } = data;

  // Collect all system IDs used by this tool
  const usedSystemIds = useMemo(() => {
    if (!tool) return new Set<string>();
    const ids = new Set<string>();
    tool.systemIds?.forEach((id) => ids.add(id));
    tool.steps?.forEach((step: any) => {
      if (step.systemId) ids.add(step.systemId);
    });
    return ids;
  }, [tool]);

  if (isExpanded && tool) {
    return (
      <>
        {/* Invisible handles - needed for existing connections to render, but not connectable */}
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

        <div className="bg-card border-2 border-border rounded-lg shadow-xl w-80 animate-in fade-in zoom-in-95 duration-200 relative z-[9999]">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
            <div className="flex items-center gap-2 min-w-0">
              <Hammer className="h-4 w-4 text-[#FFA500] flex-shrink-0" />
              <span className="font-medium text-sm truncate">{data.label}</span>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={data.onClose}>
              <X className="h-3 w-3" />
            </Button>
          </div>
          <div className="p-3 space-y-2.5 min-h-32 overflow-y-auto">
            {tool.instruction && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Instruction</div>
                <div className="text-xs bg-muted/50 px-2 py-1.5 rounded border border-border max-h-20 overflow-y-auto select-text whitespace-pre-wrap break-words">
                  {tool.instruction}
                </div>
              </div>
            )}
            <div>
              <div className="text-xs text-muted-foreground mb-1">
                Steps ({tool.steps?.length || 0})
              </div>
              <div className="text-xs bg-muted/50 px-2 py-1.5 rounded border border-border max-h-32 overflow-y-auto space-y-1">
                {tool.steps && tool.steps.length > 0 ? (
                  tool.steps.map((step: any, idx: number) => (
                    <div key={step.id || idx} className="font-mono text-[11px]">
                      {idx + 1}. {step.id || `Step ${idx + 1}`}
                    </div>
                  ))
                ) : (
                  <div>No steps</div>
                )}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">
                Systems ({usedSystemIds.size})
              </div>
              <div className="space-y-1">
                {Array.from(usedSystemIds).map((intId) => {
                  const system = systems.find((i) => i.id === intId);
                  return system ? (
                    <div
                      key={intId}
                      className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        data.onSelectSystem?.(system);
                      }}
                    >
                      <SystemIcon system={system} size={10} />
                      <span className="text-xs truncate flex-1">{intId}</span>
                    </div>
                  ) : null;
                })}
              </div>
            </div>
            <div className="pt-2 border-t border-border space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(`/tools/${tool.id}`, "_blank");
                }}
              >
                <Hammer className="h-3 w-3 mr-2" />
                View Tool
              </Button>
              <DeployButton tool={tool} className="w-full" />
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={(e) => {
                  e.stopPropagation();
                  const prompt = encodeURIComponent(`I want to edit the tool "${tool.id}".`);
                  window.open(`/agent?prompt=${prompt}`, "_blank");
                }}
              >
                <ArrowLeftRight className="h-3 w-3 mr-2" />
                Edit with Agent
              </Button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Invisible handles - needed for existing connections to render, but not connectable */}
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
        className="px-3 py-2.5 rounded-lg border-2 border-border bg-card shadow-lg w-[140px] cursor-pointer hover:border-[#FFA500] transition-colors relative overflow-hidden"
        onClick={data.onClick}
      >
        <div className="flex flex-col items-center gap-2">
          <Hammer className="h-5 w-5 text-[#FFA500] flex-shrink-0" />
          <div
            className="text-xs text-center text-foreground line-clamp-2 w-full break-words"
            title={data.label}
          >
            {data.label}
          </div>
          {data.activeSchedules > 0 && (
            <div className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full">
              <Clock className="h-2.5 w-2.5" />
              <span>
                {data.activeSchedules} active schedule{data.activeSchedules > 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
