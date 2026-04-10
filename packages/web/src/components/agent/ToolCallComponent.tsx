"use client";

import { Tool, ToolCall, ToolDiff } from "@superglue/shared";
import {
  AuthenticateOAuthComponent,
  BackgroundToolIndicator,
  BuildToolComponent,
  CallSystemComponent,
  CreateSystemComponent,
  DefaultComponent,
  EditToolComponent,
  ModifySystemComponent,
  RunToolComponent,
  EditRoleComponent,
  TestRoleAccessComponent,
} from "./tool-components";
import { ToolMutation } from "@/src/lib/agent/agent-tools/tool-call-state";

interface ToolCallComponentProps {
  tool: ToolCall;
  onInputChange: (newInput: any) => void;
  onToolUpdate?: (toolCallId: string, updates: Partial<ToolCall>) => void;
  onToolMutation?: (toolCallId: string, mutation: ToolMutation) => void;
  sendAgentRequest?: (
    userMessage?: string,
    options?: {
      hiddenStarterMessage?: string;
      hideUserMessage?: boolean;
      resumeToolCallId?: string;
    },
  ) => Promise<void>;
  onAbortStream?: () => void;
  onApplyChanges?: (config: Tool, diffs?: ToolDiff[]) => void;
  onApplyPayload?: (newPayload: string) => void;
  onApplyRoleConfig?: (newConfig: any) => void;
  currentPayload?: string;
  isPlayground?: boolean;
  filePayloads?: Record<string, any>;
}

export function ToolCallComponent({
  tool,
  onInputChange,
  onToolUpdate,
  onToolMutation,
  sendAgentRequest,
  onAbortStream,
  onApplyChanges,
  onApplyPayload,
  onApplyRoleConfig,
  currentPayload,
  isPlayground = false,
  filePayloads,
}: ToolCallComponentProps) {
  switch (tool.name) {
    case "build_tool":
      return <BuildToolComponent tool={tool} />;
    case "edit_tool":
      return (
        <EditToolComponent
          tool={tool}
          onToolUpdate={onToolUpdate}
          onToolMutation={onToolMutation}
          sendAgentRequest={sendAgentRequest}
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
          onToolMutation={onToolMutation}
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
          onToolMutation={onToolMutation}
          sendAgentRequest={sendAgentRequest}
          onAbortStream={onAbortStream}
        />
      );
    case "authenticate_oauth":
      return (
        <AuthenticateOAuthComponent
          tool={tool}
          onInputChange={onInputChange}
          onToolMutation={onToolMutation}
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
          onToolMutation={onToolMutation}
          sendAgentRequest={sendAgentRequest}
          onAbortStream={onAbortStream}
        />
      );
    case "edit_role":
      return <EditRoleComponent tool={tool} />;
    case "test_role_access":
      return <TestRoleAccessComponent tool={tool} />;

    case "inspect_role":
    case "find_role":
    case "find_user":
    case "find_system_templates":
    case "web_search":
    case "search_documentation":
    case "find_tool":
    case "find_system":
    case "save_tool":
    case "load_skill":
      return <BackgroundToolIndicator tool={tool} />;

    default:
      return <DefaultComponent tool={tool} onInputChange={onInputChange} />;
  }
}
