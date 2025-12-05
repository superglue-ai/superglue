import { executeWithVMHelpers, isArrowFunction } from '@superglue/shared';

export const DEFAULT_CODE_TEMPLATE = '(sourceData) => { return {} }';
const CREDENTIAL_PATTERN = /^[a-zA-Z_$][a-zA-Z0-9_$]*_[a-zA-Z0-9_$]+$/;

export interface TemplatePart {
  type: 'text' | 'template';
  value: string;
  start: number;
  end: number;
  rawTemplate?: string;
}

export interface EvaluationResult {
  success: boolean;
  value?: any;
  error?: string;
}

export interface TruncatedValue {
  display: string;
  truncated: boolean;
  originalSize: number;
}

export function parseTemplateString(input: string): TemplatePart[] {
  const parts: TemplatePart[] = [];
  const pattern = /<<([\s\S]*?)>>/g;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(input)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        value: input.slice(lastIndex, match.index),
        start: lastIndex,
        end: match.index
      });
    }

    parts.push({
      type: 'template',
      value: match[1].trim(),
      start: match.index,
      end: match.index + match[0].length,
      rawTemplate: match[0]
    });

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < input.length) {
    parts.push({
      type: 'text',
      value: input.slice(lastIndex),
      start: lastIndex,
      end: input.length
    });
  }

  return parts;
}

const EXECUTION_TIMEOUT_MS = 30000; // 30 seconds

function sanitizeEvaluationResult(value: any): any {
  if (typeof value === 'function') return '[Function]';
  if (typeof value === 'symbol') return '[Symbol]';
  if (typeof value === 'bigint') return value.toString();
  
  try {
    JSON.stringify(value);
    return value;
  } catch {
    return '[Non-serializable Object]';
  }
}

async function executeWithTimeout(code: string, data: any, timeoutMs: number): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('Execution timeout: template took too long to evaluate'));
    }, timeoutMs);
    
    try {
      const result = executeWithVMHelpers(code, data);
      clearTimeout(timeoutId);
      resolve(result);
    } catch (error) {
      clearTimeout(timeoutId);
      reject(error);
    }
  });
}

export async function executeTemplateCode(code: string, data: any): Promise<any> {
  try {
    return await executeWithTimeout(code, data, EXECUTION_TIMEOUT_MS);
  } catch (error) {
    throw new Error(`Code execution failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const VALID_IDENTIFIER = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

function escapeForBracket(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function buildAccessor(segments: string[]): string {
  return segments.map(seg => 
    VALID_IDENTIFIER.test(seg) ? `.${seg}` : `["${escapeForBracket(seg)}"]`
  ).join('');
}

export function normalizeTemplateExpression(expr: string): string {
  const trimmed = expr.trim();
  if (!trimmed) {
    throw new Error('Empty template expression');
  }
  if (isArrowFunction(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith('sourceData.') || trimmed.startsWith('sourceData[') || trimmed === 'sourceData') {
    return `(sourceData) => ${trimmed}`;
  }
  if (trimmed.includes('[') && /^[a-zA-Z_$]/.test(trimmed)) {
    return `(sourceData) => sourceData.${trimmed}`;
  }
  if (trimmed.includes('.') && !trimmed.includes(' ')) {
    const segments = trimmed.split('.');
    const accessor = buildAccessor(segments);
    return `(sourceData) => sourceData${accessor}`;
  }
  // Single segment - use dot notation if valid identifier, bracket notation otherwise
  if (VALID_IDENTIFIER.test(trimmed)) {
    return `(sourceData) => sourceData.${trimmed}`;
  }
  return `(sourceData) => sourceData["${escapeForBracket(trimmed)}"]`;
}

function detectDangerousPatterns(code: string): void {
  if (/while\s*\(\s*true\s*\)/.test(code)) throw new Error('Dangerous pattern: while(true) may cause infinite loop');
  if (/while\s*\(\s*1\s*\)/.test(code)) throw new Error('Dangerous pattern: while(1) may cause infinite loop');
  if (/while\s*\(\s*!\s*false\s*\)/.test(code)) throw new Error('Dangerous pattern: while(!false) may cause infinite loop');
  if (/for\s*\(\s*;\s*;\s*\)/.test(code)) throw new Error('Dangerous pattern: for(;;) may cause infinite loop');
  if (/for\s*\(\s*;;\s*\)/.test(code)) throw new Error('Dangerous pattern: for(;;) may cause infinite loop');
}

export async function evaluateTemplate(
  expr: string,
  sourceData: any
): Promise<EvaluationResult> {
  try {
    const normalizedExpr = normalizeTemplateExpression(expr);
    detectDangerousPatterns(normalizedExpr);
    const result = await executeTemplateCode(normalizedExpr, sourceData);
    const sanitized = sanitizeEvaluationResult(result);
    return { success: true, value: sanitized };
  } catch (error) {
    return {
      success: false,
      value: undefined,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export function truncateTemplateValue(value: any, maxLength: number = 200): TruncatedValue {
  let stringValue: string;
  
  if (value === undefined) {
    stringValue = 'undefined';
  } else if (value === null) {
    stringValue = 'null';
  } else if (typeof value === 'string') {
    stringValue = value;
  } else if (typeof value === 'object') {
    try {
      stringValue = JSON.stringify(value);
    } catch {
      stringValue = '[Complex Object]';
    }
  } else {
    stringValue = String(value);
  }

  const originalSize = stringValue.length;

  if (stringValue.length <= maxLength) {
    return {
      display: stringValue,
      truncated: false,
      originalSize
    };
  }

  return {
    display: stringValue.slice(0, maxLength) + '...',
    truncated: true,
    originalSize
  };
}

export function prepareSourceData(stepData: any, loopData?: any): any {
  const base = { ...(stepData || {}) };
  
  if (loopData !== undefined) {
    base.currentItem = Array.isArray(loopData) ? loopData[0] : loopData;
  }
  
  return base;
}

export function formatValueForDisplay(value: any): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '[Object]';
  }
}

export function extractCredentials(data: Record<string, unknown>): Record<string, string> {
  if (!data || typeof data !== 'object') return {};
  return Object.entries(data).reduce((acc, [key, value]) => {
    if (CREDENTIAL_PATTERN.test(key) && typeof value === 'string' && value.length > 0) {
      acc[key] = value;
    }
    return acc;
  }, {} as Record<string, string>);
}

export interface PaginationConfig {
  pageSize?: string;
  cursorPath?: string;
}

export interface CategorizedVariables {
  credentials: string[];
  toolInputs: string[];
  fileInputs: string[];
  currentStepData: string[];
  previousStepData: string[];
  paginationVariables: string[];
}

export interface CategorizedSources {
  manualPayload: Record<string, unknown>;
  filePayloads: Record<string, unknown>;
  previousStepResults: Record<string, unknown>;
  currentItem: Record<string, unknown> | null;
  paginationData: Record<string, unknown>;
}

export function buildPaginationData(config?: PaginationConfig): Record<string, unknown> {
  const pageSize = config?.pageSize || '50';
  return {
    page: 1,
    offset: 0,
    cursor: `[cursor from ${config?.cursorPath || 'response'} - evaluated at runtime]`,
    limit: pageSize,
    pageSize,
  };
}

export function buildCategorizedVariables(
  credentialKeys: string[],
  sources?: Partial<CategorizedSources>,
): CategorizedVariables {
  return {
    credentials: credentialKeys,
    toolInputs: Object.keys(sources?.manualPayload || {}),
    fileInputs: Object.keys(sources?.filePayloads || {}),
    currentStepData: ['currentItem'],
    previousStepData: Object.keys(sources?.previousStepResults || {}),
    paginationVariables: ['page', 'offset', 'cursor', 'limit', 'pageSize'],
  };
}

export function buildCategorizedSources(
  sources?: Partial<CategorizedSources>,
  currentItem?: Record<string, unknown> | null,
  paginationData?: Record<string, unknown>
): CategorizedSources {
  return {
    manualPayload: sources?.manualPayload || {},
    filePayloads: sources?.filePayloads || {},
    previousStepResults: sources?.previousStepResults || {},
    currentItem: currentItem || null,
    paginationData: paginationData || {},
  };
}

export function deriveCurrentItem(loopItems: unknown): Record<string, unknown> | null {
  if (loopItems && typeof loopItems === 'object' && !Array.isArray(loopItems)) {
    return loopItems as Record<string, unknown>;
  }
  if (Array.isArray(loopItems) && loopItems.length > 0) {
    return loopItems[0] as Record<string, unknown>;
  }
  return null;
}

