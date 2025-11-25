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

export function isSimpleVariableReference(expr: string): boolean {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(expr);
}

export function executeTemplateCode(code: string, data: any): any {
  try {
    const fn = new Function('sourceData', `return (${code})(sourceData)`);
    return fn(data);
  } catch (error) {
    throw new Error(`Code execution failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function evaluateTemplate(
  expr: string,
  stepData: any,
  loopData?: any
): Promise<EvaluationResult> {
  try {
    const sourceData = prepareSourceData(stepData, loopData);

    if (expr in sourceData && sourceData[expr] !== undefined) {
      return { success: true, value: sourceData[expr] };
    }

    const isArrowFunction = /^\s*\([^)]*\)\s*=>/.test(expr);
    
    if (isArrowFunction) {
      const result = executeTemplateCode(expr, sourceData);
      return { success: true, value: result };
    }

    return {
      success: false,
      value: undefined,
      error: `Variable '${expr}' not found in source data`
    };
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

export function getAvailableVariables(data: any): string[] {
  if (!data || typeof data !== 'object') {
    return [];
  }

  const keys = Object.keys(data);
  return keys.filter(key => {
    const value = data[key];
    return value !== undefined && typeof value !== 'function';
  });
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

