import { openDB, IDBPDatabase, DBSchema } from "idb";
import { ToolStep } from "@superglue/shared";
import { deepEqual } from "./general-utils";

const DB_NAME = "superglue";
const DB_VERSION = 1;

interface SuperglueDB extends DBSchema {
  payloads: {
    key: string; // toolId
    value: string; // JSON payload text
  };
  drafts: {
    key: string; // toolId
    value: ToolDraft;
  };
  conversations: {
    key: string; // cache key (hashed)
    value: any; // Conversation[] or other cached data
  };
  cache: {
    key: string; // cache key (hashed)
    value: any; // Generic cached data
  };
  meta: {
    key: string;
    value: any;
  };
}

export interface ToolDraft {
  id: string;
  toolId: string;
  steps: ToolStep[];
  instruction: string;
  outputTransform: string;
  inputSchema: string | null;
  outputSchema: string;
  createdAt: number;
}

let dbPromise: Promise<IDBPDatabase<SuperglueDB>> | null = null;

function getDB(): Promise<IDBPDatabase<SuperglueDB>> {
  if (!dbPromise) {
    dbPromise = openDB<SuperglueDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Create object stores if they don't exist
        if (!db.objectStoreNames.contains("payloads")) {
          db.createObjectStore("payloads");
        }
        if (!db.objectStoreNames.contains("drafts")) {
          db.createObjectStore("drafts");
        }
        if (!db.objectStoreNames.contains("conversations")) {
          db.createObjectStore("conversations");
        }
        if (!db.objectStoreNames.contains("cache")) {
          db.createObjectStore("cache");
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta");
        }
      },
    });
  }
  return dbPromise;
}

// One-time migration from localStorage
let migrationPromise: Promise<void> | null = null;

async function migrateFromLocalStorage(): Promise<void> {
  if (migrationPromise) return migrationPromise;

  migrationPromise = (async () => {
    const db = await getDB();

    // Check if already migrated
    const migrated = await db.get("meta", "migrated-v1");
    if (migrated) return;

    try {
      // Migrate payloads
      const payloadKeys = Object.keys(localStorage).filter((k) =>
        k.startsWith("superglue-payload:"),
      );
      for (const key of payloadKeys) {
        const toolId = key.replace("superglue-payload:", "");
        const value = localStorage.getItem(key);
        if (value) {
          await db.put("payloads", value, toolId);
          localStorage.removeItem(key); // Free up space
        }
      }

      // Migrate cache (includes conversations)
      const cacheKeys = Object.keys(localStorage).filter(
        (k) =>
          k.includes("cache") ||
          (k.startsWith("superglue-") && !k.startsWith("superglue-payload:")),
      );
      for (const key of cacheKeys) {
        const value = localStorage.getItem(key);
        if (value) {
          try {
            const parsed = JSON.parse(value);
            // Store in appropriate store based on key pattern
            if (key.includes("conversation")) {
              await db.put("conversations", parsed, key);
            } else {
              await db.put("cache", parsed, key);
            }
            localStorage.removeItem(key);
          } catch {
            // Invalid JSON, skip
          }
        }
      }

      await db.put("meta", true, "migrated-v1");
    } catch (error) {
      console.error("Migration failed:", error);
      // Don't throw - allow app to continue even if migration fails
    }
  })();

  return migrationPromise;
}

// Ensure migration runs on first access
let migrationInitiated = false;
let cleanupInitiated = false;

function ensureMigration(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (!migrationInitiated) {
    migrationInitiated = true;
    migrateFromLocalStorage().catch(console.error);
  }
  return migrateFromLocalStorage();
}

// Run cleanup once per session after migration
async function ensureCleanup(): Promise<void> {
  if (typeof window === "undefined") return;
  if (cleanupInitiated) return;
  cleanupInitiated = true;

  await ensureMigration();
}

// ===== PAYLOAD STORAGE =====

export async function getPayload(toolId: string): Promise<string | null> {
  if (typeof window === "undefined") return null;
  await ensureMigration();
  const db = await getDB();
  return db.get("payloads", toolId) ?? null;
}

export async function setPayload(toolId: string, payload: string): Promise<void> {
  if (typeof window === "undefined") return;
  await ensureMigration();
  const db = await getDB();
  if (payload.trim() === "") {
    await db.delete("payloads", toolId);
  } else {
    await db.put("payloads", payload, toolId);
  }
}

// ===== DRAFT STORAGE =====

// Event listeners for draft changes
const draftChangeListeners = new Set<(toolId: string) => void>();

export function onDraftChange(fn: (toolId: string) => void): () => void {
  draftChangeListeners.add(fn);
  return () => draftChangeListeners.delete(fn);
}

function notifyDraftChange(toolId: string) {
  draftChangeListeners.forEach((fn) => fn(toolId));
}

export async function getLatestDraft(toolId: string): Promise<ToolDraft | null> {
  if (typeof window === "undefined") return null;
  await ensureMigration();
  const db = await getDB();
  return db.get("drafts", toolId) ?? null;
}

// Normalize draft content for comparison (exclude id, createdAt, toolId)
function getDraftContent(draft: Omit<ToolDraft, "id" | "createdAt">) {
  return {
    steps: draft.steps,
    instruction: draft.instruction,
    outputTransform: draft.outputTransform,
    inputSchema: draft.inputSchema,
    outputSchema: draft.outputSchema,
  };
}

export async function addDraft(
  toolId: string,
  draft: Omit<ToolDraft, "id" | "createdAt">,
): Promise<void> {
  if (typeof window === "undefined") return;

  await ensureMigration();
  const db = await getDB();

  // Check if content differs from existing draft
  const existingDraft = await db.get("drafts", toolId);
  if (existingDraft) {
    const existingContent = getDraftContent(existingDraft);
    const newContent = getDraftContent(draft);
    if (deepEqual(existingContent, newContent)) {
      return;
    }
  }

  const fullDraft: ToolDraft = {
    ...draft,
    id: toolId,
    createdAt: Date.now(),
  };

  // Simply replace the draft for this tool
  await db.put("drafts", fullDraft, toolId);

  // Notify listeners
  notifyDraftChange(toolId);
}

export async function deleteAllDrafts(toolId: string): Promise<void> {
  if (typeof window === "undefined") return;
  await ensureMigration();
  const db = await getDB();

  await db.delete("drafts", toolId);

  // Notify listeners
  notifyDraftChange(toolId);
}

// ===== CACHE STORAGE =====

export async function getCache<T>(key: string): Promise<T | null> {
  if (typeof window === "undefined") return null;
  await ensureMigration();
  const db = await getDB();
  return db.get("cache", key) ?? null;
}

export async function setCache(key: string, data: any): Promise<void> {
  if (typeof window === "undefined") return;
  await ensureMigration();
  const db = await getDB();
  await db.put("cache", data, key);
}

export async function deleteCache(key: string): Promise<void> {
  if (typeof window === "undefined") return;
  await ensureMigration();
  const db = await getDB();
  await db.delete("cache", key);
}

// ===== CONVERSATION STORAGE =====

export async function getConversations<T>(key: string): Promise<T | null> {
  if (typeof window === "undefined") return null;
  await ensureMigration();
  const db = await getDB();
  return db.get("conversations", key) ?? null;
}

export async function setConversations(key: string, data: any): Promise<void> {
  if (typeof window === "undefined") return;
  await ensureMigration();
  const db = await getDB();
  await db.put("conversations", data, key);
}

export async function deleteConversations(key: string): Promise<void> {
  if (typeof window === "undefined") return;
  await ensureMigration();
  const db = await getDB();
  await db.delete("conversations", key);
}
