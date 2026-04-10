/**
 * Logging utilities for Deno subprocess
 *
 * Logs are written to stderr as JSON lines, allowing Node.js to parse and forward them.
 * stdout is reserved for the workflow result.
 */

import type { ServiceMetadata } from "../types.ts";

export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  type: "log";
  level: LogLevel;
  message: string;
  timestamp: string;
  traceId?: string;
  orgId?: string;
}

interface CredentialUpdateEntry {
  type: "credential_update";
  systemId: string;
  credentials: Record<string, unknown>;
}

const encoder = new TextEncoder();

/**
 * Write a log entry to stderr
 */
export function log(level: LogLevel, message: string, metadata?: ServiceMetadata): void {
  const entry: LogEntry = {
    type: "log",
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(metadata?.traceId && { traceId: metadata.traceId }),
    ...(metadata?.orgId && { orgId: metadata.orgId }),
  };
  Deno.stderr.writeSync(encoder.encode(JSON.stringify(entry) + "\n"));
}

/**
 * Convenience methods for different log levels
 */
export function debug(message: string, metadata?: ServiceMetadata): void {
  log("debug", message, metadata);
}

export function info(message: string, metadata?: ServiceMetadata): void {
  log("info", message, metadata);
}

export function warn(message: string, metadata?: ServiceMetadata): void {
  log("warn", message, metadata);
}

export function error(message: string, metadata?: ServiceMetadata): void {
  log("error", message, metadata);
}

/**
 * Send a credential update back to Node.js for persistence
 * This is used when OAuth tokens are refreshed during execution
 */
export function sendCredentialUpdate(systemId: string, credentials: Record<string, unknown>): void {
  const entry: CredentialUpdateEntry = {
    type: "credential_update",
    systemId,
    credentials,
  };
  Deno.stderr.writeSync(encoder.encode(JSON.stringify(entry) + "\n"));
}

/**
 * Mask sensitive values in a string for logging
 */
export function maskCredentials(str: string, credentials: Record<string, unknown>): string {
  let masked = str;
  for (const [key, value] of Object.entries(credentials)) {
    if (typeof value === "string" && value.length > 0) {
      // Mask the value, showing only first 4 chars if long enough
      const maskValue = value.length > 8 ? value.slice(0, 4) + "****" : "****";
      masked = masked.replaceAll(value, maskValue);
    }
  }
  return masked;
}
