import type { DataStore } from "./datastore.js";

export type Context = {
  datastore: DataStore;
  orgId: string;
};
// Workflow related types
export type ExecutionMode = "DIRECT" | "LOOP";

export interface Metadata {
  runId?: string;
  orgId?: string;
}

export interface LogEntry {
  id: string;
  message: string;
  level: string;
  timestamp: Date;
  runId?: string;
  orgId?: string;
}