import { truncateForDisplay, truncateLines } from "@/src/lib/general-utils";
import { inferJsonSchema } from "@superglue/shared";

const MAX_DISPLAY_LINES = 3000;

export enum TaskType {
  STRINGIFY = "STRINGIFY",
  COMPUTE_SCHEMA = "COMPUTE_SCHEMA",
  COMPUTE_PREVIEW = "COMPUTE_PREVIEW",
}

export type ComputeTask =
  | { type: TaskType.STRINGIFY; data: any }
  | { type: TaskType.COMPUTE_SCHEMA; data: any }
  | { type: TaskType.COMPUTE_PREVIEW; data: any };

export interface ComputeRequest {
  id: string;
  task: ComputeTask;
}

export interface ComputeResponse {
  id: string;
  result?: any;
  error?: string;
}

const taskHandlers: Record<TaskType, (data: any) => any> = {
  STRINGIFY: (data: any) => {
    return JSON.stringify(data, null, 2);
  },

  COMPUTE_SCHEMA: (data: any) => {
    const schemaObj = inferJsonSchema(data);
    const schemaString = truncateLines(JSON.stringify(schemaObj, null, 2), MAX_DISPLAY_LINES);
    return {
      schema: schemaObj,
      displayString: schemaString,
      truncated: false,
    };
  },

  COMPUTE_PREVIEW: (data: any) => {
    const displayData = truncateForDisplay(data);
    const jsonString = JSON.stringify(data, null, 2);
    const bytes = new Blob([jsonString]).size;

    return {
      displayString: displayData.value,
      truncated: displayData.truncated,
      bytes,
    };
  },
};

// Only set up message handler if we're actually in a worker context
// @ts-ignore - checking for WorkerGlobalScope
if (typeof WorkerGlobalScope !== "undefined" && self instanceof WorkerGlobalScope) {
  // Worker message handler
  self.onmessage = (event: MessageEvent<ComputeRequest>) => {
    // Validate message has required structure
    if (!event.data || !event.data.id || !event.data.task) {
      console.warn("[Worker] Received invalid message, ignoring:", event.data);
      return;
    }

    const { id, task } = event.data;

    try {
      const handler = taskHandlers[task.type];
      if (!handler) {
        throw new Error(`Unknown task type: ${task.type}`);
      }

      const result = handler(task.data);

      const response: ComputeResponse = {
        id,
        result,
      };

      self.postMessage(response);
    } catch (error) {
      const response: ComputeResponse = {
        id,
        error: error instanceof Error ? error.message : "Unknown error",
      };

      self.postMessage(response);
    }
  };
}
