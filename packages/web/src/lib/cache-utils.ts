import { getCacheScopeIdentifier } from "./cache-scope-identifier";

const getCacheKey = (scopeIdentifier: string, prefix: string) => {
  const hash = scopeIdentifier.split("").reduce((acc, char) => {
    return ((acc << 5) - acc + char.charCodeAt(0)) | 0;
  }, 0);
  return `${prefix}-${Math.abs(hash)}`;
};

const MAX_CACHE_SIZE = 4 * 1024 * 1024; // 4MB limit (localStorage typically allows 5-10MB)

export const loadFromCache = <T>(prefix: string): T | null => {
  try {
    const scopeIdentifier = getCacheScopeIdentifier();
    if (!scopeIdentifier) return null;

    const cached = localStorage.getItem(getCacheKey(scopeIdentifier, prefix));
    if (!cached) return null;
    return JSON.parse(cached);
  } catch (error) {
    console.error("Error loading cached data:", error);
    return null;
  }
};

export const saveToCache = (prefix: string, data: unknown): void => {
  const scopeIdentifier = getCacheScopeIdentifier();
  if (!scopeIdentifier) return;

  try {
    const serialized = JSON.stringify(data);
    if (serialized.length > MAX_CACHE_SIZE) {
      console.warn(
        `Cache data too large (${(serialized.length / 1024 / 1024).toFixed(2)}MB), skipping cache`,
      );
      return;
    }
    localStorage.setItem(getCacheKey(scopeIdentifier, prefix), serialized);
  } catch (error) {
    if (
      error instanceof DOMException &&
      (error.name === "QuotaExceededError" || error.code === 22)
    ) {
      console.warn("localStorage quota exceeded, clearing old cache entries");
      try {
        // Clear old cache entries and retry - match both 'cache' and 'superglue-' prefixed keys
        const keys = Object.keys(localStorage);
        const currentKey = getCacheKey(scopeIdentifier, prefix);
        keys
          .filter((k) => k !== currentKey && (k.includes("cache") || k.startsWith("superglue-")))
          .forEach((k) => localStorage.removeItem(k));
        const serialized = JSON.stringify(data);
        if (serialized.length <= MAX_CACHE_SIZE) {
          localStorage.setItem(currentKey, serialized);
        }
      } catch (retryError) {
        // If still failing, just give up silently - cache is non-essential
        console.warn("Failed to save cache after cleanup, skipping");
      }
    } else {
      console.error("Error saving cache data:", error);
    }
  }
};
