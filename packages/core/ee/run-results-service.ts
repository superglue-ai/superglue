import { gzip, gunzip } from "zlib";
import { promisify } from "util";
import { getFileService } from "../filestore/file-service.js";
import { ServiceMetadata, StoredRunResults } from "@superglue/shared";
import { logMessage } from "../utils/logs.js";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

/**
 * Generate a deterministic storage URI for run results.
 * This allows us to know the URI upfront before uploading.
 */
export function generateRunResultsUri(runId: string, orgId: string): string | null {
  const bucketName = process.env.AWS_BUCKET_NAME;
  if (!bucketName) return null;
  return `s3://${bucketName}/${orgId}/run-results/${runId}.json.gz`;
}

export class RunResultsService {
  /**
   * Store run results to S3 (gzipped) at the given URI
   */
  async storeResults(
    storageUri: string,
    results: Omit<StoredRunResults, "storedAt">,
    metadata: ServiceMetadata,
  ): Promise<void> {
    const fileService = getFileService();

    const payload: StoredRunResults = {
      ...results,
      storedAt: new Date(),
    };

    const json = JSON.stringify(payload);
    const compressed = await gzipAsync(Buffer.from(json, "utf-8"));

    await fileService.uploadFile(storageUri, compressed, metadata, {
      contentType: "application/gzip",
    });

    logMessage("debug", `Stored run results to ${storageUri}`, metadata);
  }

  /**
   * Retrieve run results from S3
   */
  async getResults(
    storageUri: string,
    metadata: ServiceMetadata,
  ): Promise<StoredRunResults | null> {
    try {
      const fileService = getFileService();
      const compressed = await fileService.downloadFile(storageUri, metadata);
      const json = await gunzipAsync(compressed);
      const results = JSON.parse(json.toString("utf-8")) as StoredRunResults;

      // Parse storedAt back to Date
      if (results.storedAt && typeof results.storedAt === "string") {
        results.storedAt = new Date(results.storedAt);
      }

      return results;
    } catch (error) {
      logMessage("warn", `Failed to retrieve run results from ${storageUri}: ${error}`, metadata);
      return null;
    }
  }

  /**
   * Delete stored results
   */
  async deleteResults(storageUri: string, metadata: ServiceMetadata): Promise<void> {
    try {
      const fileService = getFileService();
      await fileService.deleteFile(storageUri, metadata);
      logMessage("debug", `Deleted run results at ${storageUri}`, metadata);
    } catch (error) {
      logMessage("warn", `Failed to delete run results from ${storageUri}: ${error}`, metadata);
    }
  }
}

// Singleton
let _runResultsService: RunResultsService | null = null;

export function getRunResultsService(): RunResultsService {
  if (!_runResultsService) {
    _runResultsService = new RunResultsService();
  }
  return _runResultsService;
}

/**
 * Check if S3 infrastructure is available (EE feature)
 * Returns true if AWS bucket is configured
 */
export function isS3StorageAvailable(): boolean {
  return !!process.env.AWS_BUCKET_NAME;
}
