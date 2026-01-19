import { findMatchingSystem, System, systems as systemTemplates } from "@superglue/shared";
import { generateUniqueId } from "@superglue/shared/utils";
import { GraphQLResolveInfo } from "graphql";
import { PostgresService } from "../../datastore/postgres.js";
import { server_defaults } from "../../default.js";
import { DocumentationFetcher } from "../../documentation/documentation-fetching.js";
import { DocumentationSearch } from "../../documentation/documentation-search.js";
import { SystemFinder } from "../../systems/system-finder.js";
import { composeUrl } from "../../utils/helpers.js";
import { logMessage } from "../../utils/logs.js";
import { GraphQLRequestContext } from "../types.js";

export const listSystemsResolver = async (
  _: any,
  { limit = 100, offset = 0 }: { limit?: number; offset?: number },
  context: GraphQLRequestContext,
  info: GraphQLResolveInfo,
) => {
  try {
    const result = await context.datastore.listSystems({
      limit,
      offset,
      includeDocs: false,
      orgId: context.orgId,
    });
    return {
      items: result.items,
      total: result.total,
    };
  } catch (error) {
    logMessage("error", `Error listing systems: ${String(error)}`, context.toMetadata());
    throw error;
  }
};

export const getSystemResolver = async (
  _: any,
  { id }: { id: string },
  context: GraphQLRequestContext,
  info: GraphQLResolveInfo,
) => {
  if (!id) throw new Error("id is required");
  try {
    const system = await context.datastore.getSystem({
      id,
      includeDocs: false,
      orgId: context.orgId,
    });
    if (!system) throw new Error("System not found");
    return system;
  } catch (error) {
    logMessage(
      "error",
      `Error getting system with id ${id}: ${String(error)}`,
      context.toMetadata(),
    );
    throw error;
  }
};

export const upsertSystemResolver = async (
  _: any,
  {
    input,
    mode = "UPSERT",
    credentialMode = "MERGE",
  }: {
    input: System;
    mode?: "CREATE" | "UPDATE" | "UPSERT";
    credentialMode?: "MERGE" | "REPLACE";
  },
  context: GraphQLRequestContext,
  info: GraphQLResolveInfo,
) => {
  if (!input.id) {
    throw new Error("id is required");
  }
  try {
    const now = new Date();

    let existingSystemOrNull = await context.datastore.getSystem({
      id: input.id,
      includeDocs: false,
      orgId: context.orgId,
    });

    if (mode === "UPSERT") {
      mode = existingSystemOrNull ? "UPDATE" : "CREATE";
    }

    if (mode === "CREATE") {
      if (existingSystemOrNull) {
        input.id = await generateUniqueId({
          baseId: input.id,
          exists: async (id) =>
            !!(await context.datastore.getSystem({
              id,
              includeDocs: false,
              orgId: context.orgId,
            })),
        });
        existingSystemOrNull = null;
      }
      input = enrichWithTemplate(input);
    } else if (mode === "UPDATE") {
      if (!existingSystemOrNull) {
        throw new Error(`System with ID '${input.id}' not found.`);
      }
    }

    let shouldFetchDoc = shouldTriggerDocFetch(input, context, existingSystemOrNull);

    const systemToSave = {
      id: input.id,
      name: resolveField(input.name, existingSystemOrNull?.name, ""),
      urlHost: resolveField(input.urlHost, existingSystemOrNull?.urlHost, ""),
      urlPath: resolveField(input.urlPath, existingSystemOrNull?.urlPath, ""),
      documentationUrl: resolveField(
        input.documentationUrl,
        existingSystemOrNull?.documentationUrl,
        "",
      ),
      documentation: resolveField(
        input.documentation,
        existingSystemOrNull?.documentation,
        "",
      ),
      openApiUrl: resolveField(input.openApiUrl, existingSystemOrNull?.openApiUrl, ""),
      openApiSchema: resolveField(
        input.openApiSchema,
        existingSystemOrNull?.openApiSchema,
        "",
      ),
      documentationPending: shouldFetchDoc
        ? true
        : existingSystemOrNull?.documentationPending || false,
      credentials:
        credentialMode === "REPLACE"
          ? (input.credentials ?? {})
          : mergeCredentials(input.credentials, existingSystemOrNull?.credentials),
      specificInstructions: resolveField(
        input.specificInstructions?.trim(),
        existingSystemOrNull?.specificInstructions,
        "",
      ),
      documentationKeywords: uniqueKeywords(
        resolveField(
          input.documentationKeywords,
          existingSystemOrNull?.documentationKeywords,
          [],
        ),
      ),
      createdAt: existingSystemOrNull?.createdAt || now,
      updatedAt: now,
    };

    const savedSystem = await context.datastore.upsertSystem({
      id: input.id,
      system: systemToSave,
      orgId: context.orgId,
    });

    if (mode === "CREATE") {
      const [doesTemplateDocumentationExists, templateName] = templateDocumentationExists(
        input,
        context,
      );
      if (doesTemplateDocumentationExists) {
        logMessage(
          "debug",
          `Copying template documentation for template '${templateName}' to user system '${input.id}'`,
          context.toMetadata(),
        );
        const success = await context.datastore.copyTemplateDocumentationToUserSystem({
          templateId: templateName,
          userSystemId: input.id,
          orgId: context.orgId,
        });
        if (!success) {
          logMessage(
            "warn",
            `No Template Documentation found for template ${templateName} to copy to user system ${input.id}`,
            context.toMetadata(),
          );
          shouldFetchDoc = true;
        } else {
          logMessage(
            "info",
            `Skipping documentation scrape for system '${input.id}' - copied from template`,
            context.toMetadata(),
          );
        }
      }
    }

    if (shouldFetchDoc) {
      triggerAsyncDocumentationFetch(input, context);
    }

    return savedSystem;
  } catch (error) {
    logMessage(
      "error",
      `Error upserting system with id ${input.id}: ${String(error)}`,
      context.toMetadata(),
    );
    throw error;
  }
};

export const deleteSystemResolver = async (
  _: any,
  { id }: { id: string },
  context: GraphQLRequestContext,
  info: GraphQLResolveInfo,
) => {
  if (!id) throw new Error("id is required");
  try {
    return await context.datastore.deleteSystem({ id, orgId: context.orgId });
  } catch (error) {
    logMessage("error", `Error deleting system: ${String(error)}`, context.toMetadata());
    throw error;
  }
};

export const findRelevantSystemsResolver = async (
  _: any,
  { searchTerms }: { searchTerms?: string },
  context: GraphQLRequestContext,
  info: GraphQLResolveInfo,
) => {
  const metadata = context.toMetadata();

  try {
    const allSystems = await context.datastore.listSystems({
      limit: 1000,
      offset: 0,
      includeDocs: false,
      orgId: context.orgId,
    });

    const selector = new SystemFinder(metadata);
    return await selector.findSystems(searchTerms, allSystems.items || []);
  } catch (error) {
    logMessage("error", `Error finding relevant systems: ${String(error)}`, metadata);
    return [];
  }
};

export const cacheOauthClientCredentialsResolver = async (
  _: any,
  {
    clientCredentialsUid,
    clientId,
    clientSecret,
  }: { clientCredentialsUid: string; clientId: string; clientSecret: string },
  context: GraphQLRequestContext,
) => {
  if (!clientCredentialsUid || !clientId || !clientSecret) {
    throw new Error("Missing required parameters");
  }
  const OAUTH_SECRET_TTL_MS = server_defaults.POSTGRES.OAUTH_SECRET_TTL_MS;

  await context.datastore.cacheOAuthSecret({
    uid: clientCredentialsUid,
    clientId,
    clientSecret,
    ttlMs: OAUTH_SECRET_TTL_MS,
  });

  return true;
};

export const getOAuthClientCredentialsResolver = async (
  _: any,
  { templateId, clientCredentialsUid }: { templateId?: string; clientCredentialsUid?: string },
  context: GraphQLRequestContext,
  info: GraphQLResolveInfo,
) => {
  if (clientCredentialsUid) {
    const entry = await context.datastore.getOAuthSecret({ uid: clientCredentialsUid });

    if (!entry) {
      logMessage("debug", "getOAuthClientCredentials: cache miss/expired", {
        orgId: context.orgId,
      });
      throw new Error("Cached OAuth client credentials not found or expired");
    }

    return { client_id: entry.clientId, client_secret: entry.clientSecret };
  }

  if (!templateId) {
    throw new Error("No valid credentials source provided");
  }

  const creds = await context.datastore.getTemplateOAuthCredentials({ templateId });
  if (!creds) {
    throw new Error("Template client credentials not found");
  }
  return creds;
};
function templateDocumentationExists(
  input: System,
  context: GraphQLRequestContext,
): [boolean, string] {
  if (!(context.datastore instanceof PostgresService)) {
    return [false, ""];
  }
  const matchingTemplate =
    systemTemplates[String(input.name || input.id).toLowerCase()] ||
    findMatchingSystem(composeUrl(input.urlHost, input.urlPath))?.system;

  if (!matchingTemplate) {
    return [false, ""];
  }
  const allKeywordsPresent = matchingTemplate.keywords?.every((keyword) =>
    input.documentationKeywords?.includes(keyword),
  );
  const documentationUrlMatches =
    input.documentationUrl?.trim() === matchingTemplate.docsUrl.trim();
  return [allKeywordsPresent && documentationUrlMatches, matchingTemplate.name];
}

function enrichWithTemplate(input: System): System {
  const matchingTemplate =
    systemTemplates[String(input.name || input.id).toLowerCase()] ||
    findMatchingSystem(composeUrl(input.urlHost, input.urlPath))?.system;

  if (!matchingTemplate) {
    return input;
  }

  const mergedUniqueKeywords = uniqueKeywords([
    ...(input.documentationKeywords || []),
    ...(matchingTemplate.keywords || []),
  ]);

  input.openApiUrl = matchingTemplate.openApiUrl;
  input.openApiSchema = matchingTemplate.openApiSchema;
  input.documentationUrl = input.documentationUrl || matchingTemplate.docsUrl;
  input.urlHost = input.urlHost || matchingTemplate.apiUrl;
  input.documentationKeywords = mergedUniqueKeywords;
  return input;
}

function resolveField<T>(
  newValue: T | null | undefined,
  oldValue: T | undefined,
  defaultValue?: T,
): T | undefined {
  if (newValue === null) return undefined;
  if (newValue !== undefined) return newValue;
  if (oldValue !== undefined) return oldValue;
  return defaultValue;
}

function isMaskedValue(value: any): boolean {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (v.startsWith("<<") && v.endsWith(">>")) return true;
  if (v.startsWith("{masked_") && v.endsWith("}")) return true;
  return false;
}

function mergeCredentials(
  newCredentials: Record<string, any> | null | undefined,
  existingCredentials: Record<string, any> | undefined,
): Record<string, any> {
  if (newCredentials === null || newCredentials === undefined) {
    return existingCredentials || {};
  }

  if (!existingCredentials || Object.keys(existingCredentials).length === 0) {
    return newCredentials;
  }

  const merged = { ...existingCredentials };

  for (const [key, value] of Object.entries(newCredentials)) {
    if (isMaskedValue(value)) {
      continue;
    }
    merged[key] = value;
  }

  return merged;
}

function shouldTriggerDocFetch(
  input: System,
  context: GraphQLRequestContext,
  existingSystem?: System | null,
): boolean {
  const isManualRefresh = input.documentationPending === true;
  if (isManualRefresh) return true;

  const isFetchInProgress = existingSystem?.documentationPending === true;
  if (isFetchInProgress) return false;

  const isFileUrl = input.documentationUrl?.startsWith("file://");
  if (isFileUrl) return false;

  const hasDocumentationUrl = input.documentationUrl && input.documentationUrl.trim().length > 0;
  const hasApiUrl = input.urlHost && input.urlHost.trim().length > 0;
  const isGraphQLEndpoint = input.urlHost?.includes("graphql");
  const isPostgresEndpoint =
    input.urlHost?.startsWith("postgres://") || input.urlHost?.startsWith("postgresql://");
  const canIntrospect = hasApiUrl && (isGraphQLEndpoint || isPostgresEndpoint);

  const hasFetchableSource = hasDocumentationUrl || canIntrospect;
  if (!hasFetchableSource) return false;

  const isNewSystem = !existingSystem;
  if (isNewSystem) {
    const [doesTemplateDocumentationExists, _] = templateDocumentationExists(input, context);
    if (doesTemplateDocumentationExists) return false;
    return true;
  }

  const docUrlChanged = input.documentationUrl !== existingSystem.documentationUrl;
  const hostChanged = input.urlHost !== existingSystem.urlHost;
  const pathChanged = input.urlPath !== existingSystem.urlPath;
  const hasRelevantChanges = docUrlChanged || hostChanged || pathChanged;

  return hasRelevantChanges;
}

async function triggerAsyncDocumentationFetch(
  input: System,
  context: GraphQLRequestContext,
): Promise<void> {
  const metadata = context.toMetadata();

  try {
    const enrichedInput = enrichWithTemplate(input);

    const credentials = Object.entries(input.credentials || {}).reduce(
      (acc, [key, value]) => {
        acc[input.id + "_" + key] = value;
        return acc;
      },
      {} as Record<string, any>,
    );

    logMessage("info", `Starting async documentation fetch for system ${input.id}`, metadata);

    const docFetcher = new DocumentationFetcher(
      {
        urlHost: enrichedInput.urlHost,
        urlPath: enrichedInput.urlPath,
        documentationUrl: enrichedInput.documentationUrl,
        openApiUrl: enrichedInput.openApiUrl?.trim()
          ? enrichedInput.openApiUrl
          : enrichedInput.documentationUrl,
        keywords: uniqueKeywords(enrichedInput.documentationKeywords),
      },
      credentials,
      metadata,
    );

    const docString = await docFetcher.fetchAndProcess();
    const openApiSchema = await docFetcher.fetchOpenApiDocumentation();

    const latestSystem = await context.datastore.getSystem({
      id: input.id,
      includeDocs: false,
      orgId: context.orgId,
    });
    if (!latestSystem) {
      logMessage(
        "warn",
        `System ${input.id} was deleted while fetching documentation. Skipping upsert.`,
        metadata,
      );
      return;
    }

    await context.datastore.upsertSystem({
      id: input.id,
      system: {
        ...latestSystem,
        documentation: docString,
        documentationPending: false,
        openApiSchema: openApiSchema,
        updatedAt: new Date(),
      },
      orgId: context.orgId,
    });
    logMessage("info", `Completed documentation fetch for system ${input.id}`, metadata);
  } catch (err) {
    logMessage(
      "error",
      `Documentation fetch failed for system ${input.id}: ${String(err)}`,
      metadata,
    );

    try {
      const latestSystem = await context.datastore.getSystem({
        id: input.id,
        includeDocs: false,
        orgId: context.orgId,
      });
      if (latestSystem) {
        await context.datastore.upsertSystem({
          id: input.id,
          system: {
            ...latestSystem,
            documentationPending: false,
            updatedAt: new Date(),
          },
          orgId: context.orgId,
        });
        logMessage(
          "info",
          `Reset documentationPending to false for system ${input.id} after fetch failure`,
          metadata,
        );
      }
    } catch (resetError) {
      logMessage(
        "error",
        `Failed to reset documentationPending for system ${input.id}: ${String(resetError)}`,
        metadata,
      );
    }
  }
}

function uniqueKeywords(keywords: string[] | undefined): string[] {
  if (!keywords || keywords.length === 0) return [];
  return [...new Set(keywords)];
}

export const searchSystemDocumentationResolver = async (
  _: any,
  { systemId, keywords }: { systemId: string; keywords: string },
  context: GraphQLRequestContext,
  info: GraphQLResolveInfo,
) => {
  if (!systemId) throw new Error("systemId is required");
  if (!keywords) throw new Error("keywords is required");

  const metadata = context.toMetadata();

  try {
    const system = await context.datastore.getSystem({
      id: systemId,
      includeDocs: true,
      orgId: context.orgId,
    });
    if (!system) throw new Error("System not found");

    const hasDocumentation =
      system.documentation && system.documentation.trim().length > 0;
    const hasOpenApiSchema =
      system.openApiSchema && system.openApiSchema.trim().length > 0;

    if (!hasDocumentation && !hasOpenApiSchema) {
      return ``;
    }

    const documentationSearch = new DocumentationSearch(metadata);
    const result = documentationSearch.extractRelevantSections(
      system.documentation || "",
      keywords,
      3,
      2000,
      system.openApiSchema || "",
    );

    if (!result || result.trim().length === 0) {
      return `No relevant sections found for keywords: "${keywords}". Try different or broader keywords, or verify that the documentation contains information about what you're looking for.`;
    }

    return result;
  } catch (error) {
    logMessage(
      "error",
      `Error searching system documentation for ${systemId}: ${String(error)}`,
      metadata,
    );
    throw error;
  }
};
