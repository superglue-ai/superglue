import { findMatchingIntegration, integrations } from '@superglue/shared';
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
  if (!host && !path) return '';
  // Handle empty/undefined inputs
  if (!host) host = '';
  if (!path) path = '';

  // Trim slashes in one pass
  const cleanHost = host.endsWith('/') ? host.slice(0, -1) : host;
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;

  return `${cleanHost}/${cleanPath}`;
}

/**
 * Get the icon name for an integration
 * @param integration - The integration object
 * @returns The icon name or null if no match found
 */
export function getIntegrationIcon(integration: { id: string; urlHost?: string }): string | null {
  // First try exact ID match with known integrations
  if (integrations[integration.id]) {
    return integrations[integration.id].icon;
  }

  // Second try: strip any numeric suffix (e.g., "firebase-1" -> "firebase")
  const baseId = integration.id.replace(/-\d+$/, '');
  if (baseId !== integration.id && integrations[baseId]) {
    return integrations[baseId].icon;
  }

  // Finally try using the proper regex-based matching
  if (integration.urlHost) {
    const match = findMatchingIntegration(integration.urlHost);
    if (match) {
      return match.integration.icon;
    }
  }

  return null;
}

