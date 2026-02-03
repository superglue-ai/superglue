import { cn } from "@/src/lib/general-utils";
import React from "react";

export interface MiniCardProps {
  isActive: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  width?: number;
  height?: number;
}

export const MiniCard = React.memo(
  ({ isActive, onClick, children, className, width = 180, height = 125 }: MiniCardProps) => {
    return (
      <div
        onClick={onClick}
        className={cn(
          "transition-all duration-300 group cursor-pointer",
          "hover:scale-[1.01] active:scale-[0.99]",
        )}
      >
        <div
          className={cn(
            "flex-shrink-0 transition-all duration-300",
            "bg-gradient-to-br from-muted/50 to-muted/30 dark:from-muted/30 dark:to-muted/20",
            "backdrop-blur-sm border border-border/50 rounded-2xl",
            "shadow-sm overflow-hidden",
            "group-hover:shadow-md group-hover:border-border/60 group-hover:from-muted/60 group-hover:to-muted/40",
            "relative",
            isActive &&
              "ring-1 ring-[#FFA500] border-[#FFA500] shadow-[0_0_0_1px_#FFA500,0_10px_15px_-3px_rgba(255,165,0,0.1),0_4px_6px_-4px_rgba(255,165,0,0.1)]",
            className,
          )}
          style={{ width: `${width}px`, height: `${height}px` }}
        >
          <div className="relative h-full flex flex-col items-center justify-between leading-tight pt-3 px-3 pb-3">
            {children}
          </div>
        </div>
      </div>
    );
  },
);

MiniCard.displayName = "MiniCard";

export interface StatusIndicatorProps {
  text: string;
  color: string;
  dotColor: string;
  animate?: boolean;
}

export const StatusIndicator = React.memo(
  ({ text, color, dotColor, animate = false }: StatusIndicatorProps) => {
    return (
      <div className="flex items-center gap-1">
        <span className={cn("text-[9px] font-semibold flex items-center gap-1", color)}>
          <span className={cn("w-1.5 h-1.5 rounded-full", dotColor, animate && "animate-pulse")} />
          {text}
        </span>
      </div>
    );
  },
);

StatusIndicator.displayName = "StatusIndicator";

export interface TriggerCardProps {
  isActive: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}

export const TriggerCard = React.memo(({ isActive, onClick, icon }: TriggerCardProps) => {
  return (
    <div
      className={cn(
        "transition-all duration-300 ease-out transform flex flex-col items-center justify-center cursor-pointer",
        "h-[125px] group",
      )}
      onClick={onClick}
    >
      <div
        className={cn(
          "relative flex items-center justify-center h-8 w-8 rounded-full transition-all",
          "bg-gradient-to-br from-muted/50 to-muted/30 dark:from-muted/30 dark:to-muted/20",
          "backdrop-blur-sm border border-border/50",
          "group-hover:border-border/60",
          isActive &&
            "ring-1 ring-[#FFA500] border-[#FFA500] shadow-[0_0_0_1px_#FFA500,0_4px_6px_-2px_rgba(255,165,0,0.15)]",
        )}
      >
        {icon}
      </div>
    </div>
  );
});

TriggerCard.displayName = "TriggerCard";
