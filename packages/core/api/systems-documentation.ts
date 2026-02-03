import { DocumentationFiles, FileReference, FileStatus, System } from "@superglue/shared";
import { DocumentationFetcher } from "../documentation/documentation-fetching.js";
import { getFileService } from "../filestore/file-service.js";
import { logMessage } from "../utils/logs.js";
import { registerApiModule } from "./registry.js";
import {
  addTraceHeader,
  sendError,
  uniqueKeywords,
  validateScrapeRequestBody,
  getFileSource,
  getFileName,
  getSourceUrl,
} from "./response-helpers.js";
import type {
  AuthenticatedFastifyRequest,
  RouteHandler,
  ScrapeRequestBody,
  DocumentationFileResponse,
} from "./types.js";

async function runDocumentationScrape(
  fileId: string,
  scrapeUrl: string,
  systemId: string,
  keywords: string[],
  credentials: Record<string, any>,
  orgId: string,
  datastore: any,
  traceId?: string,
): Promise<void> {
  const metadata = { orgId, traceId };

  try {
    await datastore.updateFileReference({
      id: fileId,
      updates: { status: FileStatus.PROCESSING },
      orgId,
    });

    logMessage(
      "info",
      `Starting documentation scrape for system ${systemId}, file ${fileId}`,
      metadata,
    );

    const docFetcher = new DocumentationFetcher(
      {
        documentationUrl: scrapeUrl,
        keywords: uniqueKeywords(keywords),
      },
      credentials,
      metadata,
    );

    const docString = await docFetcher.fetchAndProcess();

    if (!docString || docString.trim().length === 0) {
      throw new Error("Documentation fetch returned empty content");
    }

    const fileService = getFileService();
    const processedUri = `s3://${process.env.AWS_BUCKET_NAME}/${orgId}/processed/scrape-${fileId}.txt`;
    const rawUri = `s3://${process.env.AWS_BUCKET_NAME}/${orgId}/${process.env.AWS_BUCKET_PREFIX || "raw"}/scrape-${fileId}.txt`;

    await fileService.uploadFile(rawUri, docString, metadata, { contentType: "text/plain" });
    await fileService.uploadFile(processedUri, docString, metadata, { contentType: "text/plain" });

    const existingFileRef = await datastore.getFileReference({ id: fileId, orgId });

    await datastore.updateFileReference({
      id: fileId,
      updates: {
        status: FileStatus.COMPLETED,
        storageUri: rawUri,
        processedStorageUri: processedUri,
        metadata: {
          ...existingFileRef?.metadata,
          completedAt: new Date().toISOString(),
        },
      },
      orgId,
    });

    logMessage("info", `Completed documentation fetching for URL ${scrapeUrl}`, metadata);
  } catch (error) {
    logMessage(
      "error",
      `Documentation fetching failed for URL ${scrapeUrl}: ${String(error)}`,
      metadata,
    );

    const existingFileRef = await datastore.getFileReference({ id: fileId, orgId });

    await datastore.updateFileReference({
      id: fileId,
      updates: {
        status: FileStatus.FAILED,
        error: String(error),
        metadata: {
          ...existingFileRef?.metadata,
          failedAt: new Date().toISOString(),
        },
      },
      orgId,
    });
  }
}

const triggerScrape: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const params = request.params as { systemId: string };
  const metadata = authReq.toMetadata();

  try {
    const system = await authReq.datastore.getSystem({
      id: params.systemId,
      includeDocs: false,
      orgId: authReq.authInfo.orgId,
    });

    if (!system) {
      return sendError(reply, 404, "System not found");
    }

    let scrapeInput: ScrapeRequestBody & { resolvedUrl: string };
    try {
      scrapeInput = validateScrapeRequestBody(request.body, system.documentationUrl);
    } catch (error: any) {
      return sendError(reply, 400, error.message);
    }

    const fileId = crypto.randomUUID();

    const fileRef: FileReference = {
      id: fileId,
      storageUri: "",
      status: FileStatus.PENDING,
      metadata: {
        source: "scrape",
        url: scrapeInput.resolvedUrl,
        systemId: params.systemId,
        startedAt: new Date().toISOString(),
      },
      createdAt: new Date(),
    };

    await authReq.datastore.createFileReference({
      file: fileRef,
      orgId: authReq.authInfo.orgId,
    });

    const docFiles: DocumentationFiles = system.documentationFiles || {};
    const updatedSystem: System = {
      ...system,
      documentationFiles: {
        ...docFiles,
        scrapeFileIds: [...(docFiles.scrapeFileIds || []), fileId],
      },
      updatedAt: new Date(),
    };

    await authReq.datastore.upsertSystem({
      id: params.systemId,
      system: updatedSystem,
      orgId: authReq.authInfo.orgId,
    });

    const credentials = Object.entries(system.credentials || {}).reduce(
      (acc, [key, value]) => {
        acc[params.systemId + "_" + key] = value;
        return acc;
      },
      {} as Record<string, any>,
    );

    runDocumentationScrape(
      fileId,
      scrapeInput.resolvedUrl,
      params.systemId,
      scrapeInput.keywords || system.documentationKeywords || [],
      credentials,
      authReq.authInfo.orgId,
      authReq.datastore,
      authReq.traceId,
    );

    logMessage(
      "info",
      `Triggered documentation scrape for system ${params.systemId}, file ${fileId}`,
      metadata,
    );

    return addTraceHeader(reply, authReq.traceId)
      .code(202)
      .send({
        success: true,
        data: {
          fileReferenceId: fileId,
          status: FileStatus.PENDING,
        },
      });
  } catch (error) {
    logMessage(
      "error",
      `Error triggering scrape for system ${params.systemId}: ${String(error)}`,
      metadata,
    );
    return sendError(reply, 500, String(error));
  }
};

const getDocumentation: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const params = request.params as { systemId: string };
  const query = request.query as { includeContent?: string };
  const metadata = authReq.toMetadata();
  const includeContent = query.includeContent === "true";

  try {
    const system = await authReq.datastore.getSystem({
      id: params.systemId,
      includeDocs: false,
      orgId: authReq.authInfo.orgId,
    });

    if (!system) {
      return sendError(reply, 404, "System not found");
    }

    const docFiles: DocumentationFiles = system.documentationFiles || {};
    const allFileIds: string[] = [
      ...(docFiles.uploadFileIds || []),
      ...(docFiles.scrapeFileIds || []),
      ...(docFiles.openApiFileIds || []),
    ];

    if (allFileIds.length === 0) {
      return addTraceHeader(reply, authReq.traceId)
        .code(200)
        .send({
          success: true,
          data: { files: [] },
        });
    }

    const fileRefs = await authReq.datastore.listFileReferences({
      fileIds: allFileIds,
      orgId: authReq.authInfo.orgId,
    });

    const fileService = includeContent ? getFileService() : null;
    const files: DocumentationFileResponse[] = [];

    for (const file of fileRefs.items) {
      const fileResponse: DocumentationFileResponse = {
        id: file.id,
        source: getFileSource(file, docFiles),
        status: file.status,
        fileName: getFileName(file),
      };

      const sourceUrl = getSourceUrl(file);
      if (sourceUrl) {
        fileResponse.sourceUrl = sourceUrl;
      }

      if (file.error) {
        fileResponse.error = file.error;
      }

      if (
        includeContent &&
        file.status === FileStatus.COMPLETED &&
        file.processedStorageUri &&
        fileService
      ) {
        try {
          const contentBuffer = await fileService.downloadFile(file.processedStorageUri, metadata);
          fileResponse.content = contentBuffer.toString("utf8");
        } catch (downloadError) {
          logMessage(
            "warn",
            `Failed to download file ${file.id}: ${String(downloadError)}`,
            metadata,
          );
          fileResponse.error = `Failed to download content: ${String(downloadError)}`;
        }
      }

      files.push(fileResponse);
    }

    return addTraceHeader(reply, authReq.traceId).code(200).send({
      success: true,
      data: { files },
    });
  } catch (error) {
    logMessage(
      "error",
      `Error getting documentation for system ${params.systemId}: ${String(error)}`,
      metadata,
    );
    return sendError(reply, 500, String(error));
  }
};

registerApiModule({
  name: "systems-documentation",
  routes: [
    {
      method: "POST",
      path: "/systems/:systemId/documentation/scrape",
      handler: triggerScrape,
      permissions: { type: "write", resource: "system" },
    },
    {
      method: "GET",
      path: "/systems/:systemId/documentation",
      handler: getDocumentation,
      permissions: { type: "read", resource: "system" },
    },
  ],
});
