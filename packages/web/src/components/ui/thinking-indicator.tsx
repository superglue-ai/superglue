"use client";

import { cn } from "@/src/lib/general-utils";

interface ThinkingIndicatorProps {
  text?: string;
  className?: string;
}

export function ThinkingIndicator({ text = "Thinking", className }: ThinkingIndicatorProps) {
  const allChars = [...text.split(""), ".", ".", "."];

  return (
    <span className={cn("inline-flex items-center text-xs text-muted-foreground", className)}>
      {allChars.map((char, index) => (
        <span
          key={index}
          className="animate-thinking-pulse"
          style={{
            animationDelay: `${index * 50}ms`,
          }}
        >
          {char}
        </span>
      ))}
    </span>
  );
}
