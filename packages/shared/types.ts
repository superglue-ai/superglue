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
  status: 'pending' | 'awaiting_confirmation' | 'running' | 'completed' | 'declined' | 'stopped' | 'error';
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
  buildResult?: any;
}

export enum UserRole {
  ADMIN = 'admin',
  MEMBER = 'member'
}

export enum SupportedFileType {
  JSON = 'JSON',
  CSV = 'CSV',
  XML = 'XML',
  EXCEL = 'EXCEL',
  PDF = 'PDF',
  DOCX = 'DOCX',
  ZIP = 'ZIP',
  GZIP = 'GZIP',
  RAW = 'RAW',
  AUTO = 'AUTO'
}