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
  ModifySystemComponent,
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
  bufferAction?: (action: UserAction) => void;
  onAbortStream?: () => void;
  onApplyChanges?: (config: Tool, diffs?: ToolDiff[]) => void;
  onApplyPayload?: (newPayload: string) => void;
  currentPayload?: string;
  isPlayground?: boolean;
  filePayloads?: Record<string, any>;
}

export function ToolCallComponent({
  tool,
  onInputChange,
  onToolUpdate,
  sendAgentRequest,
  bufferAction,
  onAbortStream,
  onApplyChanges,
  onApplyPayload,
  currentPayload,
  isPlayground = false,
  filePayloads,
}: ToolCallComponentProps) {
  switch (tool.name) {
    case "build_tool":
      return (
        <ToolBuilderComponent
          tool={tool}
          mode="build"
          onInputChange={onInputChange}
          sendAgentRequest={sendAgentRequest}
          bufferAction={bufferAction}
          isPlayground={isPlayground}
          filePayloads={filePayloads}
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
          bufferAction={bufferAction}
          onAbortStream={onAbortStream}
          onApplyChanges={onApplyChanges}
          isPlayground={isPlayground}
          currentPayload={currentPayload}
          filePayloads={filePayloads}
        />
      );
    case "run_tool":
      return (
        <ToolBuilderComponent
          tool={tool}
          mode="run"
          onInputChange={onInputChange}
          sendAgentRequest={sendAgentRequest}
          bufferAction={bufferAction}
          isPlayground={isPlayground}
          filePayloads={filePayloads}
        />
      );

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
    case "find_system_templates":
    case "web_search":
    case "search_documentation":
    case "find_tool":
    case "find_system":
    case "save_tool":
      return <BackgroundToolIndicator tool={tool} />;

    default:
      return <DefaultComponent tool={tool} onInputChange={onInputChange} />;
  }
}
