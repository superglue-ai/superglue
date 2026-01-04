"use client";

import { cn } from "@/src/lib/general-utils";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import React from "react";

interface StatusTooltipProps {
  children: React.ReactNode;
  status: "success" | "error" | null;
  message?: string;
  onDismiss?: () => void;
}

export const StatusTooltip = ({ children, status, message, onDismiss }: StatusTooltipProps) => {
  const [displayMessage, setDisplayMessage] = React.useState<string>("");
  const isDismissing = React.useRef(false);
  const pointerDownPos = React.useRef<{ x: number; y: number } | null>(null);

  React.useEffect(() => {
    if (status && message) {
      setDisplayMessage(message);
      isDismissing.current = false;
    }
  }, [status, message]);

  const handleOpenChange = (open: boolean) => {
    if (!open && status && !isDismissing.current) {
      isDismissing.current = true;
      setTimeout(() => {
        setDisplayMessage("");
        onDismiss?.();
      }, 200);
    }
  };

  return (
    <TooltipPrimitive.Provider delayDuration={0} disableHoverableContent>
      <TooltipPrimitive.Root open={!!status} onOpenChange={handleOpenChange}>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            sideOffset={4}
            className={cn(
              "z-50 overflow-hidden rounded-md px-3 py-1.5 text-xs max-w-xs",
              "animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
              "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
              status === "success" && "bg-green-600 text-white",
              status === "error" && displayMessage === "Aborted" && "bg-amber-600 text-white",
              status === "error" && displayMessage !== "Aborted" && "bg-red-600 text-white",
            )}
          >
            {displayMessage}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
};
