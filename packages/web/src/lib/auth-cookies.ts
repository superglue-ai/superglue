// Cookie utilities for storing API credentials

export interface AuthCredentials {
  apiKey: string;
  apiUrl: string;
}

const API_KEY_COOKIE = "superglue_api_key";
const API_URL_COOKIE = "superglue_api_url";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export function setAuthCookies(credentials: AuthCredentials): void {
  // Add Secure flag on HTTPS to prevent transmission over plain HTTP
  const isSecure = typeof window !== "undefined" && window.location.protocol === "https:";
  const secureFlag = isSecure ? "; Secure" : "";

  document.cookie = `${API_KEY_COOKIE}=${encodeURIComponent(credentials.apiKey)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Strict${secureFlag}`;
  document.cookie = `${API_URL_COOKIE}=${encodeURIComponent(credentials.apiUrl)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Strict${secureFlag}`;
}

export function getAuthCookies(): AuthCredentials | null {
  const cookies = document.cookie.split(";").reduce(
    (acc, cookie) => {
      const [key, value] = cookie.trim().split("=");
      if (key) acc[key] = value;
      return acc;
    },
    {} as Record<string, string>,
  );

  const apiKey = cookies[API_KEY_COOKIE];
  const apiUrl = cookies[API_URL_COOKIE];

  if (apiKey && apiUrl) {
    return {
      apiKey: decodeURIComponent(apiKey),
      apiUrl: decodeURIComponent(apiUrl),
    };
  }

  return null;
}

export function clearAuthCookies(): void {
  document.cookie = `${API_KEY_COOKIE}=; path=/; max-age=0`;
  document.cookie = `${API_URL_COOKIE}=; path=/; max-age=0`;
}
