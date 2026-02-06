"use client";

import { ToolCall } from "@superglue/shared";
import { AlertCircle, BookOpen, FileText, Loader2 } from "lucide-react";
import { ToolCallWrapper } from "./ToolComponentWrapper";

interface SearchDocumentationComponentProps {
  tool: ToolCall;
  onInputChange: (newInput: any) => void;
}

export function SearchDocumentationComponent({
  tool,
  onInputChange,
}: SearchDocumentationComponentProps) {
  const isLoading = tool.status === "pending" || tool.status === "running";
  const keywords = tool.input?.keywords || "";
  const systemId = tool.input?.systemId || "";

  const output = typeof tool.output === "string" ? JSON.parse(tool.output) : tool.output;
  const hasNoDocumentation = output?.noDocumentation || false;
  const hasNoResults = output?.noResults || false;
  const message = output?.message || "";

  return (
    <ToolCallWrapper tool={tool}>
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-1">
            <BookOpen className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm">
              <span className="text-muted-foreground">System:</span>{" "}
              <span className="font-mono text-xs">{systemId}</span>
            </div>
            <div className="text-sm mt-1">
              <span className="text-muted-foreground">Keywords:</span>{" "}
              <span className="font-medium">{keywords}</span>
            </div>
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Searching documentation...</span>
          </div>
        )}

        {tool.status === "completed" && hasNoDocumentation && (
          <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-md space-y-2">
            <div className="flex items-start gap-2">
              <FileText className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-amber-900 dark:text-amber-100">
                  No Documentation Available
                </div>
                <div className="text-xs text-amber-800 dark:text-amber-200 mt-1 whitespace-pre-line">
                  {message}
                </div>
              </div>
            </div>
          </div>
        )}

        {tool.status === "completed" && hasNoResults && !hasNoDocumentation && (
          <div className="bg-muted/50 p-3 rounded-md space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">No Results Found</div>
                <div className="text-xs text-muted-foreground mt-1">{message}</div>
              </div>
            </div>
          </div>
        )}

        {tool.error && !hasNoDocumentation && (
          <div className="border border-red-200/40 dark:border-red-700/40 p-3 rounded-md flex items-start gap-2 overflow-hidden">
            <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-800 dark:text-red-200 break-words min-w-0 max-h-40 overflow-y-auto">
              {typeof tool.error === "string" ? tool.error : JSON.stringify(tool.error, null, 2)}
            </div>
          </div>
        )}
      </div>
    </ToolCallWrapper>
  );
}
