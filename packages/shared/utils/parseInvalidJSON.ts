interface ParseResult {
  success: boolean;
  data?: any;
  error?: string;
  transformations?: string[];
  debugLogs?: string[];
}

interface ParseOptions {
  attemptRepair?: boolean;
  maxDepth?: number;
  strictMode?: boolean;
  logTransformations?: boolean;
  preserveStringTypes?: boolean; 
}

class RobustJsonParser {
  private transformations: string[] = [];
  private debugLogs: string[] = [];

  parse(input: any, options: ParseOptions = {}): ParseResult {
    const {
      maxDepth = 10,
      logTransformations = true,
      preserveStringTypes = false
    } = options;

    this.transformations = [];
    this.debugLogs = [];

  
    let jsonStr = String(input || '');
    this.addDebugLog(`Initial input: ${JSON.stringify(jsonStr.substring(0, 100))}...`);
    
    // Remove BOM if present
    if (jsonStr.charCodeAt(0) === 0xFEFF) {
      jsonStr = jsonStr.slice(1);
      this.addTransformation('removeBOM');
      this.addDebugLog('Removed BOM');
    }
    
    jsonStr = jsonStr.trim();
    this.addDebugLog(`Trimmed input: ${JSON.stringify(jsonStr.substring(0, 100))}...`);
    
    if (!jsonStr) {
      this.addDebugLog('Empty input after trimming');
      return { 
        success: false, 
        error: 'Empty input', 
        transformations: logTransformations ? this.transformations : undefined,
        debugLogs: this.debugLogs
      };
    }

    if (typeof input === 'object' && input !== null) {
      this.addDebugLog('Input is already an object');
      return { 
        success: true, 
        data: input, 
        transformations: logTransformations ? this.transformations : undefined,
        debugLogs: this.debugLogs
      };
    }
    

    let currentStr = jsonStr;
    let lastStr = '';
    let depth = 0;

    while (currentStr !== lastStr && depth < maxDepth) {
      lastStr = currentStr;
      let transformedInThisPass = false;
      this.addDebugLog(`Pass ${depth}: currentStr = ${JSON.stringify(currentStr.substring(0, 100))}...`);
      
      // 1. handle stringified JSON unwrapping FIRST (crucial for double/triple encoded)
      const unwrapped = this.unwrapStringifiedJson(currentStr);
      if (unwrapped.result !== currentStr) {
        this.addDebugLog('Unwrapped stringified JSON');
        currentStr = unwrapped.result;
        transformedInThisPass = true;
        if (unwrapped.wasStringified) {
          this.addTransformation('parseStringifiedJson');
        }
      }
      
      // 2. Encoding Problems (Base64, multiple stringifications)
      const afterEncoding = this.handleEncodingProblems(currentStr);
      if (afterEncoding !== currentStr) {
        this.addDebugLog('Handled encoding problems');
        currentStr = afterEncoding;
        transformedInThisPass = true;
      }
      
      // 3. Character Issues (BOM, unicode escapes, quotes, trailing commas)
      const afterCharIssues = this.handleCharacterIssues(currentStr);
      if (afterCharIssues !== currentStr) {
        this.addDebugLog('Handled character issues');
        currentStr = afterCharIssues;
        transformedInThisPass = true;
      }
      
      // 4. Format Variations (JSONL/NDJSON, JSON5 comments)
      const afterFormatVariations = this.handleFormatVariations(currentStr);
      if (afterFormatVariations !== currentStr) {
        this.addDebugLog('Handled format variations');
        currentStr = afterFormatVariations;
        transformedInThisPass = true;
      }
      
      depth++;
    }

    let parseResult = this.tryParseJson(currentStr);
    this.addDebugLog(`Final parse attempt: ${parseResult.success ? 'success' : 'failure'}${parseResult.success ? '' : ' - ' + parseResult.error}`);

    if (parseResult.success) {
      parseResult.data = this.deepFixStructuralIssues(parseResult.data, { preserveStringTypes });
      this.addDebugLog('Final parse succeeded, applied deep structural fixes');
      return {
        ...parseResult,
        transformations: logTransformations ? this.transformations : undefined,
        debugLogs: this.debugLogs
      };
    }
    
    // fallback: try removing trailing commas and retry (if not already done)
    if (currentStr === jsonStr) { 
      const cleanedStr = this.removeTrailingCommas(currentStr);
      if (cleanedStr !== currentStr) {
        this.addDebugLog('Attempting fallback: remove trailing commas');
        parseResult = this.tryParseJson(cleanedStr);
        if (parseResult.success) {
          this.addTransformation('removeTrailingCommas');
          parseResult.data = this.deepFixStructuralIssues(parseResult.data, { preserveStringTypes });
          this.addDebugLog('Fallback parse after removing trailing commas succeeded');
          return {
            ...parseResult,
            transformations: logTransformations ? this.transformations : undefined,
            debugLogs: this.debugLogs
          };
        }
      }
    }
    
    // fallback: aggressively treat any valid parse (object or array) as success
    try {
      const obj = JSON.parse(currentStr);
      this.addDebugLog('Aggressive fallback: JSON.parse succeeded');
      const fixed = this.deepFixStructuralIssues(obj, { preserveStringTypes });
      if (fixed && (typeof fixed === 'object')) {
        this.addDebugLog('Aggressive fallback: fixed is object or array, returning success');
        return {
          success: true,
          data: fixed,
          transformations: logTransformations ? this.transformations : undefined,
          debugLogs: this.debugLogs
        };
      }
    } catch (e) {
      this.addDebugLog('Aggressive fallback: JSON.parse failed');
    }

    this.addDebugLog('All parse attempts failed, returning error');
    return {
      ...parseResult,
      transformations: logTransformations ? this.transformations : undefined,
      debugLogs: this.debugLogs
    };
  }

  private addDebugLog(msg: string): void {
    this.debugLogs.push(msg);
  }
  
  private tryParseJson(input: string): ParseResult {
    try {
      const data = JSON.parse(input);
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  private unwrapStringifiedJson(input: string): { result: string; wasStringified: boolean } {
    let current = input.trim();
    let unwrapCount = 0;
    let wasStringified = false;

    while (unwrapCount < 10) {
      const trimmed = current.trim();
      
      // check if we have a quoted string that might contain JSON
      if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || 
          (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        const inner = trimmed.slice(1, -1);
        try {
          const parsed = JSON.parse(inner);
          if (typeof parsed === 'string' && this.isValidJsonString(parsed)) {
            current = parsed;
            unwrapCount++;
            wasStringified = true;
            this.addTransformation('parseStringifiedJson');
            continue;
          }

          current = inner;
          wasStringified = true;
          this.addTransformation('stripOuterQuotes');
          break;
        } catch {
          break;
        }
      }
      
      try {
        const parsed = JSON.parse(current);
        if (typeof parsed === 'string' && this.isValidJsonString(parsed)) {
          current = parsed;
          unwrapCount++;
          wasStringified = true;
          this.addTransformation('parseStringifiedJson');
          continue;
        }
        break;
      } catch {
        break;
      }
    }

    return { result: current, wasStringified };
  }

  private handleEncodingProblems(input: string): string {
    let result = input;
    
    if (this.isBase64(result)) {
      try {
        const decoded = atob(result);
        const parseResult = this.tryParseJson(decoded);
        if (parseResult.success) {
          result = decoded;
          this.addTransformation('parseBase64Json');
        }
      } catch (e) {
      }
    }
    
    return result;
  }

  private handleCharacterIssues(input: string): string {
    let result = input;
    
    // remove BOM (additional check)
    if (result.charCodeAt(0) === 0xFEFF) {
      result = result.slice(1);
      this.addTransformation('removeBOM');
    }

    // handle escaped unicode sequences
    const originalResult = result;
    result = result.replace(/\\u([0-9a-fA-F]{4})/g, (match, hex) => {
      return String.fromCharCode(parseInt(hex, 16));
    });
    if (result !== originalResult) {
      this.addTransformation('unescapedUnicode');
    }

    // Normalize quotes and fix escaping
    result = this.normalizeQuotes(result);
    
    if (result.length < 20000) { 
      result = this.removeTrailingCommas(result);
    }
    
    return result;
  }

  private handleFormatVariations(input: string): string {
    let result = input.trim();

    // handle JSONL/NDJSON
    if (result.includes('\n') && !result.startsWith('[')) {
      const lines = result.split('\n').filter(line => line.trim());
      if (lines.length > 1) {
        try {
          const objects = [];
          let hasValidLines = false;

          for (const line of lines) {
            const parseResult = this.tryParseJson(line.trim());
            if (parseResult.success) {
              objects.push(parseResult.data);
              hasValidLines = true;
            }
          }

          if (hasValidLines && objects.length > 0) {
            this.addTransformation('parseJsonLines');
            result = JSON.stringify(objects);
          }
        } catch (e) {
        }
      }
    }

    // JSON5-like features
    result = this.removeComments(result);
    
    return result;
  }

  private deepFixStructuralIssues(
    obj: any,
    opts: { preserveStringTypes?: boolean } = {}
  ): any {
    
    // primitive stringified JSON
    if (typeof obj === 'string') {
      let str = obj.trim();

      // remove trailing commas before parsing stringified JSON
      str = this.removeTrailingCommas(str);

      if (this.isValidJsonString(str)) {
        const parseResult = this.tryParseJson(str);
        if (parseResult.success) {
          this.addTransformation('parseStringifiedJson');
          return this.deepFixStructuralIssues(parseResult.data, opts);
        }
      }

      if (!opts.preserveStringTypes) {
        if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(str)) {
          const num = parseFloat(str);
          if (!isNaN(num)) {
            this.addTransformation('stringifiedNumberConversion');
            return num;
          }
        }
        if (str.toLowerCase() === 'true' || str.toLowerCase() === 'false') {
          const bool = str.toLowerCase() === 'true';
          this.addTransformation('stringifiedBooleanConversion');
          return bool;
        }
      } 
      return str;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.deepFixStructuralIssues(item, opts));
    }

    if (obj && typeof obj === 'object') {
      const result: any = {};
      const keys = Object.keys(obj);
      const numericKeys = keys.filter(key => /^\d+$/.test(key)).sort((a, b) => parseInt(a) - parseInt(b));
      const isSequential = numericKeys.length === keys.length &&
        numericKeys.every((key, index) => parseInt(key) === index);

      // --convert object with numeric keys to array--
      if (isSequential) {
        this.addTransformation('objectToArrayConversion');
        return numericKeys.map(key => this.deepFixStructuralIssues(obj[key], opts));
      }

      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
          let valStr = value.trim();
          valStr = this.removeTrailingCommas(valStr);
          
          if (this.isValidJsonString(valStr)) {
            // recursively unwrap stringified JSON until it's no longer valid JSON string
            let parsedVal: any = valStr;
            let transformationCount = 0;
            while (this.isValidJsonString(parsedVal)) {
              const parseResult = this.tryParseJson(parsedVal);
              if (parseResult.success) {
                this.addTransformation('parseStringifiedJson');
                parsedVal = parseResult.data;
                transformationCount++;
              } else {
                break;
              }
            }
            
            if (transformationCount > 0) {
              result[key] = this.deepFixStructuralIssues(parsedVal, opts);
              continue;
            }
          }
          
          // for timestamp/date/time keys, preserve string type
          if (/timestamp|date|time/i.test(key)) {
            result[key] = valStr;
            continue;
          }

          if (!opts.preserveStringTypes) {
            if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(valStr) ||
                valStr.toLowerCase() === 'true' || valStr.toLowerCase() === 'false') {
              result[key] = valStr; 
              continue; 
            }
          }

          if (!opts.preserveStringTypes) {
            if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(valStr)) {
              const num = parseFloat(valStr);
              if (!isNaN(num)) {
                this.addTransformation('stringifiedNumberConversion');
                result[key] = num;
                continue;
              }
            }
            if (valStr.toLowerCase() === 'true' || valStr.toLowerCase() === 'false') {
              const bool = valStr.toLowerCase() === 'true';
              this.addTransformation('stringifiedBooleanConversion');
              result[key] = bool;
              continue;
            }
          }
          result[key] = valStr;
        } else {
          result[key] = this.deepFixStructuralIssues(value, opts);
        }
      }
      return result;
    }


    return obj;
  }

  private isBase64(str: string): boolean {
    if (str.length === 0 || str.length % 4 !== 0) {
      return false;
    }

    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(str)) {
      return false;
    }

    try {
      const decoded = atob(str);
      const trimmed = decoded.trim();
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        return btoa(decoded) === str;
      }
      return false;
    } catch {
      return false;
    }
  }

  private normalizeQuotes(input: string): string {
    let result = input;
    let changed = false;

    // convert single quotes to double quotes for string values
    result = result.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (match, content) => {
      if (content.includes('{') || content.includes('[')) {
        return match;
      }
      changed = true;
      return `"${content}"`;
    });

    // unquoted keys: {key: "value"} -> {"key": "value"}
    result = result.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, (match, prefix, key) => {
      changed = true;
      return `${prefix}"${key}":`;
    });

    // fix escaped single quotes in double-quoted strings
    result = result.replace(/\\'/g, "'");

    if (changed) {
      this.addTransformation('normalizeQuotes');
    }

    return result;
  }

  private removeTrailingCommas(input: string): string {
    let result = input;
    let changed = false;

    // remove trailing commas before closing braces/brackets
    const trailingCommaRegex = /,(\s*[}\]])/g;
    if (trailingCommaRegex.test(result)) {
      result = result.replace(trailingCommaRegex, '$1');
      changed = true;
    }

    if (changed) {
      this.addTransformation('removeTrailingCommas');
    }

    return result;
  }

  private removeComments(input: string): string {
    let result = input;
    let changed = false;

    // remove single-line comments
    const singleLineRegex = /\/\/.*$/gm;
    if (singleLineRegex.test(result)) {
      result = result.replace(singleLineRegex, '');
      changed = true;
    }

    // remove multi-line comments
    const multiLineRegex = /\/\*[\s\S]*?\*\//g;
    if (multiLineRegex.test(result)) {
      result = result.replace(multiLineRegex, '');
      changed = true;
    }

    if (changed) {
      this.addTransformation('removeComments');
    }

    return result.trim();
  }

  private addTransformation(transformationName: string): void {
    if (!this.transformations.includes(transformationName)) {
      this.transformations.push(transformationName);
    }
  }

  private isValidJsonString(str: string): boolean {
    if (typeof str !== 'string') return false;
    const trimmed = str.trim();
    return (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
           (trimmed.startsWith('[') && trimmed.endsWith(']'));
  }
}

// function for one-off parsing
export function parseRobustJson(input: any, options?: ParseOptions): ParseResult {
  const parser = new RobustJsonParser();
  return parser.parse(input, options);
}

// ---Use for API response parsing---
export function parseApiResponse(response: any): ParseResult {
  const parser = new RobustJsonParser();
  const result = parser.parse(response, {
    attemptRepair: true,
    maxDepth: 15,
    logTransformations: true,
    preserveStringTypes: true
  });

  return result;
}

export { RobustJsonParser, type ParseResult, type ParseOptions };