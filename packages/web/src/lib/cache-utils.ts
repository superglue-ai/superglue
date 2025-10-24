const getCacheKey = (apiKey: string, prefix: string) => {
  const hash = apiKey.split('').reduce((acc, char) => {
    return ((acc << 5) - acc) + char.charCodeAt(0) | 0;
  }, 0);
  return `${prefix}-${Math.abs(hash)}`;
};

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
    localStorage.setItem(getCacheKey(apiKey, prefix), JSON.stringify(data));
  } catch (error) {
    console.error('Error saving cache data:', error);
  }
};

