import { ServiceMetadata } from "@superglue/shared";
import { S3FileService } from "./s3-file-service.js";

export interface FileService {
  /**
   * Generate a presigned URL for uploading a file
   */
  generateUploadUrl(
    fileId: string,
    originalFileName: string,
    serviceMetadata: ServiceMetadata,
    metadata?: Record<string, any>,
  ): Promise<{ uploadUrl: string; expiresIn: number; storageUri: string }>;

  /**
   * Process a file (download, parse, and upload processed version)
   */
  processFile(
    storageUri: string,
    serviceMetadata: ServiceMetadata,
  ): Promise<{ processedContent: string; processedStorageUri: string }>;

  /**
   * Delete a file from storage
   */
  deleteFile(storageUri: string, serviceMetadata: ServiceMetadata): Promise<void>;

  /**
   * Download a file from storage
   */
  downloadFile(storageUri: string, serviceMetadata: ServiceMetadata): Promise<Buffer>;

  /**
   * Upload a file directly to storage
   */
  uploadFile(
    storageUri: string,
    content: string | Buffer | Uint8Array,
    serviceMetadata: ServiceMetadata,
    options?: {
      contentType?: string;
      metadata?: Record<string, string>;
    },
  ): Promise<void>;
}

export class FileServiceFactory {
  static create(): FileService {
    const provider = (process.env.FILE_STORAGE_PROVIDER || "aws").toLowerCase();

    switch (provider) {
      case "aws":
        return new S3FileService();
      // Future providers can be added here:
      // case 'azure':
      //   return new AzureBlobFileService();
      // case 'gcp':
      //   return new GcsFileService();
      default:
        throw new Error(`Unsupported file storage provider: ${provider}`);
    }
  }
}

// Lazy-initialize file service to avoid throwing at module load time (e.g., in tests without AWS creds)
let _fileService: FileService | null = null;
export function getFileService(): FileService {
  if (!_fileService) {
    _fileService = FileServiceFactory.create();
  }
  return _fileService;
}

/**
 * Check if cloud file storage is available (e.g., S3 bucket configured)
 */
export function isFileStorageAvailable(): boolean {
  return !!process.env.AWS_BUCKET_NAME;
}
