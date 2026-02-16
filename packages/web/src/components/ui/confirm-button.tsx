"use client";

import { Check, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "./button";

interface ConfirmButtonProps {
  onConfirm: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  children: React.ReactNode;
  confirmText?: string;
  variant?: "ghost" | "default" | "destructive" | "outline" | "secondary" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  timeout?: number;
}

export function ConfirmButton({
  onConfirm,
  disabled,
  isLoading,
  children,
  confirmText = "Confirm",
  variant = "ghost",
  size = "sm",
  className = "h-7 text-xs",
  timeout = 10000,
}: ConfirmButtonProps) {
  const [confirming, setConfirming] = useState(false);

  // Auto-reset after timeout
  useEffect(() => {
    if (confirming) {
      const timer = setTimeout(() => setConfirming(false), timeout);
      return () => clearTimeout(timer);
    }
  }, [confirming, timeout]);

  if (isLoading) {
    return (
      <Button variant={variant} size={size} disabled className={className}>
        <Loader2 className="h-3 w-3 animate-spin" />
      </Button>
    );
  }

  return (
    <Button
      variant={confirming ? "default" : variant}
      size={size}
      onClick={(e) => {
        e.stopPropagation();
        if (confirming) {
          setConfirming(false);
          onConfirm();
        } else {
          setConfirming(true);
        }
      }}
      disabled={disabled}
      className={className}
    >
      {confirming ? (
        <span className="flex items-center gap-1">
          <Check className="h-3 w-3" />
          {confirmText}
        </span>
      ) : (
        children
      )}
    </Button>
  );
}
