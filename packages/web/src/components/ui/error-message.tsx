"use client";

import { AlertCircle } from "lucide-react";
import { memo, ReactNode, useMemo } from "react";

interface ErrorMessageProps {
  /** Optional title/heading for the error */
  title?: string;
  /** The error message content - can be string or ReactNode */
  message: ReactNode;
  /** Additional CSS classes */
  className?: string;
  /** Max height for the message area (default: "max-h-40") */
  maxHeight?: string;
  /** Truncate string messages to this length (only applies to string messages) */
  truncateAt?: number;
}

/**
 * Unified error message component for displaying errors in a non-alarming way.
 * Uses neutral/muted styling to avoid scaring users with expected errors.
 */
export const ErrorMessage = memo(function ErrorMessage({
  title,
  message,
  className = "",
  maxHeight = "max-h-40",
  truncateAt,
}: ErrorMessageProps) {
  const displayMessage = useMemo(() => {
    if (truncateAt && typeof message === "string" && message.length > truncateAt) {
      return `${message.slice(0, truncateAt)}...`;
    }
    return message;
  }, [message, truncateAt]);

  return (
    <div
      className={`border border-border p-3 rounded-md flex items-start gap-2 overflow-hidden ${className}`}
    >
      <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        {title && <div className="text-sm font-medium mb-1">{title}</div>}
        <div className={`text-sm text-foreground/80 break-words overflow-y-auto ${maxHeight}`}>
          {displayMessage}
        </div>
      </div>
    </div>
  );
});
