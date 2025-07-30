
import type { RunListResponse } from '../types/run.js';
import { createDataStore } from '../../datastore/datastore.js';
import { telemetryClient } from "../../utils/telemetry.js";

const datastore = createDataStore({ type: String(process.env.DATASTORE_TYPE || 'memory').toLowerCase() as 'redis' | 'memory' | 'file' | 'postgres' });

export async function listRuns(
  limit: number,
  offset: number,
  configId: string,
  orgId: string
): Promise<RunListResponse> {
  return datastore.listRuns(limit, offset, configId, orgId);
}


export async function getRunService(id: string, orgId: string) {
  if (!id) {
    throw new Error("id is required");
  }

  const run = await datastore.getRun(id, orgId);
  if (!run) {
    telemetryClient?.captureException(new Error(`run with id ${id} not found`), orgId, { id });
    throw new Error(`run with id ${id} not found`);
  }

  return run;
}
