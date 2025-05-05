import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function cleanUrl(url: string): URL {
  try {
    if (!url) return new URL("https://example.com");
    if (!url.includes('://')) {
      url = 'https://' + url;
    }
    
    const urlObj = new URL(url);
    return urlObj;
  } catch (e) {
    return new URL("https://example.com");
  }
}

export function composeUrl(host: string, path: string | undefined) {
  if(!host && !path) return '';
  // Handle empty/undefined inputs
  if (!host) host = '';
  if (!path) path = '';
  
  // Trim slashes in one pass
  const cleanHost = host.endsWith('/') ? host.slice(0, -1) : host;
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;

  return `${cleanHost}/${cleanPath}`;
}

