import { findMatchingIntegration, integrations } from '@superglue/shared';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { StepExecutionResult } from './client-utils';

export const inputErrorStyles = "border-red-500 focus:border-red-500 focus:ring-red-500";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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

export const isEmptyData = (value: any): boolean => {
  if (value === null || value === undefined) return true;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) return true;
    const first = trimmed[0];
    if (first === '{' || first === '[') {
      try {
        const parsed = JSON.parse(trimmed);
        return isEmptyData(parsed);
      } catch {
        return false;
      }
    }
    return false;
  }

  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
};

export const computeStepOutput = (
  result: StepExecutionResult
): { output: any; failed: boolean; emptyHint?: boolean; error?: string } => {
  const failed = !result?.success;
  if (failed) {
    return { output: result?.error || 'Step execution failed', failed: true, error: result?.error };
  }
  return {
    output: result?.data,
    failed: false,
    emptyHint: isEmptyData(result?.data),
    error: result?.error
  };
};
