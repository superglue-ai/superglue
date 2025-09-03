/**
 * Resilient JSON parser with class-based architecture
 * Handles various malformed JSON formats including triple quotes, unescaped content, etc.
 */

export interface ParseOptions {
  /** Whether to attempt automatic fixing of common JSON issues */
  attemptRepair?: boolean;
  /** Maximum depth for recursive parsing (prevents infinite loops) */
  maxDepth?: number;
  /** Whether to preserve original string format for values that fail to parse */
  preserveStringsOnFailure?: boolean;
  /** Custom repair strategies to apply */
  customStrategies?: RepairStrategy[];
  /** Whether to log repairs for debugging */
  logRepairs?: boolean;
}

export interface ParseResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  repairs?: string[];
  metadata?: {
    parseTime?: number;
    strategiesApplied?: string[];
    depth?: number;
  };
}

/**
 * Abstract base class for repair strategies
 */
export abstract class RepairStrategy {
  abstract name: string;
  abstract description: string;

  /**
   * Test if this strategy should be applied
   */
  abstract canApply(input: string): boolean;

  /**
   * Apply the repair strategy
   */
  abstract apply(input: string): string;

  /**
   * Optional validation after repair
   */
  validate?(repaired: string): boolean {
    try {
      JSON.parse(repaired);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Strategy to handle Python-style triple quotes
 */
class TripleQuoteStrategy extends RepairStrategy {
  name = 'TripleQuoteRepair';
  description = 'Converts triple-quoted strings to proper JSON, parsing nested JSON content';

  canApply(input: string): boolean {
    return /"""/.test(input);
  }

  apply(input: string): string {
    // Match triple quotes and capture content
    return input.replace(/"""([\s\S]*?)"""/g, (match, content) => {
      // Try to parse the content as JSON
      const trimmed = content.trim();

      // Check if it looks like JSON (starts with { or [)
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try {
          // Parse and re-stringify to ensure valid JSON
          const parsed = JSON.parse(trimmed);
          // Return as a properly formatted JSON value
          return JSON.stringify(parsed);
        } catch {
          // If parsing fails, treat as string but clean it up
          // Remove internal quotes that would break JSON
          const cleaned = content
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\t/g, '\\t');
          return `"${cleaned}"`;
        }
      }

      // For non-JSON content, escape as string
      const escaped = content
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
      return `"${escaped}"`;
    });
  }
}

/**
 * Strategy to handle Python literals (None, True, False)
 */
class PythonLiteralStrategy extends RepairStrategy {
  name = 'PythonLiteralRepair';
  description = 'Converts Python literals to JavaScript equivalents';

  canApply(input: string): boolean {
    return /\b(None|True|False)\b/.test(input);
  }

  apply(input: string): string {
    return input
      .replace(/\bNone\b/g, 'null')
      .replace(/\bTrue\b/g, 'true')
      .replace(/\bFalse\b/g, 'false');
  }
}

/**
 * Strategy to remove trailing commas
 */
class TrailingCommaStrategy extends RepairStrategy {
  name = 'TrailingCommaRepair';
  description = 'Removes trailing commas from objects and arrays';

  canApply(input: string): boolean {
    return /,\s*[}\]]/.test(input);
  }

  apply(input: string): string {
    return input.replace(/,(\s*[}\]])/g, '$1');
  }
}

/**
 * Strategy to handle single quotes
 */
class SingleQuoteStrategy extends RepairStrategy {
  name = 'SingleQuoteRepair';
  description = 'Converts single quotes to double quotes';

  canApply(input: string): boolean {
    // More sophisticated check to avoid replacing apostrophes
    return /[{,]\s*'[^']*'\s*:/.test(input) || /:\s*'[^']*'/.test(input);
  }

  apply(input: string): string {
    // Replace single quotes around keys
    let result = input.replace(/([{,]\s*)'([^']+)'(\s*:)/g, '$1"$2"$3');
    // Replace single quotes around values
    result = result.replace(/(:\s*)'([^']+)'(\s*[,}])/g, '$1"$2"$3');
    return result;
  }
}

/**
 * Strategy to handle unquoted keys
 */
class UnquotedKeyStrategy extends RepairStrategy {
  name = 'UnquotedKeyRepair';
  description = 'Adds quotes to unquoted object keys';

  canApply(input: string): boolean {
    return /[{,]\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*:/.test(input);
  }

  apply(input: string): string {
    return input.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)(\s*:)/g, '$1"$2"$3');
  }
}

/**
 * Strategy to handle comments (removes them)
 */
class CommentStrategy extends RepairStrategy {
  name = 'CommentRemoval';
  description = 'Removes JavaScript-style comments';

  canApply(input: string): boolean {
    return /\/\/.*$|\/\*[\s\S]*?\*\//m.test(input);
  }

  apply(input: string): string {
    // Remove single-line comments
    let result = input.replace(/\/\/.*$/gm, '');
    // Remove multi-line comments
    result = result.replace(/\/\*[\s\S]*?\*\//g, '');
    return result;
  }
}

/**
 * Strategy to escape unescaped control characters in JSON strings
 */
class UnescapedControlCharactersStrategy extends RepairStrategy {
  name = 'UnescapedControlCharactersRepair';
  description = 'Escapes unescaped control characters (newlines, tabs, etc.) in JSON strings';

  canApply(input: string): boolean {
    // Check if there are control characters that aren't properly escaped
    try {
      JSON.parse(input);
      return false; // If it parses, no need for this strategy
    } catch (e) {
      // Check if error mentions control characters
      const errorMsg = e.message || '';
      return errorMsg.includes('control character') ||
        errorMsg.includes('Bad control') ||
        errorMsg.includes('Unexpected token') && /[\n\r\t]/.test(input);
    }
  }

  apply(input: string): string {
    let result = '';
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < input.length; i++) {
      const char = input[i];
      const prevChar = i > 0 ? input[i - 1] : '';

      if (escapeNext) {
        result += char;
        escapeNext = false;
        continue;
      }

      if (char === '\\' && inString) {
        result += char;
        escapeNext = true;
        continue;
      }

      if (char === '"' && prevChar !== '\\') {
        inString = !inString;
        result += char;
        continue;
      }

      if (inString) {
        // We're inside a string - escape control characters
        switch (char) {
          case '\n':
            result += '\\n';
            break;
          case '\r':
            result += '\\r';
            break;
          case '\t':
            result += '\\t';
            break;
          case '\b':
            result += '\\b';
            break;
          case '\f':
            result += '\\f';
            break;
          default:
            // Check for other control characters
            const charCode = char.charCodeAt(0);
            if (charCode < 0x20) {
              // Escape other control characters as Unicode
              result += '\\u' + ('0000' + charCode.toString(16)).slice(-4);
            } else {
              result += char;
            }
        }
      } else {
        // Outside strings, keep as-is
        result += char;
      }
    }

    return result;
  }
}

/**
 * Strategy to handle trailing non-JSON characters after valid JSON
 */
class TrailingCharactersStrategy extends RepairStrategy {
  name = 'TrailingCharactersRepair';
  description = 'Removes trailing characters after valid JSON structure';

  canApply(input: string): boolean {
    const trimmed = input.trim();
    // Check if there's content after what looks like a complete JSON structure
    // We need to properly match balanced braces/brackets with trailing content

    // Quick check: does it start with { or [ and have extra content after apparent end?
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      return false;
    }

    // Try to find where the JSON structure ends
    let braceCount = 0;
    let bracketCount = 0;
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < trimmed.length; i++) {
      const char = trimmed[i];

      if (!inString) {
        if (char === '"') {
          inString = true;
        } else if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0 && bracketCount === 0 && i > 0 && i < trimmed.length - 1) {
            // Found complete JSON with trailing content
            return true;
          }
        } else if (char === '[') {
          bracketCount++;
        } else if (char === ']') {
          bracketCount--;
          if (bracketCount === 0 && braceCount === 0 && i > 0 && i < trimmed.length - 1) {
            // Found complete JSON with trailing content
            return true;
          }
        }
      } else {
        if (escapeNext) {
          escapeNext = false;
        } else if (char === '\\') {
          escapeNext = true;
        } else if (char === '"') {
          inString = false;
        }
      }
    }

    return false;
  }

  apply(input: string): string {
    const trimmed = input.trim();

    // Try to find the end of a valid JSON structure
    let braceCount = 0;
    let bracketCount = 0;
    let inString = false;
    let escapeNext = false;
    let jsonEndIndex = -1;

    for (let i = 0; i < trimmed.length; i++) {
      const char = trimmed[i];

      if (!inString) {
        if (char === '"') {
          inString = true;
        } else if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0 && bracketCount === 0 && i > 0) {
            jsonEndIndex = i;
            break;
          }
        } else if (char === '[') {
          bracketCount++;
        } else if (char === ']') {
          bracketCount--;
          if (bracketCount === 0 && braceCount === 0 && i > 0) {
            jsonEndIndex = i;
            break;
          }
        }
      } else {
        if (escapeNext) {
          escapeNext = false;
        } else if (char === '\\') {
          escapeNext = true;
        } else if (char === '"') {
          inString = false;
        }
      }
    }

    if (jsonEndIndex > 0 && jsonEndIndex < trimmed.length - 1) {
      // Found the end of JSON structure with trailing content
      return trimmed.substring(0, jsonEndIndex + 1);
    }

    return input;
  }
}

/**
 * Main JSON parser class
 */
export class ResilientJsonParser {
  private strategies: RepairStrategy[] = [];
  private options: ParseOptions;
  private repairLog: string[] = [];

  constructor(options: ParseOptions = {}) {
    this.options = {
      attemptRepair: true,
      maxDepth: 10,
      preserveStringsOnFailure: false,
      logRepairs: false,
      ...options
    };

    // Initialize default strategies
    this.initializeDefaultStrategies();

    // Add custom strategies if provided
    if (options.customStrategies) {
      this.strategies.push(...options.customStrategies);
    }
  }

  private initializeDefaultStrategies(): void {
    this.strategies = [
      new TripleQuoteStrategy(),
      new SingleQuoteStrategy(),  // Convert quotes first so control char fix works
      new UnescapedControlCharactersStrategy(),  // Now can fix control chars in all strings
      new TrailingCharactersStrategy(),  // Apply early to clean up trailing content
      new PythonLiteralStrategy(),
      new TrailingCommaStrategy(),
      new UnquotedKeyStrategy(),
      new CommentStrategy(),
    ];
  }

  /**
   * Parse JSON with resilience
   */
  parse<T = any>(input: string | Buffer): ParseResult<T> {
    const startTime = Date.now();
    this.repairLog = [];

    const jsonString = input instanceof Buffer ? input.toString('utf8') : String(input);

    // Try standard parsing first
    try {
      const data = JSON.parse(jsonString);
      return {
        success: true,
        data,
        metadata: {
          parseTime: Date.now() - startTime,
          strategiesApplied: []
        }
      };
    } catch (initialError) {
      // Continue with repair strategies
      if (!this.options.attemptRepair) {
        return {
          success: false,
          error: `JSON parse error: ${initialError}`,
          metadata: {
            parseTime: Date.now() - startTime
          }
        };
      }
    }

    // Apply repair strategies
    let repaired = jsonString;
    const appliedStrategies: string[] = [];

    for (const strategy of this.strategies) {
      if (strategy.canApply(repaired)) {
        const before = repaired;
        repaired = strategy.apply(repaired);

        if (before !== repaired) {
          appliedStrategies.push(strategy.name);
          this.repairLog.push(strategy.description);

          if (this.options.logRepairs) {
            console.log(`Applied ${strategy.name}: ${strategy.description}`);
          }

          // Try parsing after each repair
          try {
            const data = JSON.parse(repaired);
            return {
              success: true,
              data,
              repairs: this.repairLog,
              metadata: {
                parseTime: Date.now() - startTime,
                strategiesApplied: appliedStrategies
              }
            };
          } catch {
            // Continue with more repairs
          }
        }
      }
    }

    // Final parsing attempt
    try {
      const data = JSON.parse(repaired);
      return {
        success: true,
        data,
        repairs: this.repairLog,
        metadata: {
          parseTime: Date.now() - startTime,
          strategiesApplied: appliedStrategies
        }
      };
    } catch (finalError) {
      // Try aggressive fallback
      const fallbackResult = this.aggressiveFallback(repaired);
      if (fallbackResult.success) {
        return {
          ...fallbackResult,
          repairs: [...this.repairLog, 'Applied aggressive fallback'],
          metadata: {
            parseTime: Date.now() - startTime,
            strategiesApplied: [...appliedStrategies, 'AggressiveFallback']
          }
        };
      }

      return {
        success: false,
        error: `Failed to parse JSON after applying ${appliedStrategies.length} strategies: ${finalError}`,
        repairs: this.repairLog,
        metadata: {
          parseTime: Date.now() - startTime,
          strategiesApplied: appliedStrategies
        }
      };
    }
  }

  /**
   * Aggressive fallback for severely malformed JSON
   */
  private aggressiveFallback(input: string): ParseResult {
    try {
      // First, try to find JSON-like structures more precisely
      // Look for JSON starting patterns
      const objectStart = input.indexOf('{');
      const arrayStart = input.indexOf('[');

      if (objectStart === -1 && arrayStart === -1) {
        return { success: false, error: 'No JSON-like structure found' };
      }

      // Start from the first JSON-like character
      const startIdx = objectStart === -1 ? arrayStart :
        arrayStart === -1 ? objectStart :
          Math.min(objectStart, arrayStart);

      let extracted = input.substring(startIdx);

      // Apply all strategies to clean it up
      for (const strategy of this.strategies) {
        if (strategy.canApply(extracted)) {
          extracted = strategy.apply(extracted);
        }
      }

      // Try to parse
      const data = JSON.parse(extracted);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: `Aggressive fallback failed: ${error}` };
    }
  }

  /**
   * Add a custom repair strategy
   */
  addStrategy(strategy: RepairStrategy): void {
    this.strategies.push(strategy);
  }

  /**
   * Remove a strategy by name
   */
  removeStrategy(name: string): void {
    this.strategies = this.strategies.filter(s => s.name !== name);
  }

  /**
   * Get list of available strategies
   */
  getStrategies(): string[] {
    return this.strategies.map(s => s.name);
  }
}

// Create a singleton instance for convenience
const defaultParser = new ResilientJsonParser();

/**
 * Convenience function for backwards compatibility
 */
export function parseJsonResilient<T = any>(
  input: string | Buffer,
  options?: ParseOptions
): ParseResult<T> {
  const parser = options ? new ResilientJsonParser(options) : defaultParser;
  return parser.parse<T>(input);
}

/**
 * Simple wrapper for backwards compatibility with existing parseJSON calls
 */
export function parseJSON(input: Buffer | string): any {
  const result = defaultParser.parse(input);

  if (result.success) {
    if (result.repairs && result.repairs.length > 0) {
      console.log('JSON parsed with repairs:', result.repairs);
    }
    return result.data;
  } else {
    throw new Error(`Failed to parse JSON: ${result.error}`);
  }
}

/**
 * Validates JSON without parsing it fully
 */
export function isValidJson(jsonString: string): boolean {
  try {
    JSON.parse(jsonString);
    return true;
  } catch {
    return false;
  }
}

/**
 * Pretty prints JSON with proper formatting
 */
export function prettyPrintJson(data: any, indent: number = 2): string {
  return JSON.stringify(data, null, indent);
}

/**
 * Minifies JSON by removing unnecessary whitespace
 */
export function minifyJson(jsonString: string): string {
  const parser = new ResilientJsonParser();
  const result = parser.parse(jsonString);

  if (result.success) {
    return JSON.stringify(result.data);
  }

  throw new Error('Cannot minify invalid JSON');
}

// Export strategy classes for extension
export {
  CommentStrategy, PythonLiteralStrategy, SingleQuoteStrategy, TrailingCommaStrategy, TripleQuoteStrategy, UnquotedKeyStrategy
};

