
import type { RunResult } from '@superglue/client';

export interface RunListResponse {
  items: RunResult[];
  total: number;
}