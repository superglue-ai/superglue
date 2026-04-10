"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { safeStringify } from "@superglue/shared";
import { cn, copyToClipboard } from "@/src/lib/general-utils";

export { copyToClipboard };

export const CopyButton = ({
  text,
  getData,
  className,
}: {
  text?: string;
  getData?: () => any;
  className?: string;
}) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const textToCopy = getData
      ? typeof getData() === "string"
        ? getData()
        : safeStringify(getData(), 2)
      : text || "";
    const success = await copyToClipboard(textToCopy);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };
  return (
    <button
      onClick={handleCopy}
      className={cn(
        "h-6 w-6 flex items-center justify-center rounded hover:bg-background/80 transition-colors backdrop-blur",
        className,
      )}
      title="Copy"
      type="button"
    >
      {copied ? (
        <Check className="h-3 w-3 text-green-600" />
      ) : (
        <Copy className="h-3 w-3 text-muted-foreground" />
      )}
    </button>
  );
};
