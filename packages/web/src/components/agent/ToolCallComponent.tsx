"use client";

import { Tool, ToolCall, ToolDiff } from "@superglue/shared";
import {
  AuthenticateOAuthComponent,
  CallEndpointComponent,
  CreateSystemComponent,
  DefaultComponent,
  EditPayloadComponent,
  ModifySystemComponent,
  SaveToolComponent,
  SearchDocumentationComponent,
  ToolBuilderComponent,
} from "./tool-components";

interface ToolCallComponentProps {
  tool: ToolCall;
  onInputChange: (newInput: any) => void;
  onOAuthComplete?: (toolCallId: string, systemData: any) => void;
  onToolUpdate?: (toolCallId: string, updates: Partial<ToolCall>) => void;
  onSystemMessage?: (message: string, options?: { triggerImmediateResponse?: boolean }) => void;
  onTriggerContinuation?: () => void;
  onAbortStream?: () => void;
  onApplyChanges?: (config: Tool, diffs?: ToolDiff[]) => void;
  onApplyPayload?: (newPayload: string) => void;
  currentPayload?: string;
  isPlayground?: boolean;
}

export function ToolCallComponent({
  tool,
  onInputChange,
  onOAuthComplete,
  onToolUpdate,
  onSystemMessage,
  onTriggerContinuation,
  onAbortStream,
  onApplyChanges,
  onApplyPayload,
  currentPayload,
  isPlayground = false,
}: ToolCallComponentProps) {
  switch (tool.name) {
    // Unified build/fix/run component
    case "build_tool":
      return (
        <ToolBuilderComponent
          tool={tool}
          mode="build"
          onInputChange={onInputChange}
          onSystemMessage={onSystemMessage}
          isPlayground={isPlayground}
        />
      );
    case "edit_tool":
      return (
        <ToolBuilderComponent
          tool={tool}
          mode="fix"
          onInputChange={onInputChange}
          onToolUpdate={onToolUpdate}
          onSystemMessage={onSystemMessage}
          onTriggerContinuation={onTriggerContinuation}
          onAbortStream={onAbortStream}
          onApplyChanges={onApplyChanges}
          isPlayground={isPlayground}
          currentPayload={currentPayload}
        />
      );
    case "run_tool":
      return (
        <ToolBuilderComponent
          tool={tool}
          mode="run"
          onInputChange={onInputChange}
          onSystemMessage={onSystemMessage}
          isPlayground={isPlayground}
        />
      );
    case "save_tool":
      return <SaveToolComponent tool={tool} onInputChange={onInputChange} />;

    // System tools
    case "create_system":
      return <CreateSystemComponent tool={tool} onInputChange={onInputChange} />;
    case "modify_system":
      return <ModifySystemComponent tool={tool} onInputChange={onInputChange} />;
    case "authenticate_oauth":
      return (
        <AuthenticateOAuthComponent
          tool={tool}
          onInputChange={onInputChange}
          onOAuthComplete={onOAuthComplete}
          onSystemMessage={onSystemMessage}
          onAbortStream={onAbortStream}
        />
      );

    // Other tools
    case "search_documentation":
      return <SearchDocumentationComponent tool={tool} onInputChange={onInputChange} />;
    case "call_endpoint":
      return (
        <CallEndpointComponent
          tool={tool}
          onInputChange={onInputChange}
          onToolUpdate={onToolUpdate}
          onTriggerContinuation={onTriggerContinuation}
          onAbortStream={onAbortStream}
        />
      );
    case "edit_payload":
      return (
        <EditPayloadComponent
          tool={tool}
          currentPayload={currentPayload || "{}"}
          onToolUpdate={onToolUpdate}
          onTriggerContinuation={onTriggerContinuation}
          onApplyPayload={onApplyPayload}
        />
      );

    case "get_runs":
    case "find_system_templates":
    case "web_search":
      return null;

    default:
      return <DefaultComponent tool={tool} onInputChange={onInputChange} />;
  }
}
