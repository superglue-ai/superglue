import { PostgresService } from "./postgres.js";
import type { DataStore } from "./types.js";

let _dataStore: DataStore | null = null;

export async function createDataStore(config: { type: "postgres" }): Promise<DataStore> {
  if (config.type === "postgres") {
    const postgresConfig = getPostgresConfig();
    _dataStore = new PostgresService(postgresConfig);
    await _dataStore.ready();
    return _dataStore;
  }
  throw new Error(`Unsupported datastore type: ${config.type}.`);
}

export function getDataStore(): DataStore {
  if (!_dataStore) {
    throw new Error("DataStore not initialized. Call createDataStore() first.");
  }
  return _dataStore;
}

export function getFileStoreConfig() {
  return {
    storageDir: process.env.STORAGE_DIR || "/data",
  };
}

export function getPostgresConfig() {
  return {
    host: process.env.POSTGRES_HOST!,
    port: parseInt(process.env.POSTGRES_PORT || "5432"),
    user: process.env.POSTGRES_USERNAME!,
    password: process.env.POSTGRES_PASSWORD!,
    database: process.env.POSTGRES_DB!,
    ssl: process.env.POSTGRES_SSL === "false" ? false : true,
  };
}
