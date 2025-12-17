"use client"

import { useSchedules } from '@/src/app/schedules-context';
import { Button } from "@/src/components/ui/button";
import { CloudUpload } from "lucide-react";

interface DeployButtonProps {
  toolId: string;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

export function DeployButton({ toolId, onClick, disabled, size = "sm", className }: DeployButtonProps) {
  const { getSchedulesForTool } = useSchedules();
  const activeCount = getSchedulesForTool(toolId).filter(s => s.enabled).length;

  return (
    <Button
      variant="outline"
      size={size}
      onClick={onClick}
      disabled={disabled}
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
  );
}

