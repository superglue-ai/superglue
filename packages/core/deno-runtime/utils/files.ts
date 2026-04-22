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
import { extractText, getDocumentProxy } from "npm:unpdf@1.4.0";
// @ts-ignore - npm imports for Deno
import mammoth from "npm:mammoth@1.12.0";
import { NodeHtmlMarkdown } from "npm:node-html-markdown@2.0.0";
// @ts-ignore - npm imports for Deno
import StreamJson from "npm:stream-json@1.8.0";
// @ts-ignore - npm imports for Deno
import StreamArray from "npm:stream-json@1.8.0/streamers/StreamArray.js";
// @ts-ignore - npm imports for Deno
import StreamObject from "npm:stream-json@1.8.0/streamers/StreamObject.js";
import type {
  ExecutionFileEnvelope,
  RawFileBytes,
  RuntimeExecutionFile,
  RuntimeFilePointer,
  SupportedFileType,
  TransformRuntimeFileInput,
} from "../types.ts";

const gunzipAsync = promisify(gunzip);
// @ts-ignore - npm package types
const { parser } = StreamJson;
// @ts-ignore - npm package types
const { streamArray } = StreamArray;
// @ts-ignore - npm package types
const { streamObject } = StreamObject;

// V8 string limit is ~536MB, use 400MB as safe threshold
const LARGE_BUFFER_THRESHOLD = 400 * 1024 * 1024;
const TEXT_SAMPLE_SIZE = 8192;
const textDecoder = new TextDecoder();

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

function isAllowedTextControlByte(byte: number): boolean {
  return byte === 0x09 || byte === 0x0a || byte === 0x0d;
}

function isLikelyTextBuffer(buffer: Uint8Array): boolean {
  if (buffer.length === 0) {
    return true;
  }

  const sample = buffer.slice(0, Math.min(buffer.length, TEXT_SAMPLE_SIZE));
  let suspiciousControlBytes = 0;

  for (const byte of sample) {
    if (byte === 0x00) {
      return false;
    }

    if ((byte < 0x20 || byte === 0x7f) && !isAllowedTextControlByte(byte)) {
      suspiciousControlBytes++;
    }
  }

  if (suspiciousControlBytes / sample.length > 0.1) {
    return false;
  }

  const decodedSample = textDecoder.decode(sample);
  const replacementChars = decodedSample.match(/\uFFFD/g);
  return !replacementChars || replacementChars.length === 0;
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

export async function detectAndParseFile(content: Uint8Array | Buffer): Promise<{
  fileType: SupportedFileType;
  extracted?: unknown;
  parseError?: string;
}> {
  const buffer = content instanceof Buffer ? new Uint8Array(content) : content;
  const fileType = await detectFileType(buffer);

  if (fileType === "BINARY") {
    return { fileType };
  }

  try {
    return {
      fileType,
      extracted: await parseFile(buffer, fileType),
    };
  } catch (error) {
    return {
      fileType,
      parseError: (error as Error).message,
    };
  }
}

export async function buildRuntimeFile(
  raw: Uint8Array,
  filename: string,
  contentType: string,
): Promise<RuntimeExecutionFile> {
  const parsedFile = await detectAndParseFile(raw);

  return {
    filename,
    contentType,
    size: raw.length,
    raw,
    fileType: parsedFile.fileType,
    ...(parsedFile.extracted !== undefined ? { extracted: parsedFile.extracted } : {}),
    ...(parsedFile.parseError ? { parseError: parsedFile.parseError } : {}),
  };
}

export const MAX_INLINE_FILE_BASE64_BYTES = 500 * 1024 * 1024;

function formatInlineFileLimit(limitBytes = MAX_INLINE_FILE_BASE64_BYTES): string {
  return `${Math.round(limitBytes / (1024 * 1024))} MB`;
}

export function assertFileSupportsBase64Access(
  file: Pick<RuntimeExecutionFile, "size" | "filename">,
  options?: { ref?: string; limitBytes?: number },
): void {
  const limitBytes = options?.limitBytes ?? MAX_INLINE_FILE_BASE64_BYTES;
  if (file.size <= limitBytes) {
    return;
  }

  const fileLabel = options?.ref ? `${file.filename} (${options.ref})` : file.filename;
  throw new Error(
    `File '${fileLabel}' is too large for base64 access. Limit is ${formatInlineFileLimit(limitBytes)}. Use .raw instead.`,
  );
}

export function assertFileSupportsInlineStepResponse(
  file: Pick<RuntimeExecutionFile, "size" | "filename">,
  options?: { ref?: string; limitBytes?: number },
): void {
  const limitBytes = options?.limitBytes ?? MAX_INLINE_FILE_BASE64_BYTES;
  if (file.size <= limitBytes) {
    return;
  }

  const fileLabel = options?.ref ? `${file.filename} (${options.ref})` : file.filename;
  throw new Error(
    `Produced file '${fileLabel}' is too large for inline step responses (${file.size} bytes). Limit is ${formatInlineFileLimit(limitBytes)}. Run the full tool instead of step-by-step testing, or reference the file via .raw in a later workflow step.`,
  );
}

export function decodeExecutionFileEnvelope(envelope: ExecutionFileEnvelope): RuntimeExecutionFile {
  return {
    filename: envelope.filename,
    contentType: envelope.contentType,
    size: envelope.size,
    raw: new Uint8Array(Buffer.from(envelope.rawBase64, "base64")),
    ...(envelope.fileType ? { fileType: envelope.fileType } : {}),
    ...(envelope.extracted !== undefined ? { extracted: envelope.extracted } : {}),
    ...(envelope.parseError ? { parseError: envelope.parseError } : {}),
  };
}

function cloneExtractedValue<T>(value: T): T {
  return structuredClone(value);
}

export function cloneRuntimeExecutionFile(file: RuntimeExecutionFile): RuntimeExecutionFile {
  return {
    filename: file.filename,
    contentType: file.contentType,
    size: file.size,
    raw: file.raw.slice(),
    ...(file.fileType ? { fileType: file.fileType } : {}),
    ...(file.extracted !== undefined ? { extracted: cloneExtractedValue(file.extracted) } : {}),
    ...(file.parseError ? { parseError: file.parseError } : {}),
  };
}

export function cloneRuntimeExecutionFileMap(
  files: Record<string, RuntimeExecutionFile>,
): Record<string, RuntimeExecutionFile> {
  return Object.fromEntries(
    Object.entries(files).map(([key, file]) => [key, cloneRuntimeExecutionFile(file)]),
  );
}

export function createRuntimeExecutionFileViewMap(
  files: Record<string, RuntimeExecutionFile>,
): Record<string, RuntimeExecutionFile> {
  return Object.fromEntries(
    Object.entries(files).map(([key, file]) => {
      const view: RuntimeExecutionFile = {
        filename: file.filename,
        contentType: file.contentType,
        size: file.size,
        raw: file.raw,
        ...(file.fileType ? { fileType: file.fileType } : {}),
        ...(file.extracted !== undefined ? { extracted: file.extracted } : {}),
        ...(file.parseError ? { parseError: file.parseError } : {}),
      };

      Object.defineProperty(view, "base64", {
        enumerable: false,
        configurable: true,
        get() {
          assertFileSupportsBase64Access(file, { ref: key });
          const value = Buffer.from(file.raw).toString("base64");
          Object.defineProperty(view, "base64", {
            value,
            enumerable: false,
            configurable: true,
            writable: false,
          });
          return value;
        },
      });

      return [key, view];
    }),
  );
}

export function encodeExecutionFileEnvelope(file: RuntimeExecutionFile): ExecutionFileEnvelope {
  return {
    kind: "execution_file",
    filename: file.filename,
    contentType: file.contentType,
    size: file.size,
    rawBase64: Buffer.from(file.raw).toString("base64"),
    ...(file.fileType ? { fileType: file.fileType } : {}),
    ...(file.extracted !== undefined ? { extracted: file.extracted } : {}),
    ...(file.parseError ? { parseError: file.parseError } : {}),
  };
}

function normalizeRawBytes(raw: TransformRuntimeFileInput["raw"]): Uint8Array {
  if (raw == null) {
    return new Uint8Array(0);
  }

  if (raw instanceof Uint8Array) {
    return raw.slice();
  }

  if (raw instanceof ArrayBuffer) {
    return new Uint8Array(raw.slice(0));
  }

  if (ArrayBuffer.isView(raw)) {
    return new Uint8Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
  }

  if (Array.isArray(raw)) {
    return new Uint8Array(raw);
  }

  if (typeof raw === "string") {
    return new TextEncoder().encode(raw);
  }

  if (typeof raw === "object") {
    return new TextEncoder().encode(JSON.stringify(raw));
  }

  throw new Error(
    "Unsupported transform file raw value. Use Uint8Array, ArrayBuffer, number[], or string.",
  );
}

export async function normalizeRuntimeExecutionFile(
  input: TransformRuntimeFileInput | RuntimeExecutionFile | ExecutionFileEnvelope,
): Promise<RuntimeExecutionFile> {
  if (isExecutionFileEnvelope(input)) {
    return decodeExecutionFileEnvelope(input);
  }

  if (
    typeof input === "object" &&
    input !== null &&
    "raw" in input &&
    "filename" in input &&
    "contentType" in input &&
    "size" in input &&
    input.raw instanceof Uint8Array &&
    typeof input.filename === "string" &&
    typeof input.contentType === "string" &&
    typeof input.size === "number"
  ) {
    const runtimeFile = input as RuntimeExecutionFile;
    return cloneRuntimeExecutionFile(runtimeFile);
  }

  if (
    typeof input === "object" &&
    input !== null &&
    "raw" in input &&
    "filename" in input &&
    "contentType" in input &&
    typeof input.filename === "string" &&
    typeof input.contentType === "string"
  ) {
    const transformFile = input as TransformRuntimeFileInput;
    const raw = normalizeRawBytes(transformFile.raw);

    if (transformFile.extracted === undefined && !transformFile.parseError) {
      return buildRuntimeFile(raw, transformFile.filename, transformFile.contentType);
    }

    return {
      filename: transformFile.filename,
      contentType: transformFile.contentType,
      size: transformFile.size ?? raw.length,
      raw,
      ...(transformFile.fileType ? { fileType: transformFile.fileType } : {}),
      ...(transformFile.extracted !== undefined
        ? { extracted: cloneExtractedValue(transformFile.extracted) }
        : {}),
      ...(transformFile.parseError ? { parseError: transformFile.parseError } : {}),
    };
  }

  throw new Error(
    "Invalid transform file output. Expected an execution file envelope or an object with filename, contentType, and raw bytes.",
  );
}

type FileRefProjection = "raw" | "extracted" | "base64";

type ParsedFileRef = {
  root: string;
  segments: Array<string | number>;
  projection?: FileRefProjection;
};

const FILE_REF_BASE_PATTERN = /^([A-Za-z0-9_.-]+)((?:\[(?:\d+|"[^"]+"|'[^']+')\])*)$/;
const FILE_REF_EMBEDDED_PATTERN =
  /file::([A-Za-z0-9_.-]+)((?:\[(?:\d+|"[^"]+"|'[^']+')\])*)\.(raw|extracted|base64)/g;

function parseBracketSegments(input: string): Array<string | number> {
  const segments: Array<string | number> = [];
  const bracketPattern = /\[(\d+|"[^"]+"|'[^']+')\]/g;
  let match: RegExpExecArray | null;

  while ((match = bracketPattern.exec(input)) !== null) {
    const rawValue = match[1];
    if (/^\d+$/.test(rawValue)) {
      segments.push(Number(rawValue));
      continue;
    }

    segments.push(rawValue.slice(1, -1));
  }

  return segments;
}

function parseFileRefToken(token: string): ParsedFileRef | null {
  if (!token.startsWith("file::")) {
    return null;
  }

  let projection: FileRefProjection | undefined;
  let refWithoutPrefix = token.slice("file::".length);

  if (refWithoutPrefix.endsWith(".raw")) {
    projection = "raw";
    refWithoutPrefix = refWithoutPrefix.slice(0, -4);
  } else if (refWithoutPrefix.endsWith(".base64")) {
    projection = "base64";
    refWithoutPrefix = refWithoutPrefix.slice(0, -7);
  } else if (refWithoutPrefix.endsWith(".extracted")) {
    projection = "extracted";
    refWithoutPrefix = refWithoutPrefix.slice(0, -10);
  }

  const match = refWithoutPrefix.match(FILE_REF_BASE_PATTERN);
  if (!match) return null;

  const [, root, bracketPart] = match;
  return {
    root,
    segments: parseBracketSegments(bracketPart || ""),
    projection,
  };
}

export function isRawFileBytes(value: unknown): value is RawFileBytes {
  return (
    typeof value === "object" && value !== null && (value as RawFileBytes).kind === "raw_file_bytes"
  );
}

export function isExecutionFileEnvelope(value: unknown): value is ExecutionFileEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as ExecutionFileEnvelope).kind === "execution_file"
  );
}

export function isRuntimeFilePointer(value: unknown): value is RuntimeFilePointer {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as RuntimeFilePointer).kind === "runtime_file_pointer"
  );
}

function stringifyExtracted(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function resolveEnvelopeFromSegments(
  lookup: Record<string, RuntimeExecutionFile>,
  fileRef: ParsedFileRef,
): RuntimeExecutionFile | undefined {
  const { root, segments } = fileRef;
  if (segments.length === 0) {
    return lookup[root];
  }

  const alias = `${root}${segments
    .map((segment) => (typeof segment === "number" ? `[${segment}]` : `["${segment}"]`))
    .join("")}`;
  return lookup[alias];
}

function invalidWorkflowFileRefMessage(token: string, stepId?: string): string {
  const stepContext = stepId ? ` in workflow step ${stepId}` : "";
  return `Invalid file reference ${token}${stepContext}. Use ${token}.raw for exact bytes, ${token}.base64 for base64 text, or ${token}.extracted for parsed content.`;
}

export function resolveFileTokens(
  value: unknown,
  fileLookup: Record<string, RuntimeExecutionFile>,
  options?: { stepId?: string },
): unknown {
  if (typeof value === "string") {
    const parsedToken = parseFileRefToken(value);
    if (parsedToken) {
      if (!parsedToken.projection) {
        throw new Error(invalidWorkflowFileRefMessage(value, options?.stepId));
      }

      const envelope = resolveEnvelopeFromSegments(fileLookup, parsedToken);
      if (!envelope) {
        throw new Error(`File reference ${value} could not be resolved.`);
      }

      if (parsedToken.projection === "raw") {
        return {
          kind: "runtime_file_pointer",
          key: `${parsedToken.root}${parsedToken.segments
            .map((segment) => (typeof segment === "number" ? `[${segment}]` : `["${segment}"]`))
            .join("")}`,
        } as RuntimeFilePointer;
      }
      if (parsedToken.projection === "base64") {
        assertFileSupportsBase64Access(envelope, {
          ref: `file::${parsedToken.root}${parsedToken.segments
            .map((segment) => (typeof segment === "number" ? `[${segment}]` : `["${segment}"]`))
            .join("")}.base64`,
        });
        return Buffer.from(envelope.raw).toString("base64");
      }
      return envelope.extracted;
    }

    if (!value.includes("file::")) {
      return value;
    }

    return value.replace(FILE_REF_EMBEDDED_PATTERN, (_match, root, bracketPart, projection) => {
      const parsedEmbedded: ParsedFileRef = {
        root,
        segments: parseBracketSegments(bracketPart || ""),
        projection,
      };
      const envelope = resolveEnvelopeFromSegments(fileLookup, parsedEmbedded);
      if (!envelope) {
        throw new Error(
          `File reference file::${root}${bracketPart}.${projection} could not be resolved.`,
        );
      }
      if (projection === "raw") {
        throw new Error("Cannot embed raw file bytes inside a string value.");
      }
      if (projection === "base64") {
        assertFileSupportsBase64Access(envelope, {
          ref: `file::${root}${bracketPart}.${projection}`,
        });
        return Buffer.from(envelope.raw).toString("base64");
      }
      return stringifyExtracted(envelope.extracted);
    });
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveFileTokens(item, fileLookup, options));
  }

  if (value !== null && typeof value === "object") {
    if (isExecutionFileEnvelope(value) || isRawFileBytes(value)) {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => [
        key,
        resolveFileTokens(entryValue, fileLookup, options),
      ]),
    );
  }

  return value;
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
 * Parse PDF content using unpdf (pure-JS, Deno-compatible).
 */
async function parsePDF(
  buffer: Uint8Array,
): Promise<{ textContent: string; structuredContent: unknown[] }> {
  // Some PDF libraries take ownership of the passed buffer. Parse from a copy so
  // produced files can preserve the original raw bytes.
  const pdf = await getDocumentProxy(buffer.slice());
  try {
    const { text } = await extractText(pdf, { mergePages: false });
    const mergedText = text.join("\n\n---\n\n");
    return {
      textContent: mergedText,
      structuredContent: text.map((pageText, i) => ({ page: i + 1, text: pageText })),
    };
  } finally {
    pdf.destroy();
  }
}

async function parseDOCX(buffer: Uint8Array): Promise<string> {
  const result = await mammoth.convertToHtml(
    { buffer: Buffer.from(buffer) },
    { convertImage: mammoth.images.imgElement(() => Promise.resolve({ src: "" })) },
  );
  return NodeHtmlMarkdown.translate(result.value);
}

const BINARY_FILE_TYPES: ReadonlySet<SupportedFileType> = new Set([
  "PDF",
  "EXCEL",
  "DOCX",
  "ZIP",
  "GZIP",
  "BINARY",
]);

export function isBinaryFileType(fileType: SupportedFileType): boolean {
  return BINARY_FILE_TYPES.has(fileType);
}

export async function detectFileType(buffer: Uint8Array): Promise<SupportedFileType> {
  // Binary format detection (highest priority)
  if (isGzip(buffer)) return "GZIP";
  if (isPdf(buffer)) return "PDF";

  // ZIP-based formats
  if (isZip(buffer)) {
    if (await isExcel(buffer)) return "EXCEL";
    if (await isDocx(buffer)) return "DOCX";
    return "ZIP";
  }

  if (!isLikelyTextBuffer(buffer)) {
    return "BINARY";
  }

  // Text-based detection
  const sampleSize = Math.min(buffer.length, TEXT_SAMPLE_SIZE);
  const sample = textDecoder.decode(buffer.slice(0, sampleSize)).trim();

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
      JSON.parse(textDecoder.decode(buffer));
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

  if (fileType === "AUTO") {
    const detectedType = await detectFileType(buffer);
    if (detectedType === "BINARY") {
      return parseFile(buffer, "RAW");
    }
    return parseFile(buffer, detectedType);
  }

  switch (fileType) {
    case "JSON":
      // Use streaming parser for large buffers to avoid V8 string limits
      if (isLargeBuffer(buffer)) {
        return parseStreamingJson(buffer);
      }

      // For smaller buffers, use standard parsing
      return parseJSON(textDecoder.decode(buffer));

    case "CSV":
      return parseCSV(textDecoder.decode(buffer));

    case "XML":
      return parseXML(textDecoder.decode(buffer));

    case "HTML":
      return parseHTML(textDecoder.decode(buffer));

    case "YAML":
      return parseYAML(textDecoder.decode(buffer));

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

    case "BINARY":
      throw new Error("Cannot parse binary file as inline data");

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
        return JSON.parse(textDecoder.decode(buffer));
      } catch {
        return textDecoder.decode(buffer);
      }
  }
}

export function guessContentType(filePath: string): string {
  const lastDot = filePath.lastIndexOf(".");
  const ext = lastDot === -1 ? "" : filePath.slice(lastDot).toLowerCase();
  switch (ext) {
    case ".pdf":
      return "application/pdf";
    case ".csv":
      return "text/csv";
    case ".xml":
      return "application/xml";
    case ".json":
      return "application/json";
    case ".txt":
      return "text/plain";
    case ".zip":
      return "application/zip";
    default:
      return "application/octet-stream";
  }
}

export function contentToBuffer(
  content: string | Uint8Array | unknown,
  fileLookup: Record<string, RuntimeExecutionFile>,
): Uint8Array {
  if (content instanceof Uint8Array) {
    return content;
  }
  if (isRawFileBytes(content)) {
    return new Uint8Array(Buffer.from(content.base64, "base64"));
  }
  if (isRuntimeFilePointer(content)) {
    const file = fileLookup[content.key];
    if (!file) {
      throw new Error(`File reference file::${content.key}.raw could not be resolved.`);
    }
    return file.raw;
  }
  if (isExecutionFileEnvelope(content)) {
    return new Uint8Array(Buffer.from(content.rawBase64, "base64"));
  }
  if (typeof content === "string") {
    return new TextEncoder().encode(content);
  }
  return new TextEncoder().encode(JSON.stringify(content, null, 2));
}
