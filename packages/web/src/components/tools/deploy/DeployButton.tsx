"use client";

import { useSchedules } from "@/src/app/schedules-context";
import { Button } from "@/src/components/ui/button";
import { Tool } from "@superglue/shared";
import { CloudUpload } from "lucide-react";
import { useState } from "react";
import { ToolDeployModal } from "./ToolDeployModal";

interface DeployButtonProps {
  tool: Tool;
  payload?: Record<string, any>;
  onBeforeOpen?: () => Promise<unknown> | void;
  disabled?: boolean;
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

export function DeployButton({
  tool,
  payload = {},
  onBeforeOpen,
  disabled,
  size = "sm",
  className,
}: DeployButtonProps) {
  const { getSchedulesForTool } = useSchedules();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const activeCount = getSchedulesForTool(tool.id).filter((s) => s.enabled).length;

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onBeforeOpen) {
      setIsLoading(true);
      try {
        const result = await onBeforeOpen();
        if (result === false) return;
      } finally {
        setIsLoading(false);
      }
    }
    setIsOpen(true);
  };

  return (
    <>
      <Button
        variant="glass"
        size={size}
        onClick={handleClick}
        disabled={disabled || isLoading}
        className={className}
      >
        <span className="relative">
          <CloudUpload className="h-4 w-4" />
          {activeCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 text-[10px] font-medium bg-primary text-primary-foreground rounded-full h-3.5 min-w-[0.875rem] px-1 flex items-center justify-center border-2 border-background">
              {activeCount}
            </span>
          )}
        </span>
        Deploy
      </Button>
      <ToolDeployModal
        currentTool={tool}
        payload={payload}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </>
  );
}
