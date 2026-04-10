import { EEPostgresService } from "./ee/postgres.js";
import { EEDataStore } from "./ee/types.js";

let _dataStore: EEDataStore | null = null;

export async function createDataStore(config: { type: "postgres" }): Promise<EEDataStore> {
  if (config.type === "postgres") {
    const postgresConfig = getPostgresConfig();
    _dataStore = new EEPostgresService(postgresConfig);
    await _dataStore.ready();
    return _dataStore;
  }
  throw new Error(`Unsupported datastore type: ${config.type}.`);
}

/**
 * Get the singleton datastore instance.
 * Must be called after createDataStore() has been invoked.
 */
export function getDataStore(): EEDataStore {
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
