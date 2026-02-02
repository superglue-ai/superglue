import { ServiceMetadata } from "@superglue/shared";
import { parseFile } from "../files/index.js";
import { logMessage } from "../utils/logs.js";
import { server_defaults } from "../default.js";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { FileService } from "./file-service.js";

export class S3FileService implements FileService {
  private s3Client: S3Client;
  private bucketName: string;
  private bucketPrefix: string;
  private expirationSeconds: number = 15 * 60; // 15 minutes
  private maxFileSize: number;

  constructor() {
    // Initialize S3 client
    const region = process.env.AWS_REGION || "us-east-1";
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const sessionToken = process.env.AWS_SESSION_TOKEN;

    if (!accessKeyId || !secretAccessKey) {
      throw new Error("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set");
    }

    this.bucketName = process.env.AWS_BUCKET_NAME || "";
    if (!this.bucketName) {
      throw new Error("AWS_BUCKET_NAME must be set");
    }

    this.s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
        ...(sessionToken && { sessionToken }),
      },
    });

    this.maxFileSize = server_defaults.FILE_PROCESSING.MAX_FILE_SIZE_BYTES;

    // Get bucket prefix for raw files (optional, defaults to empty string)
    const prefix = process.env.AWS_BUCKET_PREFIX || "";
    // Normalize prefix: remove leading/trailing slashes, then add trailing slash if not empty
    this.bucketPrefix = prefix ? prefix.replace(/^\/+|\/+$/g, "") + "/" : "";
  }

  async generateUploadUrl(
    fileId: string,
    originalFileName: string,
    serviceMetadata: ServiceMetadata,
    metadata?: Record<string, any>,
  ): Promise<{ uploadUrl: string; expiresIn: number; storageUri: string }> {
    const orgId = serviceMetadata.orgId || "";
    if (!orgId) {
      throw new Error("orgId is required in serviceMetadata");
    }

    // Extract file extension from original filename
    const lastDotIndex = originalFileName.lastIndexOf(".");
    if (lastDotIndex === -1 || lastDotIndex === originalFileName.length - 1) {
      throw new Error(
        "File must have a valid extension. Only files with extensions are supported.",
      );
    }
    const extension = originalFileName.slice(lastDotIndex + 1);
    const filename = extension ? `${fileId}.${extension}` : fileId;
    // Construct key with org_id, prefix, and filename: org_id/prefix/filename
    const key = `${orgId}/${this.bucketPrefix}${filename}`;

    // Construct storage URI: s3://bucket-name/org-id/prefix/file-id.ext
    const storageUri = `s3://${this.bucketName}/${key}`;

    // Prepare metadata for blob storage service
    const blobMetadata: Record<string, string> = {};
    if (metadata) {
      for (const [key, value] of Object.entries(metadata)) {
        // Skip ContentType and ContentLength as they're handled separately
        if (key !== "ContentType" && key !== "ContentLength") {
          blobMetadata[key] = String(value);
        }
      }
    }
    // Add original filename to metadata
    blobMetadata["original-filename"] = originalFileName;

    const uploadUrl = await this.generatePresignedUrl(key, {
      expiresIn: this.expirationSeconds,
      contentType: metadata?.ContentType,
      contentLength: metadata?.ContentLength,
      metadata: blobMetadata,
    });

    return {
      uploadUrl,
      expiresIn: this.expirationSeconds,
      storageUri,
    };
  }

  async processFile(
    storageUri: string,
    serviceMetadata: ServiceMetadata,
  ): Promise<{ processedContent: string; processedStorageUri: string }> {
    // Parse storage URI: s3://bucket-name/path/to/file
    const uriMatch = storageUri.match(/^s3:\/\/([^\/]+)\/(.+)$/);
    if (!uriMatch) {
      throw new Error(`Invalid storage URI format: ${storageUri}`);
    }

    const [, bucket, key] = uriMatch;
    if (bucket !== this.bucketName) {
      throw new Error(`Bucket mismatch: expected ${this.bucketName}, got ${bucket}`);
    }

    // Download file from blob storage
    const buffer = await this.downloadObject(key);

    // Validate file size
    if (buffer.length > this.maxFileSize) {
      throw new Error(
        `File size ${buffer.length} exceeds maximum allowed size ${this.maxFileSize}`,
      );
    }

    // Extract file extension from key
    const filename = key.split("/").pop() || "";
    const extension = filename.split(".").pop()?.toLowerCase() || "";

    // Define skip list - files that should be copied, not parsed
    const skipList = ["txt", "json", "js", "py"];
    const shouldSkipParsing = skipList.includes(extension);

    let processedContent: string;

    if (shouldSkipParsing) {
      // For text-based files, use content as-is
      processedContent = buffer.toString("utf8");
    } else {
      // Parse the file
      const parsedData = await parseFile(buffer);

      // Convert parsed result to string
      if (typeof parsedData === "string") {
        processedContent = parsedData;
      } else if (typeof parsedData === "object" && parsedData !== null) {
        processedContent = JSON.stringify(parsedData, null, 2);
      } else {
        processedContent = String(parsedData);
      }
    }

    // Detect file type from content for security check
    const detectedType = await this.detectFileTypeFromContent(buffer);
    if (detectedType && extension && !this.isExtensionMatch(extension, detectedType)) {
      logMessage(
        "warn",
        `File type mismatch: extension .${extension} but content detected as ${detectedType}`,
        serviceMetadata,
      );
    }

    // Construct processed storage URI
    // Replace prefix segment with 'processed' and change extension to '.txt'
    // Key format: orgId/prefix/filename.ext
    // Processed format: orgId/processed/filename.txt
    const pathParts = key.split("/");
    const orgId = pathParts[0];
    const lastDotIndex = filename.lastIndexOf(".");
    const filenameWithoutExt = lastDotIndex === -1 ? filename : filename.slice(0, lastDotIndex);
    // Reconstruct path with 'processed' instead of original prefix
    const processedKey = `${orgId}/processed/${filenameWithoutExt}.txt`;
    const processedStorageUri = `s3://${bucket}/${processedKey}`;

    // Upload processed content to blob storage
    await this.uploadObject(processedKey, processedContent, {
      contentType: "text/plain",
    });

    return {
      processedContent,
      processedStorageUri,
    };
  }

  async deleteFile(storageUri: string, serviceMetadata: ServiceMetadata): Promise<void> {
    // Parse storage URI: s3://bucket-name/path/to/file
    const uriMatch = storageUri.match(/^s3:\/\/([^\/]+)\/(.+)$/);
    if (!uriMatch) {
      throw new Error(`Invalid storage URI format: ${storageUri}`);
    }

    const [, bucket, key] = uriMatch;
    if (bucket !== this.bucketName) {
      throw new Error(`Bucket mismatch: expected ${this.bucketName}, got ${bucket}`);
    }

    await this.deleteObject(key);
  }

  async downloadFile(storageUri: string, serviceMetadata: ServiceMetadata): Promise<Buffer> {
    // Parse storage URI: s3://bucket-name/path/to/file
    const uriMatch = storageUri.match(/^s3:\/\/([^\/]+)\/(.+)$/);
    if (!uriMatch) {
      throw new Error(`Invalid storage URI format: ${storageUri}`);
    }

    const [, bucket, key] = uriMatch;
    if (bucket !== this.bucketName) {
      throw new Error(`Bucket mismatch: expected ${this.bucketName}, got ${bucket}`);
    }

    return await this.downloadObject(key);
  }

  async uploadFile(
    storageUri: string,
    content: string | Buffer | Uint8Array,
    serviceMetadata: ServiceMetadata,
    options?: {
      contentType?: string;
      metadata?: Record<string, string>;
    },
  ): Promise<void> {
    // Parse storage URI: s3://bucket-name/path/to/file
    const uriMatch = storageUri.match(/^s3:\/\/([^\/]+)\/(.+)$/);
    if (!uriMatch) {
      throw new Error(`Invalid storage URI format: ${storageUri}`);
    }

    const [, bucket, key] = uriMatch;
    if (bucket !== this.bucketName) {
      throw new Error(`Bucket mismatch: expected ${this.bucketName}, got ${bucket}`);
    }

    await this.uploadObject(key, content, {
      contentType: options?.contentType,
      metadata: options?.metadata,
    });
  }

  // S3-specific low-level operations
  private async generatePresignedUrl(
    key: string,
    options?: {
      expiresIn?: number;
      contentType?: string;
      contentLength?: number;
      metadata?: Record<string, string>;
    },
  ): Promise<string> {
    const expiresIn = options?.expiresIn ?? this.expirationSeconds;

    const commandParams: any = {
      Bucket: this.bucketName,
      Key: key,
    };

    if (options?.contentType) {
      commandParams.ContentType = options.contentType;
    }

    if (options?.contentLength !== undefined) {
      commandParams.ContentLength = options.contentLength;
    }

    // Process metadata - AWS SDK v3 automatically adds x-amz-meta- prefix
    if (options?.metadata) {
      const customMetadata: Record<string, string> = {};
      for (const [key, value] of Object.entries(options.metadata)) {
        // Remove x-amz-meta- prefix if present, SDK will add it automatically
        const cleanKey = key.startsWith("x-amz-meta-") ? key.slice(11) : key;
        customMetadata[cleanKey] = String(value);
      }
      if (Object.keys(customMetadata).length > 0) {
        commandParams.Metadata = customMetadata;
      }
    }

    const command = new PutObjectCommand(commandParams);
    return await getSignedUrl(this.s3Client, command, { expiresIn });
  }

  private async uploadObject(
    key: string,
    body: string | Buffer | Uint8Array,
    options?: {
      contentType?: string;
      metadata?: Record<string, string>;
    },
  ): Promise<void> {
    const commandParams: any = {
      Bucket: this.bucketName,
      Key: key,
      Body: body,
    };

    if (options?.contentType) {
      commandParams.ContentType = options.contentType;
    }

    if (options?.metadata) {
      const customMetadata: Record<string, string> = {};
      for (const [key, value] of Object.entries(options.metadata)) {
        // Remove x-amz-meta- prefix if present, SDK will add it automatically
        const cleanKey = key.startsWith("x-amz-meta-") ? key.slice(11) : key;
        customMetadata[cleanKey] = String(value);
      }
      if (Object.keys(customMetadata).length > 0) {
        commandParams.Metadata = customMetadata;
      }
    }

    const command = new PutObjectCommand(commandParams);
    await this.s3Client.send(command);
  }

  private async downloadObject(key: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    const response = await this.s3Client.send(command);

    if (!response.Body) {
      throw new Error(`File not found or empty: s3://${this.bucketName}/${key}`);
    }

    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as any) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
  }

  private async deleteObject(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    await this.s3Client.send(command);
  }

  private async detectFileTypeFromContent(buffer: Buffer): Promise<string | null> {
    // Check magic bytes (file signatures) for security validation
    if (buffer.length < 4) return null;

    const signature = buffer.subarray(0, 4).toString("hex");

    // Check common file signatures
    if (signature === "25504446") return "pdf"; // PDF: %PDF
    if (signature === "504b0304") return "zip"; // ZIP/Excel/DOCX: PK\x03\x04
    if (signature === "1f8b0800" || signature === "1f8b0808") return "gzip"; // GZIP

    // Check for text-based formats by examining content
    try {
      const textStart = buffer.subarray(0, Math.min(100, buffer.length)).toString("utf8");
      if (textStart.trim().startsWith("{") || textStart.trim().startsWith("[")) return "json";
      if (textStart.trim().startsWith("<")) return "xml";
    } catch {
      // Not valid UTF-8, likely binary
    }

    return null;
  }

  private isExtensionMatch(extension: string, detectedType: string): boolean {
    const typeMap: Record<string, string[]> = {
      pdf: ["pdf"],
      zip: ["zip", "xlsx", "xls", "docx", "doc"],
      gzip: ["gz", "gzip"],
      json: ["json"],
      xml: ["xml"],
    };

    const validExtensions = typeMap[detectedType] || [];
    return validExtensions.includes(extension.toLowerCase());
  }
}
