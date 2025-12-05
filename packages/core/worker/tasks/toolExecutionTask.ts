import { RequestOptions, Tool, ToolResult, ToolStepResult } from "@superglue/shared";
import { createDataStore } from "../../datastore/datastore.js";
import { DataStore } from "../../datastore/types.js";
import { IntegrationManager } from "../../integrations/integration-manager.js";
import { ToolExecutor } from "../../tools/tool-executor.js";

export interface ToolExecutionPayload {
  runId: string;
  workflow: Tool;
  payload?: Record<string, any>;
  credentials?: Record<string, string>;
  options?: RequestOptions;
  integrationIds: string[];
  orgId: string;
  traceId?: string;
}

export interface ToolExecutionResult {
  runId: string;
  success: boolean;
  data?: any;
  error?: string;
  stepResults: ToolStepResult[];
  config?: Tool;
  startedAt: Date;
  completedAt: Date;
}

let workerDatastore: DataStore | null = null;

function getWorkerDatastore(): DataStore {
  if (!workerDatastore) {
    workerDatastore = createDataStore({ 
      type: (process.env.DATASTORE_TYPE?.toLowerCase()) as 'file' | 'postgres'
    });
  }
  return workerDatastore;
}

export async function run(payload: ToolExecutionPayload): Promise<ToolExecutionResult> {
  const startedAt = new Date();
  const datastore = getWorkerDatastore();
  const metadata = { orgId: payload.orgId, traceId: payload.traceId };
  
  try {
    const integrationManagers = payload.integrationIds.length > 0
      ? await IntegrationManager.fromIds(payload.integrationIds, datastore, metadata)
      : [];
    
    const executor = new ToolExecutor({ 
      tool: payload.workflow, 
      metadata, 
      integrations: integrationManagers 
    });
    
    const result: ToolResult = await executor.execute({ 
      payload: payload.payload, 
      credentials: payload.credentials, 
      options: payload.options 
    });

    return {
      runId: payload.runId,
      success: result.success,
      data: result.data,
      error: result.error,
      stepResults: result.stepResults,
      config: result.config,
      startedAt,
      completedAt: new Date()
    };
  } catch (error) {
    return {
      runId: payload.runId,
      success: false,
      data: undefined,
      error: String(error),
      stepResults: [],
      config: payload.workflow,
      startedAt,
      completedAt: new Date()
    };
  }
}
