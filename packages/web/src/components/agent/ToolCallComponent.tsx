"use client";

import { Tool, ToolCall, ToolDiff } from "@superglue/shared";
import { UserAction } from "@/src/lib/agent/agent-types";
import {
  AuthenticateOAuthComponent,
  BackgroundToolIndicator,
  BuildToolComponent,
  CallSystemComponent,
  CreateSystemComponent,
  DefaultComponent,
  EditPayloadComponent,
  EditToolComponent,
  ModifySystemComponent,
  RunResultsComponent,
  RunToolComponent,
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
        <BuildToolComponent
          tool={tool}
          sendAgentRequest={sendAgentRequest}
          bufferAction={bufferAction}
          isPlayground={isPlayground}
          filePayloads={filePayloads}
        />
      );
    case "edit_tool":
      return (
        <EditToolComponent
          tool={tool}
          onToolUpdate={onToolUpdate}
          sendAgentRequest={sendAgentRequest}
          bufferAction={bufferAction}
          onAbortStream={onAbortStream}
          onApplyChanges={onApplyChanges}
          isPlayground={isPlayground}
          filePayloads={filePayloads}
        />
      );
    case "run_tool":
      return <RunToolComponent tool={tool} isPlayground={isPlayground} />;

    // System tools
    case "create_system":
      return (
        <CreateSystemComponent
          tool={tool}
          onInputChange={onInputChange}
          onToolUpdate={onToolUpdate}
          sendAgentRequest={sendAgentRequest}
          onAbortStream={onAbortStream}
        />
      );
    case "edit_system":
      return (
        <ModifySystemComponent
          tool={tool}
          onInputChange={onInputChange}
          onToolUpdate={onToolUpdate}
          sendAgentRequest={sendAgentRequest}
          onAbortStream={onAbortStream}
        />
      );
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
    case "call_system":
      return (
        <CallSystemComponent
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
      return <RunResultsComponent tool={tool} onInputChange={onInputChange} />;

    case "find_system_templates":
    case "web_search":
    case "search_documentation":
    case "find_tool":
    case "find_system":
    case "save_tool":
    case "read_skill":
      return <BackgroundToolIndicator tool={tool} />;

    default:
      return <DefaultComponent tool={tool} onInputChange={onInputChange} />;
  }
}
