"use client";

import { Button } from "@/src/components/ui/button";
import { UserAction } from "@/src/lib/agent/agent-types";
import { EnrichedDiff, buildUnifiedDiff } from "@/src/lib/config-diff-utils";
import { ToolCall, ToolDiff } from "@superglue/shared";
import { Check, X } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { DiffDisplay } from "./DiffDisplayComponent";
import { ToolCallWrapper } from "./ToolComponentWrapper";

interface EditPayloadComponentProps {
  tool: ToolCall;
  currentPayload: string;
  onToolUpdate?: (toolCallId: string, updates: Partial<ToolCall>) => void;
  sendAgentRequest?: (
    userMessage?: string,
    options?: { userActions?: UserAction[] },
  ) => Promise<void>;
  onApplyPayload?: (newPayload: string) => void;
}

export function EditPayloadComponent({
  tool,
  currentPayload,
  onToolUpdate,
  sendAgentRequest,
  onApplyPayload,
}: EditPayloadComponentProps) {
  const [decision, setDecision] = useState<"pending" | "approved" | "rejected">("pending");
  const [hasActed, setHasActed] = useState(false);

  const parsedOutput = useMemo(() => {
    if (!tool.output) return null;
    try {
      return typeof tool.output === "string" ? JSON.parse(tool.output) : tool.output;
    } catch {
      return null;
    }
  }, [tool.output]);

  const newPayload = parsedOutput?.newPayload;
  const isSuccess = parsedOutput?.success === true;
  const hasPayloadDiff = isSuccess && newPayload;

  const capturedOldPayloadRef = useRef<string | null>(null);
  if (newPayload && capturedOldPayloadRef.current === null) {
    capturedOldPayloadRef.current = currentPayload || "{}";
  }

  const payloadDiff = useMemo<ToolDiff | null>(() => {
    if (!newPayload || capturedOldPayloadRef.current === null) return null;
    // Try to parse as JSON for the value, fall back to string
    let parsedValue: any = newPayload;
    try {
      parsedValue = JSON.parse(newPayload);
    } catch {
      // Keep as string
    }
    return {
      op: "replace" as const,
      path: "/payload",
      value: parsedValue,
    };
  }, [newPayload]);

  const enrichedDiffs = useMemo<EnrichedDiff[]>(() => {
    if (!payloadDiff) return [];
    // Build the old value from captured payload
    let oldValue: any = capturedOldPayloadRef.current || "{}";
    try {
      oldValue = JSON.parse(oldValue);
    } catch {}
    return [
      {
        diff: payloadDiff,
        target: { type: "toolInput" as const },
        oldValue,
        newValue: payloadDiff.value,
        lines: buildUnifiedDiff(oldValue, payloadDiff.value, payloadDiff.op),
      },
    ];
  }, [payloadDiff]);

  const handleApprove = useCallback(() => {
    if (!newPayload || !onApplyPayload || !sendAgentRequest) return;

    setDecision("approved");
    setHasActed(true);
    onApplyPayload(newPayload);
    onToolUpdate?.(tool.id, { status: "completed" });

    sendAgentRequest(undefined, {
      userActions: [
        {
          type: "tool_event",
          toolCallId: tool.id,
          toolName: "edit_payload",
          event: "confirmed",
        },
      ],
    });
  }, [newPayload, onApplyPayload, onToolUpdate, tool.id, sendAgentRequest]);

  const handleReject = useCallback(() => {
    if (!sendAgentRequest) return;

    setDecision("rejected");
    setHasActed(true);
    onToolUpdate?.(tool.id, { status: "declined" });

    sendAgentRequest(undefined, {
      userActions: [
        {
          type: "tool_event",
          toolCallId: tool.id,
          toolName: "edit_payload",
          event: "declined",
        },
      ],
    });
  }, [onToolUpdate, tool.id, sendAgentRequest]);

  const isPending = tool.status === "awaiting_confirmation" && decision === "pending";
  const shouldBeOpen = isPending && !hasActed;

  return (
    <ToolCallWrapper tool={tool} openByDefault={shouldBeOpen}>
      {hasPayloadDiff && (
        <div className="space-y-4">
          <div className="max-h-[300px] overflow-y-auto">
            <DiffDisplay enrichedDiffs={enrichedDiffs} />
          </div>

          {isPending && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleReject} className="h-8">
                <X className="w-3 h-3 mr-1" />
                Reject
              </Button>
              <Button
                size="sm"
                onClick={handleApprove}
                className="h-8 bg-green-600 hover:bg-green-700"
              >
                <Check className="w-3 h-3 mr-1" />
                Apply Changes
              </Button>
            </div>
          )}
        </div>
      )}
    </ToolCallWrapper>
  );
}
