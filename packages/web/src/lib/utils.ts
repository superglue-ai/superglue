import { findMatchingIntegration, integrations } from '@superglue/shared';
import { clsx, type ClassValue } from "clsx";
import prettierPluginBabel from 'prettier/plugins/babel';
import prettierPluginEstree from 'prettier/plugins/estree';
import prettier from 'prettier/standalone';
import type { SimpleIcon } from 'simple-icons';
import * as simpleIcons from 'simple-icons';
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

// Truncation constants for display
export const MAX_DISPLAY_SIZE = 1024 * 1024; // 1MB limit for JSON display
export const MAX_DISPLAY_LINES = 3000; // Max lines to show in any JSON view
export const MAX_STRING_PREVIEW_LENGTH = 3000; // Max chars for individual string values
export const MAX_ARRAY_PREVIEW_ITEMS = 10; // Max array items to show before truncating
export const MAX_TRUNCATION_DEPTH = 10; // Max depth for nested object traversal
export const MAX_OBJECT_PREVIEW_KEYS = 100; // Max object keys to show before truncating

export const truncateValue = (value: any, depth: number = 0): any => {
  if (depth > MAX_TRUNCATION_DEPTH) {
    if (Array.isArray(value)) return '[...]';
    if (typeof value === 'object' && value !== null) return '{...}';
    return '...';
  }

  if (typeof value === 'string') {
    if (value.length > MAX_STRING_PREVIEW_LENGTH) {
      return value.substring(0, MAX_STRING_PREVIEW_LENGTH) + `... [${value.length.toLocaleString()} chars total]`;
    }
    return value;
  }

  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_PREVIEW_ITEMS) {
      return [...value.slice(0, MAX_ARRAY_PREVIEW_ITEMS).map(v => truncateValue(v, depth + 1)), `... ${value.length - MAX_ARRAY_PREVIEW_ITEMS} more items`];
    }
    return value.map(v => truncateValue(v, depth + 1));
  }

  if (typeof value === 'object' && value !== null) {
    const result: any = {};
    const keys = Object.keys(value);
    const keysToShow = keys.slice(0, MAX_OBJECT_PREVIEW_KEYS);
    for (const key of keysToShow) {
      result[key] = truncateValue(value[key], depth + 1);
    }
    if (keys.length > MAX_OBJECT_PREVIEW_KEYS) {
      result['...'] = `${(keys.length - MAX_OBJECT_PREVIEW_KEYS).toLocaleString()} more keys`;
    }
    return result;
  }

  return value;
};

export const truncateForDisplay = (data: any): { value: string, truncated: boolean } => {
  if (data === null || data === undefined) {
    return { value: '{}', truncated: false };
  }
  if (typeof data === 'string') {
    if (data.length > MAX_STRING_PREVIEW_LENGTH) {
      const truncatedString = data.substring(0, MAX_STRING_PREVIEW_LENGTH);
      const lastNewline = truncatedString.lastIndexOf('\n');
      const cleanTruncated = truncatedString.substring(0, lastNewline > 0 ? lastNewline : MAX_STRING_PREVIEW_LENGTH);
      const note = `\n\n... [String truncated - showing ${MAX_STRING_PREVIEW_LENGTH.toLocaleString()} of ${data.length.toLocaleString()} characters]`;
      const combined = `${cleanTruncated}${note}`;
      return { value: JSON.stringify(combined), truncated: true };
    }
    return { value: JSON.stringify(data), truncated: false };
  }
  try {
    const truncatedData = truncateValue(data);
    let jsonString = JSON.stringify(truncatedData, null, 2);
    if (jsonString.length > MAX_DISPLAY_SIZE) {
      jsonString = jsonString.substring(0, MAX_DISPLAY_SIZE);
      const lastNewline = jsonString.lastIndexOf('\n');
      if (lastNewline > 0) jsonString = jsonString.substring(0, lastNewline);
      return { value: jsonString + '\n\n... [Data truncated - exceeds size limit]', truncated: true };
    }
    const lines = jsonString.split('\n');
    if (lines.length > MAX_DISPLAY_LINES) {
      return { value: lines.slice(0, MAX_DISPLAY_LINES).join('\n') + '\n\n... [Truncated - too many lines]', truncated: true };
    }
    const originalJson = JSON.stringify(data, null, 2);
    const wasTruncated = originalJson !== jsonString;
    return { value: jsonString, truncated: wasTruncated };
  } catch {
    const stringValue = String(data);
    if (stringValue.length > MAX_STRING_PREVIEW_LENGTH) {
      const preview = stringValue.substring(0, MAX_STRING_PREVIEW_LENGTH) + '... [Truncated]';
      return { value: JSON.stringify(preview), truncated: true };
    }
    return { value: JSON.stringify(stringValue), truncated: false };
  }
};

export const truncateLines = (text: string, maxLines: number): string => {
  if (!text) return text;
  const lines = text.split('\n');
  if (lines.length <= maxLines) return text;
  return lines.slice(0, maxLines).join('\n') + `\n... truncated ${lines.length - maxLines} more lines ...`;
};

/**
 * Get SimpleIcon object for a given icon name
 * @param name - The icon name to look up
 * @returns SimpleIcon object or null if not found
 */
export function getSimpleIcon(name: string): SimpleIcon | null {
  if (!name || name === "default") return null;

  const formatted = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  const iconKey = `si${formatted}`;
  try {
    // @ts-ignore - The type definitions don't properly handle string indexing
    let icon = simpleIcons[iconKey];
    return icon || null;
  } catch (e) {
    return null;
  }
}

/**
 * Build evolving payload by merging step results
 */
export const buildEvolvingPayload = (initialPayload: any, steps: any[], stepResults: Record<string, any>, upToIndex: number) => {
  let evolvingPayload = { ...initialPayload };

  for (let i = 0; i <= upToIndex && i < steps.length; i++) {
    const step = steps[i];
    const result = stepResults[step.id];
    if (result !== undefined && result !== null) {
      const dataToMerge = (typeof result === 'object' && 'data' in result && 'success' in result)
        ? result.data
        : result;

      evolvingPayload = {
        ...evolvingPayload,
        [`${step.id}`]: dataToMerge
      };
    }
  }

  return evolvingPayload;
};

const PRETTIER_PLUGINS = [
  (prettierPluginBabel as any).default ?? (prettierPluginBabel as any),
  (prettierPluginEstree as any).default ?? (prettierPluginEstree as any),
];

export async function formatJavaScriptCode(code: string): Promise<string> {
  if (!code || typeof code !== 'string') return code;
  try {
    const formatted = await prettier.format(code, {
      parser: 'babel',
      plugins: PRETTIER_PLUGINS,
      semi: true,
      singleQuote: true,
      trailingComma: 'es5',
      tabWidth: 2,
      printWidth: 100,
      arrowParens: 'always'
    });
    return formatted.trimEnd();
  } catch (error) {
    console.debug('Code formatting failed:', error);
    return code;
  }
}
