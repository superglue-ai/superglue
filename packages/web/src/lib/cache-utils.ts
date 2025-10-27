const getCacheKey = (apiKey: string, prefix: string) => {
  const hash = apiKey.split('').reduce((acc, char) => {
    return ((acc << 5) - acc) + char.charCodeAt(0) | 0;
  }, 0);
  return `${prefix}-${Math.abs(hash)}`;
};

const MAX_CACHE_SIZE = 4 * 1024 * 1024; // 4MB limit (localStorage typically allows 5-10MB)

export const loadFromCache = <T>(apiKey: string, prefix: string): T | null => {
  try {
    const cached = localStorage.getItem(getCacheKey(apiKey, prefix));
    if (!cached) return null;
    return JSON.parse(cached);
  } catch (error) {
    console.error('Error loading cached data:', error);
    return null;
  }
};

export const saveToCache = (apiKey: string, prefix: string, data: unknown) => {
  try {
    const serialized = JSON.stringify(data);
    if (serialized.length > MAX_CACHE_SIZE) {
      console.warn(`Cache data too large (${(serialized.length / 1024 / 1024).toFixed(2)}MB), skipping cache`);
      return;
    }
    localStorage.setItem(getCacheKey(apiKey, prefix), serialized);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      console.warn('localStorage quota exceeded, clearing old cache entries');
      try {
        // Clear old cache entries and retry
        const keys = Object.keys(localStorage);
        keys.filter(k => k.includes('cache')).forEach(k => localStorage.removeItem(k));
        const serialized = JSON.stringify(data);
        if (serialized.length <= MAX_CACHE_SIZE) {
          localStorage.setItem(getCacheKey(apiKey, prefix), serialized);
        }
      } catch (retryError) {
        console.error('Failed to save cache after cleanup:', retryError);
      }
    } else {
      console.error('Error saving cache data:', error);
    }
  }
};

