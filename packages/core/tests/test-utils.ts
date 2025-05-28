import type { DataStore } from "@superglue/shared";
import express from "express";
import fs from "node:fs";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { afterAll, beforeAll } from "vitest";
import { FileStore } from "../datastore/filestore.js";
import { MemoryStore } from "../datastore/memory.js";

/**
 * Creates and manages a mock HTTP server for integration tests
 */
export class MockServerFactory {
  private server: any;
  private baseUrl = "";
  private app = express();

  constructor() {
    this.app.use(express.json());
  }

  addGetRoute(path: string, handler: express.RequestHandler) {
    this.app.get(path, handler);
    return this;
  }

  addPostRoute(path: string, handler: express.RequestHandler) {
    this.app.post(path, handler);
    return this;
  }

  /**
   * Get the Express app to add custom routes
   */
  getApp() {
    return this.app;
  }

  async start(): Promise<string> {
    return new Promise<string>((resolve) => {
      this.server = this.app.listen(0, () => {
        const address = this.server.address() as AddressInfo;
        this.baseUrl = `http://localhost:${address.port}`;
        console.log(`Mock server running at ${this.baseUrl}`);
        resolve(this.baseUrl);
      });
    });
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  stop() {
    if (this.server) {
      this.server.close();
    }
  }

  /**
   * Setup before/after hooks for the mock server
   */
  setupHooks() {
    beforeAll(async () => {
      await this.start();
    });

    afterAll(() => {
      this.stop();
    });
  }
}

/**
 * Factory for data stores used in tests
 */
export class DataStoreFactory {
  private testDir: string;
  private testPath: string;
  private testLogsPath: string;
  private dataStores: { name: string; instance: DataStore }[] = [];

  constructor(testDir = "./.test-data") {
    this.testDir = testDir;
    this.testPath = path.join(testDir, "superglue_data.json");
    this.testLogsPath = path.join(testDir, "superglue_logs.json");
  }

  init() {
    // Clean up any existing test data
    if (fs.existsSync(this.testPath)) {
      fs.unlinkSync(this.testPath);
    }
    if (fs.existsSync(this.testLogsPath)) {
      fs.unlinkSync(this.testLogsPath);
    }
    if (fs.existsSync(this.testDir)) {
      fs.rmdirSync(this.testDir);
    }

    this.dataStores = [
      { name: "FileStore", instance: new FileStore(this.testDir) },
      { name: "MemoryStore", instance: new MemoryStore() },
    ];

    return this.dataStores;
  }

  getInstance(name: "FileStore" | "MemoryStore"): DataStore {
    const store = this.dataStores.find((ds) => ds.name === name);
    if (!store) {
      throw new Error(`Data store "${name}" not found`);
    }
    return store.instance;
  }

  getAllInstances() {
    return this.dataStores;
  }

  async cleanup() {
    for (const { name, instance } of this.dataStores) {
      // Cast to any since clearAll and disconnect are implementation-specific
      if (name === "FileStore") {
        // For FileStore we need to clear all and disconnect
        await (instance as any).clearAll();
        await (instance as any).disconnect();
      }
    }

    // Clean up test files
    if (fs.existsSync(this.testPath)) {
      fs.unlinkSync(this.testPath);
    }
    if (fs.existsSync(this.testLogsPath)) {
      fs.unlinkSync(this.testLogsPath);
    }
    if (fs.existsSync(this.testDir)) {
      fs.rmdirSync(this.testDir);
    }
  }

  /**
   * Setup before/after hooks for the data stores
   */
  setupHooks() {
    beforeAll(() => {
      this.init();
    });

    afterAll(async () => {
      await this.cleanup();
    });
  }

  static createMemoryStore(): DataStore {
    return new MemoryStore();
  }
}

export class EnvVarManager {
  private originalValues: Record<string, string | undefined> = {};

  set(name: string, value: string) {
    if (!(name in this.originalValues)) {
      this.originalValues[name] = process.env[name];
    }
    process.env[name] = value;
  }

  resetAll() {
    for (const [name, value] of Object.entries(this.originalValues)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
    this.originalValues = {};
  }

  setupHooks() {
    afterAll(() => {
      this.resetAll();
    });
  }
}
