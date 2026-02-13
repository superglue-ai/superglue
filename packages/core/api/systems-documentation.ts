import {
  DocumentationFiles,
  FileReference,
  FileStatus,
  System,
  uniqueKeywords,
} from "@superglue/shared";
import axios from "axios";
import * as yaml from "js-yaml";
import { DocumentationFetcher } from "../documentation/documentation-fetching.js";
import {
  extractOpenApiUrlFromHtml,
  fetchMultipleOpenApiSpecs,
  isValidOpenApiSpec,
} from "../documentation/documentation-utils.js";
import { getFileService } from "../filestore/file-service.js";
import {
  DirectOpenApiStrategy,
  SwaggerUIStrategy,
  HtmlLinkExtractorStrategy,
  OpenApiLinkExtractorStrategy,
} from "../documentation/strategies/index.js";
import { SystemManager } from "../systems/system-manager.js";
import { deleteFileReferenceById } from "./file-references.js";
import { logMessage } from "../utils/logs.js";
import { registerApiModule } from "./registry.js";
import {
  addTraceHeader,
  sendError,
  validateScrapeRequestBody,
  validateOpenApiSpecRequestBody,
  validateUploadDocumentationBody,
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

async function createOpenApiFileReference(
  specString: string,
  sourceUrl: string,
  systemId: string,
  orgId: string,
  datastore: any,
  metadata: Record<string, any>,
  extraMeta?: Record<string, any>,
): Promise<string | null> {
  const fileService = getFileService();
  const openApiFileId = crypto.randomUUID();
  const rawUri = fileService.buildRawStorageUri(orgId, `${openApiFileId}.json`);

  await fileService.uploadFile(rawUri, specString, metadata, { contentType: "application/json" });

  await datastore.createFileReference({
    file: {
      id: openApiFileId,
      storageUri: rawUri,
      processedStorageUri: rawUri,
      status: FileStatus.COMPLETED,
      metadata: {
        source: "openapi",
        url: sourceUrl,
        systemId,
        completedAt: new Date().toISOString(),
        ...extraMeta,
      },
      createdAt: new Date(),
    },
    orgId,
  });

  const currentSystem = await datastore.getSystem({ id: systemId, includeDocs: false, orgId });
  if (currentSystem) {
    const currentDocFiles = currentSystem.documentationFiles || {};
    await datastore.upsertSystem({
      id: systemId,
      system: {
        ...currentSystem,
        documentationFiles: {
          ...currentDocFiles,
          openApiFileIds: [...(currentDocFiles.openApiFileIds || []), openApiFileId],
        },
        updatedAt: new Date(),
      },
      orgId,
    });
  }

  return openApiFileId;
}

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
    const rawUri = fileService.buildRawStorageUri(orgId, `${fileId}.txt`);

    await fileService.uploadFile(rawUri, docString, metadata, { contentType: "text/plain" });

    const existingFileRef = await datastore.getFileReference({ id: fileId, orgId });

    await datastore.updateFileReference({
      id: fileId,
      updates: {
        storageUri: rawUri,
        processedStorageUri: rawUri,
        status: FileStatus.COMPLETED,
        metadata: {
          ...existingFileRef?.metadata,
          uploadedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
      },
      orgId,
    });

    logMessage("info", `Completed documentation fetching for URL ${scrapeUrl}`, metadata);

    try {
      const rawHtml = docFetcher.rawFetchResult;
      if (rawHtml) {
        let specString: string | null = null;
        let specSource: string = scrapeUrl;

        const detectedUrl = extractOpenApiUrlFromHtml(rawHtml);
        if (detectedUrl) {
          const absoluteUrl = detectedUrl.startsWith("/")
            ? new URL(detectedUrl, scrapeUrl).href
            : detectedUrl;
          logMessage(
            "info",
            `Detected OpenAPI spec URL from scraped HTML: ${absoluteUrl}`,
            metadata,
          );
          specString = await fetchMultipleOpenApiSpecs([absoluteUrl], metadata);
          specSource = absoluteUrl;
        }

        if (!specString) {
          const swaggerStrategy = new SwaggerUIStrategy();
          const strategyResult = await swaggerStrategy.tryFetch(rawHtml, scrapeUrl, metadata);
          if (strategyResult) {
            logMessage(
              "info",
              `SwaggerUIStrategy detected OpenAPI spec from scraped page: ${scrapeUrl}`,
              metadata,
            );
            specString = strategyResult;
            specSource = scrapeUrl;
          }
        }

        if (specString) {
          let specTitle: string | undefined;
          try {
            const parsed = JSON.parse(specString);
            specTitle = parsed?.info?.title;
          } catch {}

          const oaFileId = await createOpenApiFileReference(
            specString,
            specSource,
            systemId,
            orgId,
            datastore,
            metadata,
            {
              detectedFrom: "scrape",
              inputUrl: scrapeUrl,
              ...(specTitle && { specTitle }),
            },
          );
          logMessage(
            "info",
            `Created OpenAPI file reference ${oaFileId} detected during scrape of ${scrapeUrl}`,
            metadata,
          );
        }
      }
    } catch (openApiError) {
      logMessage(
        "warn",
        `OpenAPI detection from scrape failed (non-fatal): ${String(openApiError)}`,
        metadata,
      );
    }
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

    const docFiles: DocumentationFiles = system.documentationFiles || {};
    const existingScrapeIds = docFiles.scrapeFileIds || [];
    if (existingScrapeIds.length > 0) {
      const existingRefs = await authReq.datastore.listFileReferences({
        fileIds: existingScrapeIds,
        orgId: authReq.authInfo.orgId,
      });
      const activeScrape = existingRefs.items.find(
        (f: FileReference) => f.status === FileStatus.PENDING || f.status === FileStatus.PROCESSING,
      );
      if (activeScrape) {
        const STALE_SCRAPE_MS = 30 * 60 * 1000;
        const startedAt = activeScrape.metadata?.startedAt
          ? new Date(activeScrape.metadata.startedAt).getTime()
          : 0;
        const isStale = Date.now() - startedAt > STALE_SCRAPE_MS;

        if (isStale) {
          await authReq.datastore.updateFileReference({
            id: activeScrape.id,
            updates: {
              status: FileStatus.FAILED,
              error: "Scrape timed out after 30 minutes",
              metadata: {
                ...activeScrape.metadata,
                failedAt: new Date().toISOString(),
              },
            },
            orgId: authReq.authInfo.orgId,
          });
          logMessage(
            "warn",
            `Marked stale scrape ${activeScrape.id} as FAILED for system ${params.systemId}`,
            metadata,
          );
        } else {
          return sendError(
            reply,
            409,
            `A scrape is already in progress (file ${activeScrape.id}, status: ${activeScrape.status}). Wait for it to complete before starting another.`,
          );
        }
      }
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

const listSystemFileReferences: RouteHandler = async (request, reply) => {
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

    const files: DocumentationFileResponse[] = [];

    for (const file of fileRefs.items) {
      const fileResponse: DocumentationFileResponse = {
        id: file.id,
        source: getFileSource(file, docFiles),
        status: file.status,
        fileName: getFileName(file, system.name || system.id),
        createdAt: file.createdAt ? new Date(file.createdAt).toISOString() : undefined,
      };

      const sourceUrl = getSourceUrl(file);
      if (sourceUrl) {
        fileResponse.sourceUrl = sourceUrl;
      }

      if (file.error) {
        fileResponse.error = file.error;
      }

      if (file.metadata?.contentLength != null) {
        fileResponse.contentLength = Number(file.metadata.contentLength);
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
      `Error listing file references for system ${params.systemId}: ${String(error)}`,
      metadata,
    );
    return sendError(reply, 500, String(error));
  }
};

const uploadDocumentation: RouteHandler = async (request, reply) => {
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

    let body;
    try {
      body = validateUploadDocumentationBody(request.body);
    } catch (error: any) {
      return sendError(reply, 400, error.message);
    }

    const fileService = getFileService();
    const results = await Promise.all(
      body.files.map(async (file) => {
        const fileId = crypto.randomUUID();

        const mergedMetadata: Record<string, any> = {
          ...(file.metadata || {}),
          originalFileName: file.fileName,
          source: "upload",
          systemId: params.systemId,
        };

        const fileRef: FileReference = {
          id: fileId,
          storageUri: "",
          metadata: mergedMetadata,
          status: FileStatus.PENDING,
          createdAt: new Date(),
        };

        await authReq.datastore.createFileReference({
          file: fileRef,
          orgId: authReq.authInfo.orgId,
        });

        const uploadMetadata: Record<string, any> = {};
        if (file.metadata?.contentType) {
          uploadMetadata.ContentType = file.metadata.contentType;
        }
        if (file.metadata?.contentLength !== undefined) {
          uploadMetadata.ContentLength = file.metadata.contentLength;
        }

        const { uploadUrl, expiresIn, storageUri } = await fileService.generateUploadUrl(
          fileId,
          file.fileName,
          metadata,
          uploadMetadata,
        );

        await authReq.datastore.updateFileReference({
          id: fileId,
          updates: { storageUri },
          orgId: authReq.authInfo.orgId,
        });

        return { id: fileId, originalFileName: file.fileName, uploadUrl, expiresIn };
      }),
    );

    const newUploadIds = results.map((r) => r.id);
    const docFiles: DocumentationFiles = system.documentationFiles || {};
    await authReq.datastore.upsertSystem({
      id: params.systemId,
      system: {
        ...system,
        documentationFiles: {
          ...docFiles,
          uploadFileIds: [...(docFiles.uploadFileIds || []), ...newUploadIds],
        },
        updatedAt: new Date(),
      },
      orgId: authReq.authInfo.orgId,
    });

    logMessage(
      "info",
      `Created ${results.length} upload file reference(s) for system ${params.systemId}`,
      metadata,
    );

    return addTraceHeader(reply, authReq.traceId)
      .code(201)
      .send({
        success: true,
        data: { files: results },
      });
  } catch (error) {
    logMessage(
      "error",
      `Error uploading documentation for system ${params.systemId}: ${String(error)}`,
      metadata,
    );
    return sendError(reply, 500, String(error));
  }
};

const deleteDocumentationFile: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const params = request.params as { systemId: string; fileId: string };
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

    const docFiles: DocumentationFiles = system.documentationFiles || {};
    const allFileIds = [
      ...(docFiles.uploadFileIds || []),
      ...(docFiles.scrapeFileIds || []),
      ...(docFiles.openApiFileIds || []),
    ];

    if (!allFileIds.includes(params.fileId)) {
      return sendError(reply, 404, "File not linked to this system's documentation");
    }

    await deleteFileReferenceById(
      params.fileId,
      authReq.authInfo.orgId,
      authReq.datastore,
      metadata,
    );

    const updatedDocFiles: DocumentationFiles = {
      uploadFileIds: (docFiles.uploadFileIds || []).filter((id) => id !== params.fileId),
      scrapeFileIds: (docFiles.scrapeFileIds || []).filter((id) => id !== params.fileId),
      openApiFileIds: (docFiles.openApiFileIds || []).filter((id) => id !== params.fileId),
    };

    await authReq.datastore.upsertSystem({
      id: params.systemId,
      system: {
        ...system,
        documentationFiles: updatedDocFiles,
        updatedAt: new Date(),
      },
      orgId: authReq.authInfo.orgId,
    });

    logMessage(
      "info",
      `Deleted documentation file ${params.fileId} from system ${params.systemId}`,
      metadata,
    );

    return addTraceHeader(reply, authReq.traceId).code(200).send({ success: true });
  } catch (error) {
    if (String(error).includes("not found")) {
      return sendError(reply, 404, String(error));
    }
    logMessage(
      "error",
      `Error deleting documentation file ${params.fileId} from system ${params.systemId}: ${String(error)}`,
      metadata,
    );
    return sendError(reply, 500, String(error));
  }
};

const searchDocumentation: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const params = request.params as { systemId: string };
  const body = request.body as { keywords: string };
  const metadata = authReq.toMetadata();

  const keywords = typeof body?.keywords === "string" ? body.keywords.trim() : "";
  if (!keywords) {
    return sendError(reply, 400, "keywords is required and must be a string");
  }

  try {
    const systemManager = await SystemManager.fromId(params.systemId, authReq.datastore, metadata);
    const result = await systemManager.searchDocumentation(keywords);

    if (!result || result.trim().length === 0 || result === "no documentation provided") {
      return addTraceHeader(reply, authReq.traceId)
        .code(200)
        .send({
          success: true,
          data: `No relevant sections found for keywords: "${keywords}". Try different or broader keywords, or verify that the documentation contains information about what you're looking for.`,
        });
    }

    return addTraceHeader(reply, authReq.traceId).code(200).send({
      success: true,
      data: result,
    });
  } catch (error) {
    logMessage(
      "error",
      `Error searching documentation for system ${params.systemId}: ${String(error)}`,
      metadata,
    );
    return sendError(reply, 500, String(error));
  }
};

const fetchOpenApiSpec: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const params = request.params as { systemId: string };
  const body = request.body as { url?: string };
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

    let validatedBody;
    try {
      validatedBody = validateOpenApiSpecRequestBody(body);
    } catch (error: any) {
      return sendError(reply, 400, error.message);
    }

    const url = validatedBody.url;
    let specData: any;
    let rawResponse: any;
    try {
      const response = await axios.get(url, { timeout: 15000 });
      rawResponse = response.data;
      specData = rawResponse;

      if (typeof specData === "string") {
        try {
          specData = JSON.parse(specData);
        } catch {
          try {
            specData = yaml.load(specData) as any;
          } catch {
            specData = null;
          }
        }
      }
    } catch (err: any) {
      return sendError(reply, 422, `Failed to fetch URL: ${err.message}`);
    }

    if (!isValidOpenApiSpec(specData)) {
      const strategies = [
        new DirectOpenApiStrategy(),
        new SwaggerUIStrategy(),
        new HtmlLinkExtractorStrategy(typeof rawResponse === "string" ? rawResponse : null),
        new OpenApiLinkExtractorStrategy(),
      ];

      let resolved: string | null = null;
      for (const strategy of strategies) {
        resolved = await strategy.tryFetch(rawResponse, url, metadata);
        if (resolved) break;
      }

      if (!resolved) {
        return sendError(reply, 422, "URL does not contain a valid OpenAPI specification");
      }

      let parsedResolved: any;
      try {
        parsedResolved = JSON.parse(resolved);
      } catch {
        try {
          parsedResolved = yaml.load(resolved) as any;
        } catch {
          return sendError(reply, 422, "Discovered spec could not be parsed as JSON or YAML");
        }
      }

      specData = parsedResolved;
    }

    const specString = JSON.stringify(specData, null, 2);
    const specTitle = specData.info?.title;
    const specVersion = specData.info?.version;
    const openApiFileId = await createOpenApiFileReference(
      specString,
      url,
      params.systemId,
      authReq.authInfo.orgId,
      authReq.datastore,
      metadata,
      {
        ...(specTitle && { title: specTitle, specTitle }),
        ...(specVersion && { version: specVersion }),
      },
    );

    logMessage(
      "info",
      `Fetched and saved OpenAPI spec from ${url} for system ${params.systemId}`,
      metadata,
    );

    return addTraceHeader(reply, authReq.traceId)
      .code(201)
      .send({
        success: true,
        data: {
          fileReferenceId: openApiFileId,
          title: specData.info?.title,
          version: specData.info?.version,
        },
      });
  } catch (error) {
    logMessage(
      "error",
      `Error fetching OpenAPI spec for system ${params.systemId}: ${String(error)}`,
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
      path: "/systems/:systemId/documentation/search",
      handler: searchDocumentation,
      permissions: { type: "read", resource: "system" },
    },
    {
      method: "POST",
      path: "/systems/:systemId/documentation/openapi",
      handler: fetchOpenApiSpec,
      permissions: { type: "write", resource: "system" },
    },
    {
      method: "POST",
      path: "/systems/:systemId/documentation/scrape",
      handler: triggerScrape,
      permissions: { type: "write", resource: "system" },
    },
    {
      method: "POST",
      path: "/systems/:systemId/file-references",
      handler: uploadDocumentation,
      permissions: { type: "write", resource: "system" },
    },
    {
      method: "GET",
      path: "/systems/:systemId/file-references",
      handler: listSystemFileReferences,
      permissions: { type: "read", resource: "system" },
    },
    {
      method: "DELETE",
      path: "/systems/:systemId/file-references/:fileId",
      handler: deleteDocumentationFile,
      permissions: { type: "delete", resource: "system" },
    },
  ],
});
