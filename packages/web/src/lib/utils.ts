import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function cleanApiDomain(url: string): string {
  try {
    if (!url) return '';
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    
    const urlObj = new URL(url);
    // Return only origin (protocol + hostname + port if exists & non-standard)
    return urlObj.origin;
  } catch (e) {
    // If URL parsing fails, just use the user input verbatim
    return url;
  }
}

export function composeUrl(host: string, path: string | undefined) {
  // Handle empty/undefined inputs
  if (!host) host = '';
  if (!path) path = '';
  
  // Trim slashes in one pass
  const cleanHost = host.endsWith('/') ? host.slice(0, -1) : host;
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;

  return `${cleanHost}/${cleanPath}`;
}

