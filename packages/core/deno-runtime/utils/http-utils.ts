import { Buffer } from "node:buffer";
import type {
  RawFileBytes,
  RuntimeExecutionFile,
  RuntimeFilePointer,
  SupportedFileType,
} from "../types.ts";
import {
  isExecutionFileEnvelope,
  isRawFileBytes,
  isRuntimeFilePointer,
  isBinaryFileType,
  detectFileType,
} from "./files.ts";

export function convertBasicAuthToBase64(headerValue: string): string {
  if (!headerValue) return headerValue;
  const credentials = headerValue.substring("Basic ".length).trim();
  const seemsEncoded = /^[A-Za-z0-9+/=]+$/.test(credentials);

  if (!seemsEncoded) {
    const base64Credentials = btoa(credentials);
    return `Basic ${base64Credentials}`;
  }
  return headerValue;
}

export function getValueByPath(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== "object") return undefined;

  const record = obj as Record<string, unknown>;
  if (path in record) {
    return record[path];
  }

  const parts = path.replace(/^\$\.?/, "").split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

export function getHeaderValue(
  headers: Record<string, string>,
  headerName: string,
): string | undefined {
  const normalizedName = headerName.toLowerCase();
  const matchingEntry = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === normalizedName,
  );
  return matchingEntry?.[1];
}

export function removeHeader(
  headers: Record<string, string>,
  headerName: string,
): Record<string, string> {
  const normalizedName = headerName.toLowerCase();
  return Object.fromEntries(
    Object.entries(headers).filter(([key]) => key.toLowerCase() !== normalizedName),
  );
}

export function isMultipartFormDataRequest(headers: Record<string, string>): boolean {
  const contentType = getHeaderValue(headers, "content-type");
  return contentType?.toLowerCase().startsWith("multipart/form-data") === true;
}

function tryResolveMultipartFilePart(
  value: unknown,
  fileLookup: Record<string, RuntimeExecutionFile>,
): { bytes: Uint8Array; filename: string; contentType: string } | null {
  if (isRuntimeFilePointer(value)) {
    const file = fileLookup[value.key];
    if (!file) {
      throw new Error(`File reference file::${value.key}.raw could not be resolved.`);
    }
    return {
      bytes: file.raw,
      filename: file.filename,
      contentType: file.contentType,
    };
  }

  if (isRawFileBytes(value)) {
    return {
      bytes: new Uint8Array(Buffer.from(value.base64, "base64")),
      filename: value.filename,
      contentType: value.contentType,
    };
  }

  if (isExecutionFileEnvelope(value)) {
    return {
      bytes: new Uint8Array(Buffer.from(value.rawBase64, "base64")),
      filename: value.filename,
      contentType: value.contentType,
    };
  }

  return null;
}

function containsMultipartBinaryValue(
  value: unknown,
  fileLookup: Record<string, RuntimeExecutionFile>,
): boolean {
  if (tryResolveMultipartFilePart(value, fileLookup)) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.some((item) => containsMultipartBinaryValue(item, fileLookup));
  }

  if (value !== null && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((item) =>
      containsMultipartBinaryValue(item, fileLookup),
    );
  }

  return false;
}

function appendMultipartField(params: {
  formData: FormData;
  fieldName: string;
  value: unknown;
  fileLookup: Record<string, RuntimeExecutionFile>;
}): void {
  const { formData, fieldName, value, fileLookup } = params;

  if (value === undefined) {
    return;
  }

  const filePart = tryResolveMultipartFilePart(value, fileLookup);
  if (filePart) {
    formData.append(
      fieldName,
      new Blob([filePart.bytes], { type: filePart.contentType || "application/octet-stream" }),
      filePart.filename,
    );
    return;
  }

  if (Array.isArray(value)) {
    if (value.some((item) => containsMultipartBinaryValue(item, fileLookup))) {
      for (const item of value) {
        if (
          item !== null &&
          typeof item === "object" &&
          !Array.isArray(item) &&
          !tryResolveMultipartFilePart(item, fileLookup) &&
          containsMultipartBinaryValue(item, fileLookup)
        ) {
          throw new Error(
            `Multipart form-data field '${fieldName}' contains nested file references. File references must be the entire field value or array item.`,
          );
        }
        appendMultipartField({ formData, fieldName, value: item, fileLookup });
      }
      return;
    }

    formData.append(fieldName, JSON.stringify(value));
    return;
  }

  if (value !== null && typeof value === "object") {
    if (containsMultipartBinaryValue(value, fileLookup)) {
      throw new Error(
        `Multipart form-data field '${fieldName}' contains nested file references. File references must be the entire field value.`,
      );
    }

    formData.append(fieldName, JSON.stringify(value));
    return;
  }

  if (typeof value === "string") {
    formData.append(fieldName, value);
    return;
  }

  formData.append(fieldName, String(value));
}

export function buildMultipartFormData(
  body: unknown,
  fileLookup: Record<string, RuntimeExecutionFile>,
): FormData {
  if (
    body === null ||
    body === undefined ||
    Array.isArray(body) ||
    typeof body !== "object" ||
    isRawFileBytes(body) ||
    isRuntimeFilePointer(body) ||
    isExecutionFileEnvelope(body)
  ) {
    throw new Error(
      "multipart/form-data request body must resolve to a JSON object of form fields.",
    );
  }

  const formData = new FormData();
  for (const [fieldName, fieldValue] of Object.entries(body as Record<string, unknown>)) {
    appendMultipartField({
      formData,
      fieldName,
      value: fieldValue,
      fileLookup,
    });
  }

  return formData;
}

function hasAttachmentDisposition(response: Response): boolean {
  const disposition = response.headers.get("content-disposition")?.toLowerCase() || "";
  return disposition.includes("attachment") || disposition.includes("filename=");
}

function isOctetStreamResponse(response: Response): boolean {
  const contentType = response.headers.get("content-type")?.toLowerCase() || "";
  const mimeType = contentType.split(";")[0]?.trim() || "";
  return mimeType === "application/octet-stream";
}

function isClearlyTextLikeResponse(response: Response): boolean {
  const contentType = response.headers.get("content-type")?.toLowerCase() || "";
  const mimeType = contentType.split(";")[0]?.trim() || "";

  if (!mimeType) {
    return false;
  }

  return (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType.endsWith("+json") ||
    mimeType === "application/xml" ||
    mimeType === "text/xml" ||
    mimeType.endsWith("+xml") ||
    mimeType === "text/csv" ||
    mimeType === "application/csv"
  );
}

function getResponseSizeBytes(response: Response, responseBytes: Uint8Array): number {
  const contentLengthHeader = response.headers.get("content-length");
  if (!contentLengthHeader) {
    return responseBytes.length;
  }

  const parsedContentLength = Number.parseInt(contentLengthHeader, 10);
  if (!Number.isFinite(parsedContentLength) || parsedContentLength < 0) {
    return responseBytes.length;
  }

  return parsedContentLength;
}

function concatResponseChunks(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  return combined;
}

export async function readResponseBytes(response: Response): Promise<Uint8Array> {
  if (!response.body) {
    return new Uint8Array();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (value && value.length > 0) {
        // Copy each chunk so downstream detection never depends on a fetch-owned buffer.
        chunks.push(value.slice());
      }
    }
  } finally {
    reader.releaseLock();
  }

  return concatResponseChunks(chunks);
}

const LARGE_HTTP_RESPONSE_FILE_THRESHOLD_BYTES = 25 * 1024 * 1024;

export function shouldTreatHttpResponseAsFile(params: {
  response: Response;
  detectedType: Awaited<ReturnType<typeof detectFileType>>;
  responseBytes: Uint8Array;
}): boolean {
  const { response, detectedType, responseBytes } = params;

  if (isBinaryFileType(detectedType)) {
    return true;
  }

  if (hasAttachmentDisposition(response)) {
    return true;
  }

  if (isOctetStreamResponse(response)) {
    return true;
  }

  return (
    detectedType === "RAW" &&
    getResponseSizeBytes(response, responseBytes) > LARGE_HTTP_RESPONSE_FILE_THRESHOLD_BYTES &&
    !isClearlyTextLikeResponse(response)
  );
}

export function deriveResponseFilename(response: Response, fallbackUrl: string): string {
  const disposition = response.headers.get("content-disposition") || "";
  const filenameMatch = disposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
  if (filenameMatch?.[1]) {
    return decodeURIComponent(filenameMatch[1].replace(/"/g, ""));
  }

  try {
    const parsedUrl = new URL(fallbackUrl);
    const pathname = parsedUrl.pathname;
    const lastSegment = pathname.split("/").filter(Boolean).pop();
    if (lastSegment) {
      return decodeURIComponent(lastSegment);
    }
  } catch {
    // ignore
  }

  return "response_file";
}

export function resolveBodyForFetch(params: {
  resolvedBody: unknown;
  processedHeaders: Record<string, string>;
  fileLookup: Record<string, RuntimeExecutionFile>;
  fetchOptions: RequestInit;
}): void {
  const { resolvedBody, processedHeaders, fileLookup, fetchOptions } = params;

  if (isMultipartFormDataRequest(processedHeaders)) {
    fetchOptions.body = buildMultipartFormData(resolvedBody, fileLookup);
    fetchOptions.headers = removeHeader(
      fetchOptions.headers as Record<string, string>,
      "content-type",
    );
  } else if (isRawFileBytes(resolvedBody)) {
    fetchOptions.body = new Uint8Array(Buffer.from(resolvedBody.base64, "base64"));
    if (!getHeaderValue(processedHeaders, "content-type")) {
      fetchOptions.headers = {
        ...(fetchOptions.headers as Record<string, string>),
        "Content-Type": resolvedBody.contentType,
      };
    }
  } else if (isRuntimeFilePointer(resolvedBody)) {
    const file = fileLookup[resolvedBody.key];
    if (!file) {
      throw new Error(`File reference file::${resolvedBody.key}.raw could not be resolved.`);
    }
    fetchOptions.body = file.raw;
    if (!getHeaderValue(processedHeaders, "content-type")) {
      fetchOptions.headers = {
        ...(fetchOptions.headers as Record<string, string>),
        "Content-Type": file.contentType,
      };
    }
  } else if (isExecutionFileEnvelope(resolvedBody)) {
    fetchOptions.body = new Uint8Array(Buffer.from(resolvedBody.rawBase64, "base64"));
    if (!getHeaderValue(processedHeaders, "content-type")) {
      fetchOptions.headers = {
        ...(fetchOptions.headers as Record<string, string>),
        "Content-Type": resolvedBody.contentType,
      };
    }
  } else if (typeof resolvedBody === "string") {
    fetchOptions.body = resolvedBody;
  } else {
    fetchOptions.body = JSON.stringify(resolvedBody);
  }
}
