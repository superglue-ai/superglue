/**
 * File parsing utilities for Deno runtime
 *
 * This mirrors the functionality from packages/core/files/ but adapted for Deno.
 * Uses the same npm packages where possible.
 */

import { Buffer } from "node:buffer";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import * as XLSX from "npm:xlsx@0.18.5";
import yaml from "npm:js-yaml@4.1.0";
import JSZip from "npm:jszip@3.10.1";
import Papa from "npm:papaparse@5.4.1";
import sax from "npm:sax@1.4.1";
import * as htmlparser2 from "npm:htmlparser2@9.1.0";
// @ts-ignore - npm imports for Deno
import StreamJson from "npm:stream-json@1.8.0";
// @ts-ignore - npm imports for Deno
import StreamArray from "npm:stream-json@1.8.0/streamers/StreamArray.js";
// @ts-ignore - npm imports for Deno
import StreamObject from "npm:stream-json@1.8.0/streamers/StreamObject.js";

const gunzipAsync = promisify(gunzip);
// @ts-ignore - npm package types
const { parser } = StreamJson;
// @ts-ignore - npm package types
const { streamArray } = StreamArray;
// @ts-ignore - npm package types
const { streamObject } = StreamObject;

// V8 string limit is ~536MB, use 400MB as safe threshold
const LARGE_BUFFER_THRESHOLD = 400 * 1024 * 1024;

/**
 * Supported file types for parsing
 */
export type SupportedFileType =
  | "JSON"
  | "CSV"
  | "XML"
  | "HTML"
  | "YAML"
  | "EXCEL"
  | "PDF"
  | "DOCX"
  | "ZIP"
  | "GZIP"
  | "RAW"
  | "AUTO";

/**
 * Detection priority for file type detection
 */
enum DetectionPriority {
  GZIP = 1,
  ZIP_BASED_SPECIFIC = 2,
  BINARY_SIGNATURE = 10,
  ZIP_GENERIC = 11,
  STRUCTURED_TEXT_SPECIFIC = 12,
  STRUCTURED_TEXT = 20,
  HEURISTIC_TEXT = 30,
}

/**
 * Check if buffer is large enough to require streaming
 */
function isLargeBuffer(buffer: Uint8Array): boolean {
  return buffer.length > LARGE_BUFFER_THRESHOLD;
}

/**
 * Create a readable stream from a buffer in chunks to avoid V8 string limit
 */
function createChunkedStream(buffer: Uint8Array, chunkSize = 64 * 1024 * 1024): Readable {
  let offset = 0;
  return new Readable({
    read() {
      if (offset >= buffer.length) {
        this.push(null);
        return;
      }
      const end = Math.min(offset + chunkSize, buffer.length);
      this.push(Buffer.from(buffer.subarray(offset, end)));
      offset = end;
    },
  });
}

/**
 * Parse large JSON buffers using streaming to avoid V8 string limit
 */
async function parseStreamingJson(buffer: Uint8Array): Promise<unknown> {
  // Peek at first non-whitespace char to determine if array or object
  let firstChar = "";
  for (let i = 0; i < Math.min(buffer.length, 1000); i++) {
    const char = String.fromCharCode(buffer[i]);
    if (char.trim()) {
      firstChar = char;
      break;
    }
  }

  const stream = createChunkedStream(buffer);

  if (firstChar === "[") {
    // Parse as array
    // deno-lint-ignore no-explicit-any
    const results: any[] = [];
    const collector = new Transform({
      objectMode: true,
      // deno-lint-ignore no-explicit-any
      transform({ value }: any, _encoding: string, callback: () => void) {
        results.push(value);
        callback();
      },
    });

    await pipeline(stream, parser(), streamArray(), collector);
    return results;
  } else if (firstChar === "{") {
    // Parse as object
    // deno-lint-ignore no-explicit-any
    const result: Record<string, any> = {};
    const collector = new Transform({
      objectMode: true,
      // deno-lint-ignore no-explicit-any
      transform({ key, value }: any, _encoding: string, callback: () => void) {
        result[key] = value;
        callback();
      },
    });

    await pipeline(stream, parser(), streamObject(), collector);
    return result;
  } else {
    throw new Error(`Invalid JSON: expected '[' or '{', got '${firstChar}'`);
  }
}

/**
 * Parse JSON safely, handling edge cases
 */
export function parseJSON(input: string | unknown): unknown {
  if (typeof input !== "string") {
    return input;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    // Remove BOM if present
    const withoutBom = trimmed.replace(/^\uFEFF/, "");
    try {
      return JSON.parse(withoutBom);
    } catch {
      return trimmed;
    }
  }
}

/**
 * Check if buffer is GZIP compressed (1f8b signature)
 */
function isGzip(buffer: Uint8Array): boolean {
  if (buffer.length < 2) return false;
  return buffer[0] === 0x1f && buffer[1] === 0x8b;
}

/**
 * Check if buffer is a ZIP file (PK signature)
 */
function isZip(buffer: Uint8Array): boolean {
  if (buffer.length < 4) return false;
  return buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
}

/**
 * Check if buffer is a PDF file (%PDF signature)
 */
function isPdf(buffer: Uint8Array): boolean {
  if (buffer.length < 4) return false;
  return buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
}

/**
 * Check if ZIP contains Excel files
 */
async function isExcel(buffer: Uint8Array): Promise<boolean> {
  if (!isZip(buffer)) return false;
  try {
    const zip = new JSZip();
    const loadedZip = await zip.loadAsync(buffer);
    return Object.keys(loadedZip.files).some(
      (f) => f === "xl/workbook.xml" || f.startsWith("xl/worksheets/"),
    );
  } catch {
    return false;
  }
}

/**
 * Check if ZIP contains Word files
 */
async function isDocx(buffer: Uint8Array): Promise<boolean> {
  if (!isZip(buffer)) return false;
  try {
    const zip = new JSZip();
    const loadedZip = await zip.loadAsync(buffer);
    return Object.keys(loadedZip.files).some(
      (f) => f === "word/document.xml" || f.startsWith("word/"),
    );
  } catch {
    return false;
  }
}

/**
 * Check if content is likely CSV
 */
function isLikelyCSV(sample: string): boolean {
  const lines = sample
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .slice(0, 10);

  if (lines.length < 2) return false;

  const delimiters = [",", "\t", ";"];

  for (const delimiter of delimiters) {
    const delimiterCounts = lines.map((line) => {
      return (line.match(new RegExp(`\\${delimiter}`, "g")) || []).length;
    });

    if (Math.max(...delimiterCounts) === 0) continue;

    const nonZeroCounts = delimiterCounts.filter((count) => count > 0);
    if (nonZeroCounts.length >= lines.length * 0.7) {
      const avgCount = nonZeroCounts.reduce((a, b) => a + b, 0) / nonZeroCounts.length;
      const consistentLines = delimiterCounts.filter(
        (count) => count === 0 || Math.abs(count - avgCount) <= Math.max(2, avgCount * 0.3),
      ).length;

      if (consistentLines >= lines.length * 0.8) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if content is likely YAML
 */
function isLikelyYAML(sample: string): boolean {
  if (sample.startsWith("%YAML")) return true;
  if (sample.startsWith("{") || sample.startsWith("[")) return false;

  const lines = sample.split(/\r?\n/);
  const nonEmptyLines = lines.filter((l) => l.trim().length > 0);
  if (nonEmptyLines.length === 0) return false;

  if (lines[0]?.trim() === "---") return true;

  const kvPattern = /^[\w][\w.-]*:\s*.+/;
  const yamlListPattern = /^\s*-\s+.+/;
  const nestedKeyPattern = /^\s{2,}[\w][\w.-]*:\s*.+/;
  let kvCount = 0;
  let structureCount = 0;
  for (const line of nonEmptyLines) {
    if (kvPattern.test(line)) kvCount++;
    if (yamlListPattern.test(line) || nestedKeyPattern.test(line)) structureCount++;
  }

  const kvRatio = kvCount / nonEmptyLines.length;

  if (kvCount >= 3 && kvRatio >= 0.4) return true;
  if (kvCount >= 2 && structureCount >= 1) return true;
  if (kvCount >= 2 && kvRatio >= 0.8) return true;

  return false;
}

/**
 * Check if content is HTML
 */
function isHTML(sample: string): boolean {
  const lower = sample.toLowerCase();
  if (lower.startsWith("<?xml")) return false;
  if (lower.includes("<!doctype html")) return true;
  if (/<html[\s>]/.test(lower)) return true;
  return false;
}

/**
 * Check if content is XML
 */
function isXML(sample: string): boolean {
  const trimmed = sample.trim();
  if (!trimmed.startsWith("<?xml") && !trimmed.startsWith("<")) return false;
  return trimmed.includes("</") || trimmed.includes("/>");
}

/**
 * Detect delimiter for CSV
 */
function detectDelimiter(sample: string): string {
  const delimiters = [",", "|", "\t", ";", ":"];
  const counts = delimiters.map((delimiter) => ({
    delimiter,
    count: countUnescapedDelimiter(sample, delimiter),
  }));

  const detectedDelimiter = counts.reduce((prev, curr) => {
    return curr.count > prev.count ? curr : prev;
  });

  return detectedDelimiter.count === 0 ? "," : detectedDelimiter.delimiter;
}

function countUnescapedDelimiter(text: string, delimiter: string): number {
  let count = 0;
  let inQuotes = false;
  let prevChar = "";
  const delimiterLength = delimiter.length;
  for (let i = 0; i < text.length; i++) {
    const currentChar = text[i];
    const searchChar = text.substring(i, i + delimiterLength);
    if (currentChar === '"' && prevChar !== "\\") {
      inQuotes = !inQuotes;
    } else if (searchChar === delimiter && !inQuotes) {
      count++;
    }
    prevChar = currentChar;
  }
  return count;
}

/**
 * Parse CSV content using papaparse
 */
async function parseCSV(content: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const sampleSize = Math.min(content.length, 32768);
    const sample = content.substring(0, sampleSize);
    const delimiter = detectDelimiter(sample);

    const results: Record<string, unknown>[] = [];
    const metadata: unknown[][] = [];
    let headerValues: string[] = [];
    let headerRowIndex = 0;
    let currentLine = -1;
    // deno-lint-ignore no-explicit-any
    let rawHeader: Record<string, any> = {};

    // First pass: detect header row
    const previewResult = Papa.parse(sample, {
      preview: 100,
      header: false,
      skipEmptyLines: false,
      delimiter: delimiter,
    });

    // deno-lint-ignore no-explicit-any
    headerRowIndex = (previewResult.data as any[][]).reduce<number>(
      // deno-lint-ignore no-explicit-any
      (maxIndex: number, row: any[], currentIndex: number, rows: any[][]) =>
        row.length > (rows[maxIndex] || []).length ? currentIndex : maxIndex,
      0,
    );

    // deno-lint-ignore no-explicit-any
    headerValues = ((previewResult.data as any[][])[headerRowIndex] || []).map(
      (value: string, index: number) => value?.trim() || `Column ${index + 1}`,
    );

    // Second pass: parse full content
    Papa.parse(content, {
      header: false,
      skipEmptyLines: false,
      delimiter: delimiter,
      // deno-lint-ignore no-explicit-any
      step: (result: { data: any[] }) => {
        currentLine++;
        if (currentLine === headerRowIndex) {
          rawHeader = result.data.filter(Boolean).reduce(
            (acc, value, index) => {
              acc[`${index}`] = value;
              return acc;
            },
            {} as Record<string, unknown>,
          );
          return;
        } else if (currentLine < headerRowIndex) {
          if (result.data == null || result.data?.filter(Boolean).length === 0) return;
          metadata.push(result.data);
          return;
        }
        if (
          result.data == null ||
          // deno-lint-ignore no-explicit-any
          result.data.map((value: any) => value?.trim()).filter(Boolean).length === 0
        )
          return;
        const dataObject: Record<string, unknown> = {};
        for (let i = 0; i < headerValues.length; i++) {
          dataObject[headerValues[i]] = result.data[i];
        }
        results.push(dataObject);
      },
      complete: () => {
        if (metadata.length > 0) {
          resolve({ data: results, metadata });
        } else if (results.length > 0) {
          resolve(results);
        } else {
          resolve(rawHeader);
        }
      },
      error: (error: Error) => {
        reject(error);
      },
    });
  });
}

/**
 * Parse XML content using sax
 */
async function parseXML(content: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    // deno-lint-ignore no-explicit-any
    const results: any = {};
    // deno-lint-ignore no-explicit-any
    let currentElement: any = null;
    // deno-lint-ignore no-explicit-any
    const elementStack: any[] = [];

    const parser = sax.parser(false);

    // deno-lint-ignore no-explicit-any
    parser.onopentag = (node: any) => {
      // deno-lint-ignore no-explicit-any
      const newElement: any = node.attributes || {};
      if (currentElement && typeof currentElement === "object") {
        elementStack.push(currentElement);
      } else if (currentElement && typeof currentElement === "string") {
        elementStack.push({ _TEXT: currentElement });
      } else {
        elementStack.push({});
      }
      currentElement = newElement;
    };

    parser.ontext = (text: string) => {
      if (!currentElement || text?.trim()?.length === 0) return;

      const trimmedText = text.trim();

      if (Array.isArray(currentElement)) {
        currentElement.push(trimmedText);
      } else if (typeof currentElement === "string") {
        currentElement = [currentElement, trimmedText];
      } else if (typeof currentElement === "object" && currentElement !== null) {
        if (Object.keys(currentElement).length > 0) {
          currentElement["_TEXT"] = trimmedText;
        } else {
          currentElement = trimmedText;
        }
      }
    };

    parser.onclosetag = (tagName: string) => {
      let parentElement = elementStack.pop();
      if (parentElement == null) {
        parentElement = results;
      }
      if (currentElement) {
        if (!parentElement[tagName]) {
          parentElement[tagName] = currentElement;
        } else if (Array.isArray(parentElement[tagName])) {
          parentElement[tagName].push(currentElement);
        } else {
          parentElement[tagName] = [parentElement[tagName], currentElement];
        }
      }
      currentElement = parentElement;
    };

    parser.onerror = (err: Error) => {
      console.warn("XML parsing warning (continuing):", err.message);
      parser.resume();
    };

    parser.onend = () => {
      resolve(currentElement);
    };

    parser.write(content).close();
  });
}

/**
 * Parse HTML content using htmlparser2
 */
async function parseHTML(content: string): Promise<unknown> {
  return new Promise((resolve) => {
    // deno-lint-ignore no-explicit-any
    const results: any = {};
    // deno-lint-ignore no-explicit-any
    const elementStack: any[] = [results];

    const parser = new htmlparser2.Parser(
      {
        onopentag(name, attributes) {
          const elementName = attributes.id || name;
          const parent = elementStack[elementStack.length - 1];

          const { id: _id, ...otherAttributes } = attributes;
          // deno-lint-ignore no-explicit-any
          const newElement: any = { ...otherAttributes };

          if (!parent[elementName]) {
            parent[elementName] = newElement;
          } else if (Array.isArray(parent[elementName])) {
            parent[elementName].push(newElement);
          } else {
            parent[elementName] = [parent[elementName], newElement];
          }

          elementStack.push(newElement);
        },
        ontext(text) {
          const trimmedText = text.trim();
          if (!trimmedText) return;

          const currentElement = elementStack[elementStack.length - 1];
          if (!currentElement) return;

          if (!currentElement.content) {
            currentElement.content = trimmedText;
          } else {
            currentElement.content += " " + trimmedText;
          }
        },
        onclosetag() {
          elementStack.pop();
        },
        onerror(error) {
          console.warn("HTML parsing warning:", error.message);
        },
        onend() {
          resolve(results);
        },
      },
      { decodeEntities: true },
    );

    parser.write(content);
    parser.end();
  });
}

/**
 * Parse YAML content
 */
function parseYAML(content: string): unknown {
  return yaml.load(content);
}

/**
 * Parse Excel content using xlsx
 */
async function parseExcel(buffer: Uint8Array): Promise<Record<string, unknown[]>> {
  const parsePromise = new Promise<XLSX.WorkBook>((resolve, reject) => {
    try {
      const workbook = XLSX.read(buffer, {
        type: "array",
        cellDates: true,
        dense: false,
        cellStyles: false,
      });
      resolve(workbook);
    } catch (error) {
      reject(error);
    }
  });

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Excel parsing timeout after 60 seconds")), 60000);
  });

  const workbook = await Promise.race([parsePromise, timeoutPromise]);
  const result: Record<string, unknown[]> = {};

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];

    // deno-lint-ignore no-explicit-any
    const rawRows = XLSX.utils.sheet_to_json<any>(worksheet, {
      raw: false,
      header: 1,
      defval: null,
      blankrows: true,
    });

    if (!rawRows?.length) {
      result[sheetName] = [];
      continue;
    }

    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
      const row = rawRows[i] || [];
      // deno-lint-ignore no-explicit-any
      const nonNullCount = row.filter((v: any) => v !== null && v !== undefined && v !== "").length;
      if (nonNullCount >= 2) {
        headerRowIndex = i;
        break;
      }
    }

    // deno-lint-ignore no-explicit-any
    const headers = rawRows[headerRowIndex].map((header: any, index: number) =>
      header ? String(header).trim() : `Column ${index + 1}`,
    );

    // deno-lint-ignore no-explicit-any
    const processedRows = rawRows.slice(headerRowIndex + 1).map((row: any) => {
      const obj: Record<string, unknown> = {};
      headers.forEach((header: string, index: number) => {
        if (header && row[index] !== undefined) {
          obj[header] = row[index];
        }
      });
      return obj;
    });

    result[sheetName] = processedRows;
  }

  return result;
}

/**
 * Parse GZIP content
 */
async function parseGZIP(buffer: Uint8Array): Promise<unknown> {
  const decompressed = await gunzipAsync(Buffer.from(buffer));
  return parseFile(new Uint8Array(decompressed), "AUTO");
}

/**
 * Parse ZIP content
 */
async function parseZIP(buffer: Uint8Array): Promise<Record<string, unknown>> {
  const zip = new JSZip();
  const loadedZip = await zip.loadAsync(buffer);
  const extracted: Record<string, unknown> = {};

  for (const [filename, file] of Object.entries(loadedZip.files)) {
    if (file.dir) continue;
    if (filename.startsWith("__MACOSX/") || filename.startsWith("._")) continue;

    const content = await file.async("uint8array");
    extracted[filename] = await parseFile(content, "AUTO");
  }

  return extracted;
}

/**
 * Parse PDF content
 * Note: Full PDF parsing requires pdf-parse which has complex dependencies.
 * For now, we return a placeholder. If PDF parsing is critical, consider
 * doing it in the Node.js main thread before sending to Deno.
 */
async function parsePDF(_buffer: Uint8Array): Promise<{ textContent: string; note: string }> {
  return {
    textContent: "",
    note: "PDF parsing in Deno subprocess is limited. For full PDF support, parse in Node.js before sending to Deno.",
  };
}

/**
 * Parse DOCX content
 * Note: Full DOCX parsing requires mammoth which has complex dependencies.
 * For now, we extract raw XML text. If DOCX parsing is critical, consider
 * doing it in the Node.js main thread before sending to Deno.
 */
async function parseDOCX(buffer: Uint8Array): Promise<string> {
  try {
    const zip = new JSZip();
    const loadedZip = await zip.loadAsync(buffer);
    const documentXml = loadedZip.file("word/document.xml");
    if (documentXml) {
      const xmlContent = await documentXml.async("string");
      // Extract text from XML (basic extraction)
      const textContent = xmlContent
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return textContent;
    }
    return "";
  } catch {
    return "";
  }
}

/**
 * Detect file type from content
 */
async function detectFileType(buffer: Uint8Array): Promise<SupportedFileType> {
  // Binary format detection (highest priority)
  if (isGzip(buffer)) return "GZIP";
  if (isPdf(buffer)) return "PDF";

  // ZIP-based formats
  if (isZip(buffer)) {
    if (await isExcel(buffer)) return "EXCEL";
    if (await isDocx(buffer)) return "DOCX";
    return "ZIP";
  }

  // Text-based detection
  const sampleSize = Math.min(buffer.length, 8192);
  const sample = new TextDecoder().decode(buffer.slice(0, sampleSize)).trim();

  // JSON detection
  if (sample.startsWith("{") || sample.startsWith("[")) {
    // For large buffers, trust the structure hint without full validation
    // to avoid hitting V8 string limits during detection
    if (buffer.length > 10 * 1024 * 1024) {
      // 10MB threshold
      return "JSON";
    }

    // For smaller buffers, validate it's actually valid JSON
    try {
      JSON.parse(new TextDecoder().decode(buffer));
      return "JSON";
    } catch {
      // Not valid JSON - might be malformed
      return "RAW";
    }
  }

  // HTML detection (before XML)
  if (isHTML(sample)) return "HTML";

  // XML detection
  if (isXML(sample)) return "XML";

  // YAML detection
  if (isLikelyYAML(sample)) return "YAML";

  // CSV detection
  if (isLikelyCSV(sample)) return "CSV";

  return "RAW";
}

/**
 * Parse file content based on type
 */
export async function parseFile(
  content: Uint8Array | Buffer,
  fileType: SupportedFileType = "AUTO",
): Promise<unknown> {
  const buffer = content instanceof Buffer ? new Uint8Array(content) : content;

  // Auto-detect if needed
  const actualType = fileType === "AUTO" ? await detectFileType(buffer) : fileType;

  switch (actualType) {
    case "JSON":
      // Use streaming parser for large buffers to avoid V8 string limits
      if (isLargeBuffer(buffer)) {
        return parseStreamingJson(buffer);
      }

      // For smaller buffers, use standard parsing
      return parseJSON(new TextDecoder().decode(buffer));

    case "CSV":
      return parseCSV(new TextDecoder().decode(buffer));

    case "XML":
      return parseXML(new TextDecoder().decode(buffer));

    case "HTML":
      return parseHTML(new TextDecoder().decode(buffer));

    case "YAML":
      return parseYAML(new TextDecoder().decode(buffer));

    case "EXCEL":
      return parseExcel(buffer);

    case "PDF":
      return parsePDF(buffer);

    case "DOCX":
      return parseDOCX(buffer);

    case "GZIP":
      return parseGZIP(buffer);

    case "ZIP":
      return parseZIP(buffer);

    case "RAW":
    default:
      // For large buffers, try streaming JSON parser
      if (isLargeBuffer(buffer)) {
        try {
          return await parseStreamingJson(buffer);
        } catch {
          // If streaming JSON fails, return error - can't convert large buffer to string
          throw new Error(
            `Cannot parse large buffer (${(buffer.length / 1024 / 1024).toFixed(1)}MB) as RAW - exceeds string limits`,
          );
        }
      }

      // For smaller buffers, try JSON first, then return as string
      try {
        return JSON.parse(new TextDecoder().decode(buffer));
      } catch {
        return new TextDecoder().decode(buffer);
      }
  }
}
