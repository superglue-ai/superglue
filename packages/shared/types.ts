export interface LogEntry {
  id: string;
  message: string;
  level: string;
  timestamp: Date;
  runId?: string;
  orgId?: string;
}

export interface MessagePart {
  type: 'content' | 'tool';
  content?: string;
  tool?: ToolCall;
  id: string;
}

export interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  tools?: ToolCall[];
  parts?: MessagePart[];
  isStreaming?: boolean;
  attachedFiles?: Array<{
    name: string;
    size?: number;
    key: string;
    status?: 'processing' | 'ready' | 'error';
    error?: string;
  }>;
}

export interface ToolCall {
  id: string;
  name: string;
  input?: any;
  output?: any;
  status: 'pending' | 'running' | 'completed' | 'stopped' | 'error';
  error?: string;
  startTime?: Date;
  endTime?: Date;
  logs?: Array<{
      id: string;
      message: string;
      level: string;
      timestamp: Date;
      runId?: string;
      orgId?: string;
  }>;
  buildResult?: any; // Optional property for build_and_run workflow build results
}