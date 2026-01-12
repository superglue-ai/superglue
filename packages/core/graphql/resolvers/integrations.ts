import { findMatchingIntegration, Integration, integrations } from "@superglue/shared";
import { generateUniqueId } from "@superglue/shared/utils";
import { GraphQLResolveInfo } from "graphql";
import { PostgresService } from "../../datastore/postgres.js";
import { server_defaults } from "../../default.js";
import { DocumentationFetcher } from "../../documentation/documentation-fetching.js";
import { DocumentationSearch } from "../../documentation/documentation-search.js";
import { IntegrationFinder } from "../../integrations/integration-finder.js";
import { composeUrl } from "../../utils/helpers.js";
import { logMessage } from "../../utils/logs.js";
import { GraphQLRequestContext } from "../types.js";

export const listIntegrationsResolver = async (
  _: any,
  { limit = 100, offset = 0 }: { limit?: number; offset?: number },
  context: GraphQLRequestContext,
  info: GraphQLResolveInfo,
) => {
  try {
    const result = await context.datastore.listIntegrations({
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
    logMessage("error", `Error listing integrations: ${String(error)}`, context.toMetadata());
    throw error;
  }
};

export const getIntegrationResolver = async (
  _: any,
  { id }: { id: string },
  context: GraphQLRequestContext,
  info: GraphQLResolveInfo,
) => {
  if (!id) throw new Error("id is required");
  try {
    const integration = await context.datastore.getIntegration({
      id,
      includeDocs: false,
      orgId: context.orgId,
    });
    if (!integration) throw new Error("Integration not found");
    return integration;
  } catch (error) {
    logMessage(
      "error",
      `Error getting integration with id ${id}: ${String(error)}`,
      context.toMetadata(),
    );
    throw error;
  }
};

export const upsertIntegrationResolver = async (
  _: any,
  {
    input,
    mode = "UPSERT",
    credentialMode = "MERGE",
  }: {
    input: Integration;
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

    let existingIntegrationOrNull = await context.datastore.getIntegration({
      id: input.id,
      includeDocs: false,
      orgId: context.orgId,
    });

    if (mode === "UPSERT") {
      mode = existingIntegrationOrNull ? "UPDATE" : "CREATE";
    }

    if (mode === "CREATE") {
      if (existingIntegrationOrNull) {
        input.id = await generateUniqueId({
          baseId: input.id,
          exists: async (id) =>
            !!(await context.datastore.getIntegration({
              id,
              includeDocs: false,
              orgId: context.orgId,
            })),
        });
        existingIntegrationOrNull = null;
      }
      input = enrichWithTemplate(input);
    } else if (mode === "UPDATE") {
      if (!existingIntegrationOrNull) {
        throw new Error(`Integration with ID '${input.id}' not found.`);
      }
    }

    let shouldFetchDoc = shouldTriggerDocFetch(input, context, existingIntegrationOrNull);

    const integrationToSave = {
      id: input.id,
      name: resolveField(input.name, existingIntegrationOrNull?.name, ""),
      urlHost: resolveField(input.urlHost, existingIntegrationOrNull?.urlHost, ""),
      urlPath: resolveField(input.urlPath, existingIntegrationOrNull?.urlPath, ""),
      documentationUrl: resolveField(
        input.documentationUrl,
        existingIntegrationOrNull?.documentationUrl,
        "",
      ),
      documentation: resolveField(
        input.documentation,
        existingIntegrationOrNull?.documentation,
        "",
      ),
      openApiUrl: resolveField(input.openApiUrl, existingIntegrationOrNull?.openApiUrl, ""),
      openApiSchema: resolveField(
        input.openApiSchema,
        existingIntegrationOrNull?.openApiSchema,
        "",
      ),
      // If we're starting a new fetch, set pending to true
      // If we're not starting a new fetch, preserve the existing pending state
      documentationPending: shouldFetchDoc
        ? true
        : existingIntegrationOrNull?.documentationPending || false,
      credentials:
        credentialMode === "REPLACE"
          ? (input.credentials ?? {})
          : mergeCredentials(input.credentials, existingIntegrationOrNull?.credentials),
      specificInstructions: resolveField(
        input.specificInstructions?.trim(),
        existingIntegrationOrNull?.specificInstructions,
        "",
      ),
      documentationKeywords: uniqueKeywords(
        resolveField(
          input.documentationKeywords,
          existingIntegrationOrNull?.documentationKeywords,
          [],
        ),
      ),
      createdAt: existingIntegrationOrNull?.createdAt || now,
      updatedAt: now,
    };

    const savedIntegration = await context.datastore.upsertIntegration({
      id: input.id,
      integration: integrationToSave,
      orgId: context.orgId,
    });

    if (mode === "CREATE") {
      // If we are creating the integration, and we are on postgres datastore, and there is a template documentation, we copy it to the users integration
      const [doesTemplateDocumentationExists, templateName] = templateDocumentationExists(
        input,
        context,
      );
      if (doesTemplateDocumentationExists) {
        logMessage(
          "debug",
          `Copying template documentation for template '${templateName}' to user integration '${input.id}'`,
          context.toMetadata(),
        );
        const success = await context.datastore.copyTemplateDocumentationToUserIntegration({
          templateId: templateName,
          userIntegrationId: input.id,
          orgId: context.orgId,
        });
        if (!success) {
          logMessage(
            "warn",
            `No Template Documentation found for template ${templateName} to copy to user integration ${input.id}`,
            context.toMetadata(),
          );
          // set shouldFetchDoc to true to trigger a fetch
          shouldFetchDoc = true;
        } else {
          logMessage(
            "info",
            `Skipping documentation scrape for integration '${input.id}' - copied from template`,
            context.toMetadata(),
          );
        }
      }
    }

    if (shouldFetchDoc) {
      triggerAsyncDocumentationFetch(input, context); // Fire-and-forget, will fetch docs in background and update integration documentation, documentationPending and metadata fields once its done
    }

    return savedIntegration;
  } catch (error) {
    logMessage(
      "error",
      `Error upserting integration with id ${input.id}: ${String(error)}`,
      context.toMetadata(),
    );
    throw error;
  }
};

export const deleteIntegrationResolver = async (
  _: any,
  { id }: { id: string },
  context: GraphQLRequestContext,
  info: GraphQLResolveInfo,
) => {
  if (!id) throw new Error("id is required");
  try {
    return await context.datastore.deleteIntegration({ id, orgId: context.orgId });
  } catch (error) {
    logMessage("error", `Error deleting integration: ${String(error)}`, context.toMetadata());
    throw error;
  }
};

export const findRelevantIntegrationsResolver = async (
  _: any,
  { searchTerms }: { searchTerms?: string },
  context: GraphQLRequestContext,
  info: GraphQLResolveInfo,
) => {
  const logSearchTerms = searchTerms
    ? `searchTerms: ${searchTerms}`
    : "no searchTerms (returning all integrations)";
  const metadata = context.toMetadata();
  logMessage("info", `Finding relevant integrations for ${logSearchTerms}`, metadata);

  try {
    const allIntegrations = await context.datastore.listIntegrations({
      limit: 1000,
      offset: 0,
      includeDocs: false,
      orgId: context.orgId,
    });

    const selector = new IntegrationFinder(metadata);
    return await selector.findIntegrations(searchTerms, allIntegrations.items || []);
  } catch (error) {
    logMessage("error", `Error finding relevant integrations: ${String(error)}`, metadata);
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
  input: Integration,
  context: GraphQLRequestContext,
): [boolean, string] {
  if (!(context.datastore instanceof PostgresService)) {
    return [false, ""];
  }
  const matchingTemplate =
    integrations[String(input.name || input.id).toLowerCase()] ||
    findMatchingIntegration(composeUrl(input.urlHost, input.urlPath))?.integration;

  if (!matchingTemplate) {
    return [false, ""];
  }
  // check if all keywords are present in the matchingTemplate.keywords
  const allKeywordsPresent = matchingTemplate.keywords?.every((keyword) =>
    input.documentationKeywords?.includes(keyword),
  );
  const documentationUrlMatches =
    input.documentationUrl?.trim() === matchingTemplate.docsUrl.trim();
  return [allKeywordsPresent && documentationUrlMatches, matchingTemplate.name];
}

function enrichWithTemplate(input: Integration): Integration {
  const matchingTemplate =
    integrations[String(input.name || input.id).toLowerCase()] ||
    findMatchingIntegration(composeUrl(input.urlHost, input.urlPath))?.integration;

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

/**
 * Checks if a credential value looks like a masked placeholder.
 * Masked values should be skipped during merge to preserve existing real values.
 */
function isMaskedValue(value: any): boolean {
  if (typeof value !== "string") return false;
  const v = value.trim();
  // <<...>> pattern (e.g., <<masked_api_key>>, <<MASKED>>)
  if (v.startsWith("<<") && v.endsWith(">>")) return true;
  // {masked_...} pattern
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
    // Skip masked values - keep existing real credentials
    if (isMaskedValue(value)) {
      continue;
    }
    // Use new value (overrides existing)
    merged[key] = value;
  }

  return merged;
}

function shouldTriggerDocFetch(
  input: Integration,
  context: GraphQLRequestContext,
  existingIntegration?: Integration | null,
): boolean {
  // Early exit conditions
  const isManualRefresh = input.documentationPending === true;
  if (isManualRefresh) return true;

  const isFetchInProgress = existingIntegration?.documentationPending === true;
  if (isFetchInProgress) return false;

  const isFileUrl = input.documentationUrl?.startsWith("file://");
  if (isFileUrl) return false;

  // Check if we have something to fetch
  const hasDocumentationUrl = input.documentationUrl && input.documentationUrl.trim().length > 0;
  const hasApiUrl = input.urlHost && input.urlHost.trim().length > 0;
  const isGraphQLEndpoint = input.urlHost?.includes("graphql");
  const isPostgresEndpoint =
    input.urlHost?.startsWith("postgres://") || input.urlHost?.startsWith("postgresql://");
  const canIntrospect = hasApiUrl && (isGraphQLEndpoint || isPostgresEndpoint);

  const hasFetchableSource = hasDocumentationUrl || canIntrospect;
  if (!hasFetchableSource) return false;

  // Check if we need to trigger a fetch
  const isNewIntegration = !existingIntegration;
  if (isNewIntegration) {
    // If we are on postgres datastore and there is a template documentation, we don't need to fetch
    const [doesTemplateDocumentationExists, _] = templateDocumentationExists(input, context);
    if (doesTemplateDocumentationExists) return false;
    return true;
  }

  const docUrlChanged = input.documentationUrl !== existingIntegration.documentationUrl;
  const hostChanged = input.urlHost !== existingIntegration.urlHost;
  const pathChanged = input.urlPath !== existingIntegration.urlPath;
  const hasRelevantChanges = docUrlChanged || hostChanged || pathChanged;

  return hasRelevantChanges;
}

async function triggerAsyncDocumentationFetch(
  input: Integration,
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

    logMessage("info", `Starting async documentation fetch for integration ${input.id}`, metadata);

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

    // CRITICAL: Fetch the latest integration state before updating
    // This ensures we don't overwrite any changes made since the initial upsert
    const latestIntegration = await context.datastore.getIntegration({
      id: input.id,
      includeDocs: false,
      orgId: context.orgId,
    });
    if (!latestIntegration) {
      logMessage(
        "warn",
        `Integration ${input.id} was deleted while fetching documentation. Skipping upsert.`,
        metadata,
      );
      return;
    }

    // Update ONLY the documentation-related fields
    await context.datastore.upsertIntegration({
      id: input.id,
      integration: {
        ...latestIntegration,
        documentation: docString,
        documentationPending: false,
        openApiSchema: openApiSchema,
        updatedAt: new Date(),
      },
      orgId: context.orgId,
    });
    logMessage("info", `Completed documentation fetch for integration ${input.id}`, metadata);
  } catch (err) {
    logMessage(
      "error",
      `Documentation fetch failed for integration ${input.id}: ${String(err)}`,
      metadata,
    );

    // Reset documentationPending to false on failure
    try {
      const latestIntegration = await context.datastore.getIntegration({
        id: input.id,
        includeDocs: false,
        orgId: context.orgId,
      });
      if (latestIntegration) {
        await context.datastore.upsertIntegration({
          id: input.id,
          integration: {
            ...latestIntegration,
            documentationPending: false,
            updatedAt: new Date(),
          },
          orgId: context.orgId,
        });
        logMessage(
          "info",
          `Reset documentationPending to false for integration ${input.id} after fetch failure`,
          metadata,
        );
      }
    } catch (resetError) {
      logMessage(
        "error",
        `Failed to reset documentationPending for integration ${input.id}: ${String(resetError)}`,
        metadata,
      );
    }
  }
}

function uniqueKeywords(keywords: string[] | undefined): string[] {
  if (!keywords || keywords.length === 0) return [];
  return [...new Set(keywords)];
}

export const searchIntegrationDocumentationResolver = async (
  _: any,
  { integrationId, keywords }: { integrationId: string; keywords: string },
  context: GraphQLRequestContext,
  info: GraphQLResolveInfo,
) => {
  if (!integrationId) throw new Error("integrationId is required");
  if (!keywords) throw new Error("keywords is required");

  const metadata = context.toMetadata();

  try {
    const integration = await context.datastore.getIntegration({
      id: integrationId,
      includeDocs: true,
      orgId: context.orgId,
    });
    if (!integration) throw new Error("Integration not found");

    const hasDocumentation =
      integration.documentation && integration.documentation.trim().length > 0;
    const hasOpenApiSchema =
      integration.openApiSchema && integration.openApiSchema.trim().length > 0;

    if (!hasDocumentation && !hasOpenApiSchema) {
      return ``;
    }

    const documentationSearch = new DocumentationSearch(metadata);
    const result = documentationSearch.extractRelevantSections(
      integration.documentation || "",
      keywords,
      3,
      2000,
      integration.openApiSchema || "",
    );

    if (!result || result.trim().length === 0) {
      return `No relevant sections found for keywords: "${keywords}". Try different or broader keywords, or verify that the documentation contains information about what you're looking for.`;
    }

    return result;
  } catch (error) {
    logMessage(
      "error",
      `Error searching integration documentation for ${integrationId}: ${String(error)}`,
      metadata,
    );
    throw error;
  }
};
