
import type { RunListResponse } from '../types/run.js';
import { createDataStore } from '../../datastore/datastore.js';

const datastore = createDataStore({ type: String(process.env.DATASTORE_TYPE || 'memory').toLowerCase() as 'redis' | 'memory' | 'file' | 'postgres' });

export async function listRuns(
  limit: number,
  offset: number,
  configId: string,
  orgId: string
): Promise<RunListResponse> {
  return datastore.listRuns(limit, offset, configId, orgId);
}
