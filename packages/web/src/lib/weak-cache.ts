import type { TaskType } from "../workers/compute-worker";

function hash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

export function getDataHash(data: any): string {
  const str = typeof data === "string" ? data : JSON.stringify(data);
  return str.length > 500 ? hash(str) : str;
}

class CacheManager {
  private cache = new Map<string, Map<TaskType, any>>();

  get(data: any, taskType: TaskType): any | null {
    return this.cache.get(getDataHash(data))?.get(taskType) ?? null;
  }

  set(data: any, taskType: TaskType, result: any): void {
    const key = getDataHash(data);
    if (!this.cache.has(key)) this.cache.set(key, new Map());
    this.cache.get(key)!.set(taskType, result);
  }

  clear(): void {
    this.cache.clear();
  }
}

export const globalCache = new CacheManager();
