/**
 * IPC utilities for Deno subprocess communication
 *
 * Uses MessagePack for efficient binary serialization over stdin/stdout.
 */

import { decode, encode } from "@msgpack/msgpack";
import type { WorkflowPayload, WorkflowResult } from "../types.ts";

/**
 * Read the workflow payload from stdin (MessagePack encoded)
 */
export async function readPayload(): Promise<WorkflowPayload> {
  const chunks: Uint8Array[] = [];

  // Read all data from stdin
  const reader = Deno.stdin.readable.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  // Concatenate chunks
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  // Decode MessagePack
  return decode(combined) as WorkflowPayload;
}

/**
 * Write the workflow result to stdout (MessagePack encoded)
 */
export async function writeResult(result: WorkflowResult): Promise<void> {
  const encoded = encode(result);

  // For small payloads, use sync write for reliability
  if (encoded.length < 1024 * 1024) {
    // Less than 1MB - use sync write
    let offset = 0;
    while (offset < encoded.length) {
      const written = Deno.stdout.writeSync(encoded.subarray(offset));
      offset += written;
    }
  } else {
    const chunkSize = 64 * 1024;
    for (let offset = 0; offset < encoded.length; offset += chunkSize) {
      const chunk = encoded.subarray(offset, Math.min(offset + chunkSize, encoded.length));
      let written = 0;
      while (written < chunk.length) {
        written += await Deno.stdout.write(chunk.subarray(written));
      }
    }
  }

  // Close stdout to signal EOF to the parent process
  Deno.stdout.close();
}

/**
 * Concatenate multiple Uint8Arrays
 */
export function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}
