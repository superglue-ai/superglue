"use client";

import { cn } from "@/src/lib/general-utils";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, ExternalLink } from "lucide-react";
import { useState } from "react";
import { CodeSnippet } from "../../editors/ReadonlyCodeEditor";

interface SdkAccordionProps {
  typescriptCode: string;
  pythonCode: string;
  curlCommand: string;
  /** Whether to show install commands separately (modal style) or inline (card style) */
  variant?: "modal" | "card";
  /** Default expanded section */
  defaultExpanded?: string | null;
}

export function SdkAccordion({
  typescriptCode,
  pythonCode,
  curlCommand,
  variant = "card",
  defaultExpanded = null,
}: SdkAccordionProps) {
  const [expandedSdk, setExpandedSdk] = useState<string | null>(defaultExpanded);

  const isModal = variant === "modal";
  const buttonPadding = isModal ? "py-3" : "py-2";
  const overflowClass = isModal ? "overflow-x-hidden pb-3" : "overflow-hidden pb-2";

  return (
    <div className="space-y-0">
      {/* JavaScript */}
      <div className="min-w-0">
        <button
          onClick={() => setExpandedSdk(expandedSdk === "typescript" ? null : "typescript")}
          className={cn(
            "w-full flex items-center px-0 hover:!bg-transparent focus:outline-none cursor-pointer",
            buttonPadding,
          )}
        >
          <ChevronRight
            className={cn(
              "h-4 w-4 mr-2 transition-transform",
              expandedSdk === "typescript" && "rotate-90",
            )}
          />
          <span className="text-sm">JavaScript</span>
        </button>
        <AnimatePresence initial={false}>
          {expandedSdk === "typescript" && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className={overflowClass}
            >
              {isModal ? (
                <>
                  <div className="mt-3">
                    <div className="text-xs text-muted-foreground mb-2">Install</div>
                    <CodeSnippet code="npm install @superglue/client" language="bash" />
                  </div>
                  <div className="mt-4">
                    <div className="text-xs text-muted-foreground mb-2">Code</div>
                    <CodeSnippet code={typescriptCode} language="typescript" />
                  </div>
                </>
              ) : (
                <>
                  <div className="text-xs text-muted-foreground mb-1">
                    npm install @superglue/client
                  </div>
                  <CodeSnippet code={typescriptCode} language="typescript" />
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Python */}
      <div className="min-w-0">
        <button
          onClick={() => setExpandedSdk(expandedSdk === "python" ? null : "python")}
          className={cn(
            "w-full flex items-center px-0 hover:!bg-transparent focus:outline-none cursor-pointer",
            buttonPadding,
          )}
        >
          <ChevronRight
            className={cn(
              "h-4 w-4 mr-2 transition-transform",
              expandedSdk === "python" && "rotate-90",
            )}
          />
          <span className="text-sm">Python</span>
        </button>
        <AnimatePresence initial={false}>
          {expandedSdk === "python" && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className={overflowClass}
            >
              {isModal ? (
                <>
                  <div className="mt-3">
                    <div className="text-xs text-muted-foreground mb-2">Install</div>
                    <CodeSnippet code="pip install superglue-client" language="bash" />
                  </div>
                  <div className="mt-4">
                    <div className="text-xs text-muted-foreground mb-2">Code</div>
                    <CodeSnippet code={pythonCode} language="python" />
                  </div>
                </>
              ) : (
                <>
                  <div className="text-xs text-muted-foreground mb-1">
                    pip install superglue-client
                  </div>
                  <CodeSnippet code={pythonCode} language="python" />
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* cURL */}
      <div className="min-w-0">
        <button
          onClick={() => setExpandedSdk(expandedSdk === "curl" ? null : "curl")}
          className={cn(
            "w-full flex items-center px-0 hover:!bg-transparent focus:outline-none cursor-pointer",
            buttonPadding,
          )}
        >
          <ChevronRight
            className={cn(
              "h-4 w-4 mr-2 transition-transform",
              expandedSdk === "curl" && "rotate-90",
            )}
          />
          <span className="text-sm">cURL</span>
        </button>
        <AnimatePresence initial={false}>
          {expandedSdk === "curl" && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className={overflowClass}
            >
              <CodeSnippet code={curlCommand} language="bash" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className={cn("text-xs text-muted-foreground", isModal ? "mt-5" : "pt-2")}>
        <a
          href="https://docs.superglue.cloud/sdk/overview"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 hover:underline"
        >
          Learn more about the SDK
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
