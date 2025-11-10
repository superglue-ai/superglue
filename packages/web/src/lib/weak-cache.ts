import type { TaskType } from "../workers/compute-worker";

export class WeakCacheManager {
  private cache = new WeakMap<object, Map<TaskType, any>>();

  get(data: any, taskType: TaskType): any | null {
    if (!data || typeof data !== "object") return null;

    const taskCache = this.cache.get(data);
    if (!taskCache) return null;

    return taskCache.get(taskType) || null;
  }

  set(data: any, taskType: TaskType, result: any): void {
    if (!data || typeof data !== "object") return;

    let taskCache = this.cache.get(data);
    if (!taskCache) {
      taskCache = new Map();
      this.cache.set(data, taskCache);
    }
    taskCache.set(taskType, result);
  }

  has(data: any, taskType: TaskType): boolean {
    return this.get(data, taskType) !== null;
  }

  clear(): void {
    this.cache = new WeakMap();
  }

  clearForData(data: any): void {
    if (!data || typeof data !== "object") return;
    this.cache.delete(data);
  }
}

export const globalCache = new WeakCacheManager();
