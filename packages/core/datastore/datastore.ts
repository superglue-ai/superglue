import { EEPostgresService } from "./ee/postgres.js";
import { EEDataStore } from "./ee/types.js";

export function createDataStore(config: { type: "postgres" }): EEDataStore {
  if (config.type === "postgres") {
    const postgresConfig = getPostgresConfig();
    return new EEPostgresService(postgresConfig);
  }
  throw new Error(`Unsupported datastore type: ${config.type}.`);
}

export function getFileStoreConfig() {
  return {
    storageDir: process.env.STORAGE_DIR || "/data",
  };
}

export function getRedisConfig() {
  return {
    host: process.env.REDIS_HOST!,
    port: parseInt(process.env.REDIS_PORT || "6379"),
    username: process.env.REDIS_USERNAME!,
    password: process.env.REDIS_PASSWORD!,
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
