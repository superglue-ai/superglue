"use client";

import { ToolCall } from "@superglue/shared";
import { AlertCircle, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { ToolCallWrapper } from "./ToolComponentWrapper";

interface DefaultComponentProps {
  tool: ToolCall;
  onInputChange: (newInput: any) => void;
}

export function DefaultComponent({ tool, onInputChange }: DefaultComponentProps) {
  const [activeTab, setActiveTab] = useState<"input" | "output">("input");

  // Set initial active tab and update when tool status changes
  useEffect(() => {
    if ((tool.status === "completed" || tool.status === "error") && tool.output) {
      setActiveTab("output");
    } else if (tool.input && activeTab !== "input" && activeTab !== "output") {
      setActiveTab("input");
    }
  }, [tool.status, tool.output]);

  const copyToClipboard = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <ToolCallWrapper tool={tool}>
      <div className="space-y-4">
        {(tool.input || tool.output) && (
          <div>
            <div className="flex border-b border-border mb-3">
              {tool.input && (
                <button
                  className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors relative -mb-[2px] ${
                    activeTab === "input"
                      ? "text-foreground border-primary"
                      : "text-muted-foreground border-transparent hover:text-foreground hover:border-muted-foreground/50"
                  }`}
                  onClick={() => setActiveTab("input")}
                >
                  Input
                </button>
              )}
              {tool.output && (
                <button
                  className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors relative -mb-[2px] ${
                    activeTab === "output"
                      ? "text-foreground border-primary"
                      : "text-muted-foreground border-transparent hover:text-foreground hover:border-muted-foreground/50"
                  }`}
                  onClick={() => setActiveTab("output")}
                >
                  Output
                </button>
              )}
            </div>

            {activeTab === "input" && tool.input && (
              <div className="bg-muted/50 p-3 rounded-md relative">
                <button
                  onClick={() => copyToClipboard(JSON.stringify(tool.input, null, 2))}
                  className="absolute top-2 right-8 p-1 hover:bg-muted-foreground/20 rounded text-muted-foreground hover:text-foreground transition-colors"
                  title="Copy input"
                >
                  <Copy className="w-5 h-5" />
                </button>
                <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap max-h-64 pr-8">
                  {JSON.stringify(tool.input, null, 2)}
                </pre>
              </div>
            )}

            {activeTab === "output" && tool.output && (
              <div className="bg-muted/50 p-3 rounded-md relative">
                <button
                  onClick={() => {
                    const outputText = (() => {
                      if (typeof tool.output === "string") {
                        try {
                          const parsed = JSON.parse(tool.output);
                          return JSON.stringify(parsed, null, 2);
                        } catch {
                          return tool.output;
                        }
                      }
                      return JSON.stringify(tool.output, null, 2);
                    })();
                    copyToClipboard(outputText);
                  }}
                  className="absolute top-2 right-8 p-1 hover:bg-muted-foreground/20 rounded text-muted-foreground hover:text-foreground transition-colors"
                  title="Copy output"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap max-h-64 pr-8">
                  {(() => {
                    // If output is a string, try to parse and prettify JSON
                    if (typeof tool.output === "string") {
                      try {
                        const parsed = JSON.parse(tool.output);
                        return JSON.stringify(parsed, null, 2);
                      } catch {
                        // Not JSON, return as-is
                        return tool.output;
                      }
                    }
                    // If output is an object, stringify it
                    return JSON.stringify(tool.output, null, 2);
                  })()}
                </pre>
              </div>
            )}
          </div>
        )}

        {tool.error && (
          <div className="border border-red-200/40 dark:border-red-700/40 p-3 rounded-md flex items-start gap-2 overflow-hidden">
            <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-red-900 dark:text-red-100 mb-1">Error</div>
              <div className="text-sm text-red-800 dark:text-red-200 break-words max-h-40 overflow-y-auto">
                {typeof tool.error === "string" ? tool.error : JSON.stringify(tool.error, null, 2)}
              </div>
            </div>
          </div>
        )}
      </div>
    </ToolCallWrapper>
  );
}
