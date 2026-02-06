import type { AuthenticatedFastifyRequest, RouteHandler } from "./types.js";
import { registerApiModule } from "./registry.js";
import {
  FileReference,
  FileStatus,
  BatchFileUploadRequest,
  BatchFileUploadResponse,
} from "@superglue/shared";
import { getFileService } from "../filestore/file-service.js";
import { logMessage } from "../utils/logs.js";
import { server_defaults } from "../default.js";

const createFileReference: RouteHandler = async (request, reply) => {
  try {
    const authReq = request as AuthenticatedFastifyRequest;
    const body = request.body as { file: FileReference };

    if (!body.file) {
      return reply.code(400).send({ success: false, error: "Missing file data" });
    }

    const created = await authReq.datastore.createFileReference({
      file: body.file,
      orgId: authReq.authInfo.orgId,
    });

    return reply.code(201).send({ success: true, data: created });
  } catch (error) {
    return reply.code(500).send({ success: false, error: String(error) });
  }
};

const getFileReference: RouteHandler = async (request, reply) => {
  try {
    const authReq = request as AuthenticatedFastifyRequest;
    const { id } = request.params as { id: string };

    const file = await authReq.datastore.getFileReference({ id, orgId: authReq.authInfo.orgId });

    if (!file) {
      return reply.code(404).send({ success: false, error: "File reference not found" });
    }

    return reply.code(200).send({ success: true, data: file });
  } catch (error) {
    return reply.code(500).send({ success: false, error: String(error) });
  }
};

const updateFileReference: RouteHandler = async (request, reply) => {
  try {
    const authReq = request as AuthenticatedFastifyRequest;
    const { id } = request.params as { id: string };
    const body = request.body as { updates: Partial<FileReference> };

    if (!body.updates) {
      return reply.code(400).send({ success: false, error: "Missing updates data" });
    }

    const updated = await authReq.datastore.updateFileReference({
      id,
      updates: body.updates,
      orgId: authReq.authInfo.orgId,
    });

    return reply.code(200).send({ success: true, data: updated });
  } catch (error) {
    if (String(error).includes("not found")) {
      return reply.code(404).send({ success: false, error: String(error) });
    }
    return reply.code(500).send({ success: false, error: String(error) });
  }
};

const listFileReferences: RouteHandler = async (request, reply) => {
  try {
    const authReq = request as AuthenticatedFastifyRequest;
    const query = request.query as {
      limit?: string;
      offset?: string;
      status?: FileStatus;
      fileIds?: string;
    };

    const limit = query.limit ? parseInt(query.limit, 10) || 10 : 10;
    const offset = query.offset ? parseInt(query.offset, 10) || 0 : 0;
    const fileIds = query.fileIds ? query.fileIds.split(",") : undefined;

    const result = await authReq.datastore.listFileReferences({
      limit,
      offset,
      status: query.status,
      fileIds,
      orgId: authReq.authInfo.orgId,
    });

    return reply.code(200).send({
      success: true,
      items: result.items,
      total: result.total,
    });
  } catch (error) {
    return reply.code(500).send({ success: false, error: String(error) });
  }
};

// Export the core deletion logic for reuse
export async function deleteFileReferenceById(
  id: string,
  orgId: string,
  datastore: any,
  serviceMetadata: any,
): Promise<void> {
  // Get file reference first to get storage URIs
  const fileRef = await datastore.getFileReference({
    id,
    orgId,
  });

  if (!fileRef) {
    throw new Error("File reference not found");
  }

  // Delete files from storage if storage URIs exist
  try {
    if (fileRef.storageUri) {
      await getFileService().deleteFile(fileRef.storageUri, serviceMetadata);
      logMessage(
        "info",
        `deleteFileReference: deleted raw file uri=${fileRef.storageUri}`,
        serviceMetadata,
      );
    }
    if (fileRef.processedStorageUri) {
      await getFileService().deleteFile(fileRef.processedStorageUri, serviceMetadata);
      logMessage(
        "info",
        `deleteFileReference: deleted processed file uri=${fileRef.processedStorageUri}`,
        serviceMetadata,
      );
    }
  } catch (storageError: any) {
    // Log but don't fail - we still want to delete the database record
    logMessage(
      "warn",
      `deleteFileReference: failed to delete from storage: ${storageError}`,
      serviceMetadata,
    );
  }

  // Delete from database
  const deleted = await datastore.deleteFileReference({ id, orgId });

  if (!deleted) {
    throw new Error("File reference not found");
  }
}

const deleteFileReference: RouteHandler = async (request, reply) => {
  try {
    const authReq = request as AuthenticatedFastifyRequest;
    const { id } = request.params as { id: string };
    const serviceMetadata = authReq.toMetadata();

    await deleteFileReferenceById(id, authReq.authInfo.orgId, authReq.datastore, serviceMetadata);

    return reply.code(200).send({ success: true });
  } catch (error) {
    if (String(error).includes("not found")) {
      return reply.code(404).send({ success: false, error: String(error) });
    }
    return reply.code(500).send({ success: false, error: String(error) });
  }
};

const batchCreateFileReferences: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  try {
    const body = request.body as BatchFileUploadRequest;

    if (!body.files || !Array.isArray(body.files)) {
      return reply.code(400).send({
        success: false,
        error: "Missing or invalid files array",
      });
    }

    // Validate array length (1-20 files)
    if (body.files.length === 0 || body.files.length > 20) {
      return reply.code(400).send({
        success: false,
        error: "Files array must contain between 1 and 20 files",
      });
    }

    const results = await Promise.all(
      body.files.map(async (file) => {
        // Generate ID for the file
        const fileId = crypto.randomUUID();

        // Extract file extension from original filename
        const extension = file.fileName.split(".").pop() || "";

        // Merge provided metadata with originalFileName
        const mergedMetadata = {
          ...(file.metadata || {}),
          originalFileName: file.fileName,
        };

        // Create file reference in datastore
        const fileReference: FileReference = {
          id: fileId,
          storageUri: "",
          processedStorageUri: undefined,
          metadata: mergedMetadata,
          status: FileStatus.PENDING,
          createdAt: new Date(),
        };

        await authReq.datastore.createFileReference({
          file: fileReference,
          orgId: authReq.authInfo.orgId,
        });

        // Prepare metadata for upload URL generator
        // Map contentType and contentLength to the format expected by the generator
        const uploadMetadata: Record<string, any> = {};
        if (file.metadata?.contentType) {
          uploadMetadata.ContentType = file.metadata.contentType;
        }
        if (file.metadata?.contentLength !== undefined) {
          uploadMetadata.ContentLength = file.metadata.contentLength;
        }
        // Pass through any other custom metadata fields
        if (file.metadata) {
          for (const [key, value] of Object.entries(file.metadata)) {
            if (key !== "contentType" && key !== "contentLength" && key !== "originalFileName") {
              uploadMetadata[key] = value;
            }
          }
        }

        // Generate upload URL and get storage URI
        const { uploadUrl, expiresIn, storageUri } = await getFileService().generateUploadUrl(
          fileId,
          file.fileName,
          authReq.toMetadata(),
          uploadMetadata,
        );

        // Update file reference with storageUri
        await authReq.datastore.updateFileReference({
          id: fileId,
          updates: { storageUri },
          orgId: authReq.authInfo.orgId,
        });

        return {
          id: fileId,
          originalFileName: file.fileName,
          uploadUrl,
          expiresIn,
        };
      }),
    );

    const response: BatchFileUploadResponse = {
      success: true,
      files: results,
    };

    return reply.code(201).send(response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // Return 400 for validation errors (e.g., missing file extension)
    const isValidationError =
      errorMessage.includes("must have a valid extension") ||
      errorMessage.includes("Only files with extensions are supported");
    const statusCode = isValidationError ? 400 : 500;
    return reply.code(statusCode).send({ success: false, error: errorMessage });
  }
};

const processFileReference: RouteHandler = async (request, reply) => {
  try {
    const authReq = request as AuthenticatedFastifyRequest;
    const serviceMetadata = authReq.toMetadata();
    const body = request.body as any;

    let bucket: string | undefined;
    let key: string | undefined;
    let fileSize: number | undefined;

    if (body.detail?.bucket?.name && body.detail?.object?.key) {
      bucket = body.detail.bucket.name;
      key = body.detail.object.key;
      fileSize = body.detail.object.size;
    } else if (body.Records?.[0]?.s3?.bucket?.name && body.Records?.[0]?.s3?.object?.key) {
      const record = body.Records[0];
      bucket = record.s3.bucket.name;
      key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
      fileSize = record.s3.object.size || 0;
    }

    if (!bucket || !key) {
      logMessage(
        "error",
        `processFileReference: Invalid event structure - could not extract bucket/key`,
        serviceMetadata,
      );
      return reply.code(400).send({
        success: false,
        error: "Invalid event structure: could not extract bucket and key",
      });
    }

    if (key.includes("/processed/") || key.includes("/run-results/")) {
      return reply.code(200).send({
        success: true,
        message: "Skipped: not a file reference",
        skipped: true,
      });
    }

    return processFileByKey(authReq, reply, bucket, key, fileSize || 0);
  } catch (error) {
    return reply.code(500).send({ success: false, error: String(error) });
  }
};

async function processFileByKey(
  authReq: AuthenticatedFastifyRequest,
  reply: any,
  bucket: string,
  key: string,
  fileSize: number,
) {
  const serviceMetadata = authReq.toMetadata();
  const storageUri = `s3://${bucket}/${key}`;

  const filename = key.split("/").pop() || key;
  const fileId = filename.split(".")[0];
  const orgIdFromKey = key.split("/")[0];
  const orgId = authReq.authInfo.orgId || orgIdFromKey;

  if (authReq.authInfo.orgId && authReq.authInfo.orgId !== orgIdFromKey) {
    logMessage(
      "warn",
      `processFileByKey: Org mismatch - auth=${authReq.authInfo.orgId} key=${orgIdFromKey}`,
      serviceMetadata,
    );
    return reply.code(403).send({
      success: false,
      error: "Not authorized to process files for this organization",
    });
  }

  if (!fileId) {
    return reply.code(400).send({
      success: false,
      error: "Could not extract file ID from key",
    });
  }

  const fileRef = await authReq.datastore.getFileReference({
    id: fileId,
    orgId: orgId,
  });

  if (!fileRef) {
    logMessage("error", `processFileByKey: File reference not found: ${fileId}`, serviceMetadata);
    return reply.code(404).send({
      success: false,
      error: `File reference not found: ${fileId}`,
    });
  }

  const maxFileSize = server_defaults.FILE_PROCESSING.MAX_FILE_SIZE_BYTES;
  if (fileSize !== undefined && fileSize > maxFileSize) {
    await authReq.datastore.updateFileReference({
      id: fileId,
      updates: {
        status: FileStatus.FAILED,
        error: `File size ${fileSize} exceeds maximum allowed size ${maxFileSize}`,
      },
      orgId: orgId,
    });
    return reply.code(400).send({
      success: false,
      error: `File size exceeds maximum allowed size`,
    });
  }

  await authReq.datastore.updateFileReference({
    id: fileId,
    updates: { status: FileStatus.PROCESSING },
    orgId: orgId,
  });

  try {
    const { processedStorageUri } = await getFileService().processFile(storageUri, serviceMetadata);

    await authReq.datastore.updateFileReference({
      id: fileId,
      updates: {
        status: FileStatus.COMPLETED,
        processedStorageUri,
      },
      orgId: orgId,
    });

    logMessage(
      "info",
      `processFileByKey: COMPLETED fileId=${fileId} processedUri=${processedStorageUri}`,
      serviceMetadata,
    );

    return reply.code(200).send({
      success: true,
      message: "File processed successfully",
      fileId,
      processedStorageUri,
    });
  } catch (processingError: any) {
    await authReq.datastore.updateFileReference({
      id: fileId,
      updates: {
        status: FileStatus.FAILED,
        error: String(processingError),
      },
      orgId: orgId,
    });
    logMessage(
      "error",
      `processFileByKey: FAILED fileId=${fileId} err=${processingError}`,
      serviceMetadata,
    );

    return reply.code(500).send({
      success: false,
      error: String(processingError),
    });
  }
}

registerApiModule({
  name: "file-references",
  routes: [
    {
      method: "POST",
      path: "/file-references",
      handler: createFileReference,
      permissions: { type: "write", resource: "file-reference" },
    },
    {
      method: "GET",
      path: "/file-references/:id",
      handler: getFileReference,
      permissions: { type: "read", resource: "file-reference" },
    },
    {
      method: "PATCH",
      path: "/file-references/:id",
      handler: updateFileReference,
      permissions: { type: "write", resource: "file-reference" },
    },
    {
      method: "GET",
      path: "/file-references",
      handler: listFileReferences,
      permissions: { type: "read", resource: "file-reference" },
    },
    {
      method: "DELETE",
      path: "/file-references/:id",
      handler: deleteFileReference,
      permissions: { type: "delete", resource: "file-reference" },
    },
    {
      method: "POST",
      path: "/file-references/process",
      handler: processFileReference,
      permissions: { type: "execute", resource: "file-reference" },
    },
    {
      method: "POST",
      path: "/file-references/batch",
      handler: batchCreateFileReferences,
      permissions: { type: "write", resource: "file-reference" },
    },
  ],
});
