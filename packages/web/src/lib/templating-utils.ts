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

export async function executeTemplateCode(code: string, data: any): Promise<any> {
  try {
    return executeWithVMHelpers(code, data);
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
  if (VALID_IDENTIFIER.test(trimmed)) {
    return `(sourceData) => sourceData.${trimmed}`;
  }
  return `(sourceData) => sourceData["${escapeForBracket(trimmed)}"]`;
}

export async function evaluateTemplate(
  expr: string,
  sourceData: any
): Promise<EvaluationResult> {
  try {
    const normalizedExpr = normalizeTemplateExpression(expr);
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

export function prepareSourceData(stepData: any, dataSelectorOutput?: any): any {
  const base = { ...(stepData || {}) };
  
  if (dataSelectorOutput !== undefined) {
    base.currentItem = Array.isArray(dataSelectorOutput) ? dataSelectorOutput[0] : dataSelectorOutput;
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

export function deriveCurrentItem(dataSelectorOutput: unknown): Record<string, unknown> | null {
  if (dataSelectorOutput && typeof dataSelectorOutput === 'object' && !Array.isArray(dataSelectorOutput)) {
    return dataSelectorOutput as Record<string, unknown>;
  }
  if (Array.isArray(dataSelectorOutput) && dataSelectorOutput.length > 0) {
    return dataSelectorOutput[0] as Record<string, unknown>;
  }
  return null;
}
interface TiptapJSONContent {
  type?: string;
  attrs?: Record<string, any>;
  content?: TiptapJSONContent[];
  text?: string;
}

export function templateStringToTiptap(value: string): TiptapJSONContent {
  if (!value) {
    return { type: 'doc', content: [{ type: 'paragraph' }] };
  }

  const parts = parseTemplateString(value);
  const paragraphs: TiptapJSONContent[] = [];
  let currentParagraph: TiptapJSONContent[] = [];

  for (const part of parts) {
    if (part.type === 'text') {
      const textLines = part.value.split('\n');
      for (let i = 0; i < textLines.length; i++) {
        if (textLines[i]) {
          currentParagraph.push({ type: 'text', text: textLines[i] });
        }
        if (i < textLines.length - 1) {
          paragraphs.push({
            type: 'paragraph',
            content: currentParagraph.length > 0 ? currentParagraph : undefined,
          });
          currentParagraph = [];
        }
      }
    } else if (part.type === 'template') {
      currentParagraph.push({
        type: 'template',
        attrs: { rawTemplate: part.rawTemplate },
      });
    }
  }

  paragraphs.push({
    type: 'paragraph',
    content: currentParagraph.length > 0 ? currentParagraph : undefined,
  });

  return { type: 'doc', content: paragraphs };
}

export function tiptapToTemplateString(json: TiptapJSONContent): string {
  if (!json?.content) return '';

  const lines: string[] = [];
  for (const paragraph of json.content) {
    if (paragraph.type === 'paragraph') {
      let line = '';
      if (paragraph.content) {
        for (const node of paragraph.content) {
          if (node.type === 'text') line += node.text || '';
          else if (node.type === 'template') line += node.attrs?.rawTemplate || '';
          else if (node.type === 'hardBreak') line += '\n';
        }
      }
      lines.push(line);
    }
  }
  return lines.join('\n');
}

