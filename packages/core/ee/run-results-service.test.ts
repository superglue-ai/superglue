import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { gzip } from "zlib";
import { promisify } from "util";
import {
  RunResultsService,
  generateRunResultsUri,
  getRunResultsService,
} from "./run-results-service.js";
import type { StoredRunResults } from "@superglue/shared";

const gzipAsync = promisify(gzip);

// Mock the file service (but not isFileStorageAvailable - we test the real implementation)
vi.mock("../filestore/file-service.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../filestore/file-service.js")>();
  return {
    ...actual,
    getFileService: vi.fn(),
  };
});

// Mock the logs
vi.mock("../utils/logs.js", () => ({
  logMessage: vi.fn(),
}));

import { getFileService, isFileStorageAvailable } from "../filestore/file-service.js";

describe("RunResultsService", () => {
  let service: RunResultsService;
  let mockFileService: {
    uploadFile: ReturnType<typeof vi.fn>;
    downloadFile: ReturnType<typeof vi.fn>;
    deleteFile: ReturnType<typeof vi.fn>;
    buildStorageUri: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    service = new RunResultsService();
    mockFileService = {
      uploadFile: vi.fn().mockResolvedValue(undefined),
      downloadFile: vi.fn(),
      deleteFile: vi.fn().mockResolvedValue(undefined),
      buildStorageUri: vi.fn(
        (orgId: string, path: string) => `s3://${process.env.AWS_BUCKET_NAME}/${orgId}/${path}`,
      ),
    };
    vi.mocked(getFileService).mockReturnValue(mockFileService as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("storeResults", () => {
    it("should gzip and upload results to S3", async () => {
      const storageUri = "s3://bucket/org/run-results/run-123.json.gz";
      const results = {
        runId: "run-123",
        success: true,
        data: { result: "test" },
        stepResults: [{ stepId: "step-1", success: true, data: { foo: "bar" } }],
        toolPayload: { input: "value" },
      };
      const metadata = { orgId: "test-org" };

      await service.storeResults(storageUri, results, metadata);

      expect(mockFileService.uploadFile).toHaveBeenCalledTimes(1);
      expect(mockFileService.uploadFile).toHaveBeenCalledWith(
        storageUri,
        expect.any(Buffer),
        metadata,
        { contentType: "application/gzip" },
      );

      // Verify the uploaded data is valid gzipped JSON with storedAt added
      const uploadedBuffer = mockFileService.uploadFile.mock.calls[0][1] as Buffer;
      expect(uploadedBuffer).toBeInstanceOf(Buffer);
    });

    it("should add storedAt timestamp to results", async () => {
      const storageUri = "s3://bucket/org/run-results/run-123.json.gz";
      const results = {
        runId: "run-123",
        success: true,
        data: null,
        stepResults: [],
        toolPayload: {},
      };

      // Capture the uploaded buffer to verify storedAt
      let capturedBuffer: Buffer | null = null;
      mockFileService.uploadFile.mockImplementation(async (uri: string, buffer: Buffer) => {
        capturedBuffer = buffer;
      });

      const beforeStore = new Date();
      await service.storeResults(storageUri, results, { orgId: "test-org" });
      const afterStore = new Date();

      // Decompress and parse to verify storedAt
      const { gunzip } = await import("zlib");
      const gunzipAsync = promisify(gunzip);
      const decompressed = await gunzipAsync(capturedBuffer!);
      const parsed = JSON.parse(decompressed.toString("utf-8"));

      expect(parsed.storedAt).toBeDefined();
      const storedAt = new Date(parsed.storedAt);
      expect(storedAt.getTime()).toBeGreaterThanOrEqual(beforeStore.getTime());
      expect(storedAt.getTime()).toBeLessThanOrEqual(afterStore.getTime());
    });
  });

  describe("getResults", () => {
    it("should download and decompress results from S3", async () => {
      const storageUri = "s3://bucket/org/run-results/run-123.json.gz";
      const storedData: StoredRunResults = {
        runId: "run-123",
        success: true,
        data: { result: "test" },
        stepResults: [{ stepId: "step-1", success: true, data: { foo: "bar" } }],
        toolPayload: { input: "value" },
        storedAt: new Date("2024-01-15T10:00:00Z"),
      };

      // Compress the data as it would be stored
      const compressed = await gzipAsync(Buffer.from(JSON.stringify(storedData), "utf-8"));
      mockFileService.downloadFile.mockResolvedValue(compressed);

      const result = await service.getResults(storageUri, { orgId: "test-org" });

      expect(mockFileService.downloadFile).toHaveBeenCalledWith(storageUri, { orgId: "test-org" });
      expect(result).not.toBeNull();
      expect(result!.runId).toBe("run-123");
      expect(result!.success).toBe(true);
      expect(result!.data).toEqual({ result: "test" });
      expect(result!.stepResults).toHaveLength(1);
      expect(result!.toolPayload).toEqual({ input: "value" });
    });

    it("should parse storedAt string back to Date", async () => {
      const storageUri = "s3://bucket/org/run-results/run-123.json.gz";
      const storedData = {
        runId: "run-123",
        success: true,
        data: null,
        stepResults: [],
        toolPayload: {},
        storedAt: "2024-01-15T10:00:00.000Z", // String as stored in JSON
      };

      const compressed = await gzipAsync(Buffer.from(JSON.stringify(storedData), "utf-8"));
      mockFileService.downloadFile.mockResolvedValue(compressed);

      const result = await service.getResults(storageUri, { orgId: "test-org" });

      expect(result!.storedAt).toBeInstanceOf(Date);
      expect(result!.storedAt.toISOString()).toBe("2024-01-15T10:00:00.000Z");
    });

    it("should return null when file not found", async () => {
      const storageUri = "s3://bucket/org/run-results/missing.json.gz";
      mockFileService.downloadFile.mockRejectedValue(
        new Error("NoSuchKey: The specified key does not exist"),
      );

      const result = await service.getResults(storageUri, { orgId: "test-org" });

      expect(result).toBeNull();
    });

    it("should return null when file is corrupted", async () => {
      const storageUri = "s3://bucket/org/run-results/corrupted.json.gz";
      // Return invalid gzip data
      mockFileService.downloadFile.mockResolvedValue(Buffer.from("not gzipped data"));

      const result = await service.getResults(storageUri, { orgId: "test-org" });

      expect(result).toBeNull();
    });

    it("should return null when JSON is invalid", async () => {
      const storageUri = "s3://bucket/org/run-results/bad-json.json.gz";
      // Return valid gzip but invalid JSON
      const compressed = await gzipAsync(Buffer.from("{ invalid json }", "utf-8"));
      mockFileService.downloadFile.mockResolvedValue(compressed);

      const result = await service.getResults(storageUri, { orgId: "test-org" });

      expect(result).toBeNull();
    });
  });

  describe("deleteResults", () => {
    it("should delete file from S3", async () => {
      const storageUri = "s3://bucket/org/run-results/run-123.json.gz";

      await service.deleteResults(storageUri, { orgId: "test-org" });

      expect(mockFileService.deleteFile).toHaveBeenCalledWith(storageUri, { orgId: "test-org" });
    });

    it("should handle delete errors gracefully", async () => {
      const storageUri = "s3://bucket/org/run-results/run-123.json.gz";
      mockFileService.deleteFile.mockRejectedValue(new Error("Access denied"));

      // Should not throw
      await expect(
        service.deleteResults(storageUri, { orgId: "test-org" }),
      ).resolves.toBeUndefined();
    });
  });

  describe("gzip/gunzip roundtrip", () => {
    it("should preserve all data through store/retrieve cycle", async () => {
      const storageUri = "s3://bucket/org/run-results/roundtrip.json.gz";
      const originalResults = {
        runId: "roundtrip-test",
        success: false,
        data: {
          nested: { deeply: { value: 123 } },
          array: [1, 2, 3],
          nullValue: null,
          unicode: "日本語テスト 🎉",
        },
        stepResults: [
          { stepId: "step-1", success: true, data: { a: 1 } },
          { stepId: "step-2", success: false, data: null, error: "Something failed" },
        ],
        toolPayload: { query: "test", options: { limit: 10 } },
        error: "Overall error message",
      };

      // Capture uploaded data
      let uploadedBuffer: Buffer | null = null;
      mockFileService.uploadFile.mockImplementation(async (_uri: string, buffer: Buffer) => {
        uploadedBuffer = buffer;
      });

      // Store
      await service.storeResults(storageUri, originalResults, { orgId: "test-org" });

      // Simulate retrieval by returning the captured buffer
      mockFileService.downloadFile.mockResolvedValue(uploadedBuffer!);

      // Retrieve
      const retrieved = await service.getResults(storageUri, { orgId: "test-org" });

      // Verify all fields preserved (except storedAt which is added)
      expect(retrieved).not.toBeNull();
      expect(retrieved!.runId).toBe(originalResults.runId);
      expect(retrieved!.success).toBe(originalResults.success);
      expect(retrieved!.data).toEqual(originalResults.data);
      expect(retrieved!.stepResults).toEqual(originalResults.stepResults);
      expect(retrieved!.toolPayload).toEqual(originalResults.toolPayload);
      expect(retrieved!.error).toBe(originalResults.error);
      expect(retrieved!.storedAt).toBeInstanceOf(Date);
    });
  });
});

describe("generateRunResultsUri", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv.AWS_BUCKET_NAME = process.env.AWS_BUCKET_NAME;
    savedEnv.MINIO_BUCKET_NAME = process.env.MINIO_BUCKET_NAME;
    savedEnv.FILE_STORAGE_PROVIDER = process.env.FILE_STORAGE_PROVIDER;
    delete process.env.AWS_BUCKET_NAME;
    delete process.env.MINIO_BUCKET_NAME;
    delete process.env.FILE_STORAGE_PROVIDER;
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value !== undefined) {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
  });

  it("should generate correct S3 URI when bucket is configured", () => {
    process.env.AWS_BUCKET_NAME = "my-bucket";

    const uri = generateRunResultsUri("run-123", "org-456");

    expect(uri).toBe("s3://my-bucket/org-456/run-results/run-123.json.gz");
  });

  it("should return null when no bucket is configured", () => {
    const uri = generateRunResultsUri("run-123", "org-456");

    expect(uri).toBeNull();
  });

  it("should handle empty org ID", () => {
    process.env.AWS_BUCKET_NAME = "my-bucket";

    const uri = generateRunResultsUri("run-123", "");

    expect(uri).toBe("s3://my-bucket//run-results/run-123.json.gz");
  });
});

describe("isFileStorageAvailable", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv.AWS_BUCKET_NAME = process.env.AWS_BUCKET_NAME;
    savedEnv.MINIO_BUCKET_NAME = process.env.MINIO_BUCKET_NAME;
    savedEnv.FILE_STORAGE_PROVIDER = process.env.FILE_STORAGE_PROVIDER;
    delete process.env.AWS_BUCKET_NAME;
    delete process.env.MINIO_BUCKET_NAME;
    delete process.env.FILE_STORAGE_PROVIDER;
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value !== undefined) {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
  });

  it("should return true when AWS_BUCKET_NAME is set", () => {
    process.env.AWS_BUCKET_NAME = "my-bucket";

    expect(isFileStorageAvailable()).toBe(true);
  });

  it("should return true when MINIO_BUCKET_NAME is set with minio provider", () => {
    process.env.FILE_STORAGE_PROVIDER = "minio";
    process.env.MINIO_BUCKET_NAME = "my-minio-bucket";

    expect(isFileStorageAvailable()).toBe(true);
  });

  it("should return false when no bucket env vars are set", () => {
    expect(isFileStorageAvailable()).toBe(false);
  });

  it("should return false when AWS_BUCKET_NAME is empty string", () => {
    process.env.AWS_BUCKET_NAME = "";

    expect(isFileStorageAvailable()).toBe(false);
  });

  it("should return false when minio provider but MINIO_BUCKET_NAME is empty", () => {
    process.env.FILE_STORAGE_PROVIDER = "minio";
    process.env.MINIO_BUCKET_NAME = "";

    expect(isFileStorageAvailable()).toBe(false);
  });
});
