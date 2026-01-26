"use client";

import { Tool, ToolCall, ToolDiff } from "@superglue/shared";
import { UserAction } from "@/src/lib/agent/agent-types";
import {
  AuthenticateOAuthComponent,
  BackgroundToolIndicator,
  CallEndpointComponent,
  CreateSystemComponent,
  DefaultComponent,
  EditPayloadComponent,
  GetRunsComponent,
  ModifySystemComponent,
  SaveToolComponent,
  ToolBuilderComponent,
} from "./tool-components";

interface ToolCallComponentProps {
  tool: ToolCall;
  onInputChange: (newInput: any) => void;
  onToolUpdate?: (toolCallId: string, updates: Partial<ToolCall>) => void;
  sendAgentRequest?: (
    userMessage?: string,
    options?: { userActions?: UserAction[] },
  ) => Promise<void>;
  onAbortStream?: () => void;
  onApplyChanges?: (config: Tool, diffs?: ToolDiff[]) => void;
  onApplyPayload?: (newPayload: string) => void;
  currentPayload?: string;
  isPlayground?: boolean;
}

export function ToolCallComponent({
  tool,
  onInputChange,
  onToolUpdate,
  sendAgentRequest,
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
          sendAgentRequest={sendAgentRequest}
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
          sendAgentRequest={sendAgentRequest}
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
          sendAgentRequest={sendAgentRequest}
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
          sendAgentRequest={sendAgentRequest}
          onAbortStream={onAbortStream}
        />
      );

    // Other tools
    case "call_endpoint":
      return (
        <CallEndpointComponent
          tool={tool}
          onInputChange={onInputChange}
          onToolUpdate={onToolUpdate}
          sendAgentRequest={sendAgentRequest}
          onAbortStream={onAbortStream}
        />
      );
    case "edit_payload":
      return (
        <EditPayloadComponent
          tool={tool}
          currentPayload={currentPayload || "{}"}
          onToolUpdate={onToolUpdate}
          sendAgentRequest={sendAgentRequest}
          onApplyPayload={onApplyPayload}
        />
      );

    case "get_runs":
      return <GetRunsComponent tool={tool} onInputChange={onInputChange} />;

    case "find_system_templates":
    case "web_search":
    case "search_documentation":
      return <BackgroundToolIndicator tool={tool} />;

    default:
      return <DefaultComponent tool={tool} onInputChange={onInputChange} />;
  }
}
