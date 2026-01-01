import { SupportedFileType } from "@superglue/shared";
import { promisify } from "util";
import { gunzip } from "zlib";
import { DetectionPriority, FileParsingStrategy } from "../strategy.js";

const gunzipAsync = promisify(gunzip);

type ParseFileFunction = (buffer: Buffer, fileType: SupportedFileType) => Promise<any>;

// Store parseFile function to avoid circular import (set by index.ts)
let parseFileFunction: ParseFileFunction | null = null;

export function setGzipParseFileFunction(fn: ParseFileFunction): void {
  parseFileFunction = fn;
}

export class GZIPStrategy implements FileParsingStrategy {
  readonly fileType = SupportedFileType.RAW; // GZIP is a container, not a final type
  readonly priority = DetectionPriority.GZIP;

  canHandle(buffer: Buffer): boolean {
    // GZIP files start with 1f8b signature
    if (buffer.length < 2) return false;
    const signature = buffer.subarray(0, 2).toString("hex");
    return signature === "1f8b";
  }

  async parse(buffer: Buffer): Promise<any> {
    return parseGZIP(buffer);
  }
}

export async function parseGZIP(buffer: Buffer): Promise<any> {
  const decompressed = await gunzipAsync(buffer);

  // Recursively parse the decompressed content using the injected parseFile function
  if (parseFileFunction) {
    return parseFileFunction(decompressed, SupportedFileType.AUTO);
  }

  // Fallback: return raw buffer if parseFile function not set
  return decompressed;
}
