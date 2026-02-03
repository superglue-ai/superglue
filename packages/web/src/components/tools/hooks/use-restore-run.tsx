"use client";
import { useConfig } from "@/src/app/config-context";
import { createEESuperglueClient } from "@/src/lib/ee-superglue-client";
import { Tool, ToolStepResult } from "@superglue/shared";
import { useCallback } from "react";

export interface RestoredRunData {
  tool?: Tool;
  payload: Record<string, any>;
  stepResults: ToolStepResult[];
  data?: any;
  success: boolean;
  error?: string;
}

/**
 * Hook to load and restore a specific run by ID.
 * Returns a function that fetches run data from DB and optionally S3.
 */
export function useRestoreRun() {
  const config = useConfig();

  const restoreRun = useCallback(
    async (runId: string): Promise<RestoredRunData | null> => {
      try {
        const client = createEESuperglueClient(config.superglueEndpoint, config.apiEndpoint);

        // Get run metadata first
        const runData = await client.getRun(runId);
        if (!runData) {
          console.error("Run not found:", runId);
          return null;
        }

        // Try to get full results from S3
        let s3Results: any = null;
        try {
          s3Results = await client.getRunResults(runId);
        } catch (err) {
          // S3 results not available, that's okay - use DB data
        }

        // Merge S3 results with DB data, preferring S3 but falling back to DB
        const payload = s3Results?.toolPayload ?? runData.toolPayload ?? {};
        const stepResults = s3Results?.stepResults ?? runData.stepResults ?? [];
        const data = s3Results?.data ?? runData.data;
        const success = s3Results?.success ?? runData.status === "SUCCESS";
        const error = s3Results?.error ?? runData.error;

        // Ensure we have at least some data to restore
        const hasPayload = payload && Object.keys(payload).length > 0;
        if (!runData.tool && !hasPayload && stepResults.length === 0 && !data) {
          console.error("No data available for this run:", runId);
          return null;
        }

        return {
          tool: runData.tool,
          payload,
          stepResults,
          data,
          success,
          error,
        };
      } catch (err: any) {
        console.error("Failed to restore run:", err);
        return null;
      }
    },
    [config.superglueEndpoint, config.apiEndpoint],
  );

  return restoreRun;
}
