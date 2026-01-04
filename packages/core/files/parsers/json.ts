import { SupportedFileType } from "@superglue/shared";
import { DetectionPriority, FileParsingStrategy } from "../strategy.js";

export class JSONStrategy implements FileParsingStrategy {
  readonly fileType = SupportedFileType.JSON;
  readonly priority = DetectionPriority.STRUCTURED_TEXT;

  canHandle(buffer: Buffer): boolean {
    try {
      const sampleSize = Math.min(buffer.length, 4096);
      const sample = buffer.subarray(0, sampleSize).toString("utf8").trim();

      if (!sample.startsWith("{") && !sample.startsWith("[")) {
        return false;
      }

      const result = defaultParser.parse(buffer);
      return result.success;
    } catch {
      return false;
    }
  }

  async parse(buffer: Buffer): Promise<any> {
    return parseJSON(buffer);
  }
}

export interface ParseOptions {
  attemptRepair?: boolean;
  maxDepth?: number;
  preserveStringsOnFailure?: boolean;
  customStrategies?: RepairStrategy[];
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

export abstract class RepairStrategy {
  abstract name: string;
  abstract description: string;
  abstract canApply(input: string): boolean;
  abstract apply(input: string): string;
  validate?(repaired: string): boolean {
    try {
      JSON.parse(repaired);
      return true;
    } catch {
      return false;
    }
  }
}

class TripleQuoteStrategy extends RepairStrategy {
  name = "TripleQuoteRepair";
  description = "Converts triple-quoted strings to proper JSON, parsing nested JSON content";

  canApply(input: string): boolean {
    return /"""/.test(input);
  }

  apply(input: string): string {
    return input.replace(/"""([\s\S]*?)"""/g, (match, content) => {
      const trimmed = content.trim();

      if (
        (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
        (trimmed.startsWith("[") && trimmed.endsWith("]"))
      ) {
        try {
          const parsed = JSON.parse(trimmed);
          return JSON.stringify(parsed);
        } catch {
          const cleaned = content
            .replace(/\\/g, "\\\\")
            .replace(/"/g, '\\"')
            .replace(/\n/g, "\\n")
            .replace(/\r/g, "\\r")
            .replace(/\t/g, "\\t");
          return `"${cleaned}"`;
        }
      }

      const escaped = content
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/\t/g, "\\t");
      return `"${escaped}"`;
    });
  }
}

class PythonLiteralStrategy extends RepairStrategy {
  name = "PythonLiteralRepair";
  description = "Converts Python literals to JavaScript equivalents";

  canApply(input: string): boolean {
    return /\b(None|True|False)\b/.test(input);
  }

  apply(input: string): string {
    return input
      .replace(/\bNone\b/g, "null")
      .replace(/\bTrue\b/g, "true")
      .replace(/\bFalse\b/g, "false");
  }
}

class TrailingCommaStrategy extends RepairStrategy {
  name = "TrailingCommaRepair";
  description = "Removes trailing commas from objects and arrays";

  canApply(input: string): boolean {
    return /,\s*[}\]]/.test(input);
  }

  apply(input: string): string {
    return input.replace(/,(\s*[}\]])/g, "$1");
  }
}

class SingleQuoteStrategy extends RepairStrategy {
  name = "SingleQuoteRepair";
  description = "Converts single quotes to double quotes";

  canApply(input: string): boolean {
    return /[{,]\s*'[^']*'\s*:/.test(input) || /:\s*'[^']*'/.test(input);
  }

  apply(input: string): string {
    let result = input.replace(/([{,]\s*)'([^']+)'(\s*:)/g, '$1"$2"$3');
    result = result.replace(/(:\s*)'([^']+)'(\s*[,}])/g, '$1"$2"$3');
    return result;
  }
}

class UnquotedKeyStrategy extends RepairStrategy {
  name = "UnquotedKeyRepair";
  description = "Adds quotes to unquoted object keys";

  canApply(input: string): boolean {
    return /[{,]\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*:/.test(input);
  }

  apply(input: string): string {
    return input.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)(\s*:)/g, '$1"$2"$3');
  }
}

class CommentStrategy extends RepairStrategy {
  name = "CommentRemoval";
  description = "Removes JavaScript-style comments";

  canApply(input: string): boolean {
    return /\/\/.*$|\/\*[\s\S]*?\*\//m.test(input);
  }

  apply(input: string): string {
    let result = input.replace(/\/\/.*$/gm, "");
    result = result.replace(/\/\*[\s\S]*?\*\//g, "");
    return result;
  }
}

class UnescapedControlCharactersStrategy extends RepairStrategy {
  name = "UnescapedControlCharactersRepair";
  description = "Escapes unescaped control characters (newlines, tabs, etc.) in JSON strings";

  canApply(input: string): boolean {
    try {
      JSON.parse(input);
      return false;
    } catch (e: any) {
      const errorMsg = e.message || "";
      return (
        errorMsg.includes("control character") ||
        errorMsg.includes("Bad control") ||
        (errorMsg.includes("Unexpected token") && /[\n\r\t]/.test(input))
      );
    }
  }

  apply(input: string): string {
    let result = "";
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < input.length; i++) {
      const char = input[i];
      const prevChar = i > 0 ? input[i - 1] : "";

      if (escapeNext) {
        result += char;
        escapeNext = false;
        continue;
      }

      if (char === "\\" && inString) {
        result += char;
        escapeNext = true;
        continue;
      }

      if (char === '"' && prevChar !== "\\") {
        inString = !inString;
        result += char;
        continue;
      }

      if (inString) {
        switch (char) {
          case "\n":
            result += "\\n";
            break;
          case "\r":
            result += "\\r";
            break;
          case "\t":
            result += "\\t";
            break;
          case "\b":
            result += "\\b";
            break;
          case "\f":
            result += "\\f";
            break;
          default:
            const charCode = char.charCodeAt(0);
            if (charCode < 0x20) {
              result += "\\u" + ("0000" + charCode.toString(16)).slice(-4);
            } else {
              result += char;
            }
        }
      } else {
        result += char;
      }
    }

    return result;
  }
}

class TrailingCharactersStrategy extends RepairStrategy {
  name = "TrailingCharactersRepair";
  description = "Removes trailing characters after valid JSON structure";

  canApply(input: string): boolean {
    const trimmed = input.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
      return false;
    }

    let braceCount = 0;
    let bracketCount = 0;
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < trimmed.length; i++) {
      const char = trimmed[i];

      if (!inString) {
        if (char === '"') {
          inString = true;
        } else if (char === "{") {
          braceCount++;
        } else if (char === "}") {
          braceCount--;
          if (braceCount === 0 && bracketCount === 0 && i > 0 && i < trimmed.length - 1) {
            return true;
          }
        } else if (char === "[") {
          bracketCount++;
        } else if (char === "]") {
          bracketCount--;
          if (bracketCount === 0 && braceCount === 0 && i > 0 && i < trimmed.length - 1) {
            return true;
          }
        }
      } else {
        if (escapeNext) {
          escapeNext = false;
        } else if (char === "\\") {
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
        } else if (char === "{") {
          braceCount++;
        } else if (char === "}") {
          braceCount--;
          if (braceCount === 0 && bracketCount === 0 && i > 0) {
            jsonEndIndex = i;
            break;
          }
        } else if (char === "[") {
          bracketCount++;
        } else if (char === "]") {
          bracketCount--;
          if (bracketCount === 0 && braceCount === 0 && i > 0) {
            jsonEndIndex = i;
            break;
          }
        }
      } else {
        if (escapeNext) {
          escapeNext = false;
        } else if (char === "\\") {
          escapeNext = true;
        } else if (char === '"') {
          inString = false;
        }
      }
    }

    if (jsonEndIndex > 0 && jsonEndIndex < trimmed.length - 1) {
      return trimmed.substring(0, jsonEndIndex + 1);
    }

    return input;
  }
}

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
      ...options,
    };

    this.initializeDefaultStrategies();

    if (options.customStrategies) {
      this.strategies.push(...options.customStrategies);
    }
  }

  private initializeDefaultStrategies(): void {
    this.strategies = [
      new TripleQuoteStrategy(),
      new SingleQuoteStrategy(),
      new UnescapedControlCharactersStrategy(),
      new TrailingCharactersStrategy(),
      new PythonLiteralStrategy(),
      new TrailingCommaStrategy(),
      new UnquotedKeyStrategy(),
      new CommentStrategy(),
    ];
  }

  parse<T = any>(input: string | Buffer): ParseResult<T> {
    const startTime = Date.now();
    this.repairLog = [];

    const jsonString = input instanceof Buffer ? input.toString("utf8") : String(input);

    try {
      const data = JSON.parse(jsonString);
      return {
        success: true,
        data,
        metadata: {
          parseTime: Date.now() - startTime,
          strategiesApplied: [],
        },
      };
    } catch (initialError) {
      if (!this.options.attemptRepair) {
        return {
          success: false,
          error: `JSON parse error: ${initialError}`,
          metadata: {
            parseTime: Date.now() - startTime,
          },
        };
      }
    }

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

          try {
            const data = JSON.parse(repaired);
            return {
              success: true,
              data,
              repairs: this.repairLog,
              metadata: {
                parseTime: Date.now() - startTime,
                strategiesApplied: appliedStrategies,
              },
            };
          } catch {}
        }
      }
    }

    try {
      const data = JSON.parse(repaired);
      return {
        success: true,
        data,
        repairs: this.repairLog,
        metadata: {
          parseTime: Date.now() - startTime,
          strategiesApplied: appliedStrategies,
        },
      };
    } catch (finalError) {
      const fallbackResult = this.aggressiveFallback(repaired);
      if (fallbackResult.success) {
        return {
          ...fallbackResult,
          repairs: [...this.repairLog, "Applied aggressive fallback"],
          metadata: {
            parseTime: Date.now() - startTime,
            strategiesApplied: [...appliedStrategies, "AggressiveFallback"],
          },
        };
      }

      return {
        success: false,
        error: `Failed to parse JSON after applying ${appliedStrategies.length} strategies: ${finalError}`,
        repairs: this.repairLog,
        metadata: {
          parseTime: Date.now() - startTime,
          strategiesApplied: appliedStrategies,
        },
      };
    }
  }

  private aggressiveFallback(input: string): ParseResult {
    try {
      const objectStart = input.indexOf("{");
      const arrayStart = input.indexOf("[");

      if (objectStart === -1 && arrayStart === -1) {
        return { success: false, error: "No JSON-like structure found" };
      }

      const startIdx =
        objectStart === -1
          ? arrayStart
          : arrayStart === -1
            ? objectStart
            : Math.min(objectStart, arrayStart);

      let extracted = input.substring(startIdx);

      for (const strategy of this.strategies) {
        if (strategy.canApply(extracted)) {
          extracted = strategy.apply(extracted);
        }
      }

      const data = JSON.parse(extracted);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: `Aggressive fallback failed: ${error}` };
    }
  }

  addStrategy(strategy: RepairStrategy): void {
    this.strategies.push(strategy);
  }

  removeStrategy(name: string): void {
    this.strategies = this.strategies.filter((s) => s.name !== name);
  }

  getStrategies(): string[] {
    return this.strategies.map((s) => s.name);
  }
}

const defaultParser = new ResilientJsonParser();

export function parseJsonResilient<T = any>(
  input: string | Buffer,
  options?: ParseOptions,
): ParseResult<T> {
  const parser = options ? new ResilientJsonParser(options) : defaultParser;
  return parser.parse<T>(input);
}

export function parseJSON(input: Buffer | string): any {
  const result = defaultParser.parse(input);

  if (result.success) {
    if (result.repairs && result.repairs.length > 0) {
      console.log("JSON parsed with repairs:", result.repairs);
    }
    return result.data;
  } else {
    throw new Error(`Failed to parse JSON: ${result.error}`);
  }
}

export function isValidJson(jsonString: string): boolean {
  try {
    JSON.parse(jsonString);
    return true;
  } catch {
    return false;
  }
}

export function prettyPrintJson(data: any, indent: number = 2): string {
  return JSON.stringify(data, null, indent);
}

export function minifyJson(jsonString: string): string {
  const parser = new ResilientJsonParser();
  const result = parser.parse(jsonString);

  if (result.success) {
    return JSON.stringify(result.data);
  }

  throw new Error("Cannot minify invalid JSON");
}

export {
  CommentStrategy,
  PythonLiteralStrategy,
  SingleQuoteStrategy,
  TrailingCommaStrategy,
  TripleQuoteStrategy,
  UnquotedKeyStrategy,
};
