import { ToolResult } from "@superglue/shared";
import { SystemManager } from "../../systems/system-manager.js";
import { ToolExecutor } from "../../tools/tool-executor.js";
import { ToolExecutionPayload, ToolExecutionResult } from "../types.js";

export async function run(payload: ToolExecutionPayload): Promise<ToolExecutionResult> {
  const startedAt = new Date();
  const metadata = { orgId: payload.orgId, traceId: payload.traceId };

  try {
    const systemManagers = payload.systems.map(
      (system) => new SystemManager(system, null, metadata),
    );

    const executor = new ToolExecutor({
      tool: payload.workflow,
      metadata,
      systems: systemManagers,
    });

    const result: ToolResult = await executor.execute({
      payload: payload.payload,
      credentials: payload.credentials,
      options: payload.options,
    });

    return {
      runId: payload.runId,
      success: result.success,
      data: result.data,
      error: result.error,
      stepResults: result.stepResults,
      tool: result.tool,
      startedAt,
      completedAt: new Date(),
    };
  } catch (error) {
    return {
      runId: payload.runId,
      success: false,
      data: undefined,
      error: String(error),
      stepResults: [],
      tool: payload.workflow,
      startedAt,
      completedAt: new Date(),
    };
  }
}
