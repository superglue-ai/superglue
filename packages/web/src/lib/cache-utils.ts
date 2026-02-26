import { getCacheScopeIdentifier } from "./cache-scope-identifier";
import { getCache, setCache } from "./storage";

const getCacheKey = (scopeIdentifier: string, prefix: string) => {
  const hash = scopeIdentifier.split("").reduce((acc, char) => {
    return ((acc << 5) - acc + char.charCodeAt(0)) | 0;
  }, 0);
  return `${prefix}-${Math.abs(hash)}`;
};

const MAX_CACHE_SIZE = 100 * 1024 * 1024; // 100MB limit (IndexedDB can handle much more)

export const loadFromCacheAsync = async <T>(prefix: string): Promise<T | null> => {
  if (typeof window === "undefined") return null;

  try {
    const scopeIdentifier = getCacheScopeIdentifier();
    if (!scopeIdentifier) return null;

    const cacheKey = getCacheKey(scopeIdentifier, prefix);

    const cached = await getCache<T>(cacheKey);
    if (cached !== null) return cached;

    // Fallback to localStorage for migration from old storage
    const localCached = localStorage.getItem(cacheKey);
    if (localCached) {
      try {
        const parsed = JSON.parse(localCached) as T;
        // Migrate to IndexedDB and remove from localStorage
        await setCache(cacheKey, parsed);
        localStorage.removeItem(cacheKey);
        return parsed;
      } catch {
        return null;
      }
    }

    return null;
  } catch (error) {
    console.error("Error loading cached data:", error);
    return null;
  }
};

export const saveToCache = (prefix: string, data: unknown): void => {
  if (typeof window === "undefined") return;

  const scopeIdentifier = getCacheScopeIdentifier();
  if (!scopeIdentifier) return;

  const cacheKey = getCacheKey(scopeIdentifier, prefix);

  try {
    const serialized = JSON.stringify(data);
    if (serialized.length > MAX_CACHE_SIZE) {
      console.warn(
        `Cache data too large (${(serialized.length / 1024 / 1024).toFixed(2)}MB), skipping cache`,
      );
      return;
    }

    setCache(cacheKey, data).catch((error) => {
      console.error("Error saving cache to IndexedDB:", error);
    });
  } catch (error) {
    console.error("Error saving cache data:", error);
  }
};
