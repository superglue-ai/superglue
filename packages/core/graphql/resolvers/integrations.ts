import { Integration } from '@superglue/client';
import { Context, findMatchingIntegration, integrations, Metadata } from "@superglue/shared";
import { generateUniqueId } from '@superglue/shared/utils';
import { GraphQLResolveInfo } from "graphql";
import { IntegrationSelector } from '../../integrations/integration-selector.js';
import { Documentation } from '../../utils/documentation.js';
import { logMessage } from '../../utils/logs.js';
import { composeUrl } from '../../utils/tools.js';

export const listIntegrationsResolver = async (
  _: any,
  { limit = 10, offset = 0 }: { limit?: number; offset?: number },
  context: Context,
  info: GraphQLResolveInfo
) => {
  try {
    const result = await context.datastore.listIntegrations({ limit, offset, includeDocs: false, orgId: context.orgId });
    return {
      items: result.items,
      total: result.total,
    };
  } catch (error) {
    logMessage('error', `Error listing integrations: ${String(error)}`, { orgId: context.orgId });
    throw error;
  }
};

export const getIntegrationResolver = async (
  _: any,
  { id }: { id: string },
  context: Context,
  info: GraphQLResolveInfo
) => {
  if (!id) throw new Error("id is required");
  try {
    const integration = await context.datastore.getIntegration({ id, includeDocs: false, orgId: context.orgId });
    if (!integration) throw new Error("Integration not found");
    return integration;
  } catch (error) {
    logMessage('error', `Error getting integration with id ${id}: ${String(error)}`, { orgId: context.orgId });
    throw error;
  }
};

export const upsertIntegrationResolver = async (
  _: any,
  { input, mode = 'UPSERT' }: { input: Integration, mode?: 'CREATE' | 'UPDATE' | 'UPSERT' },
  context: Context,
  info: GraphQLResolveInfo
) => {
  if (!input.id) {
    throw new Error("id is required");
  }
  try {
    const now = new Date();

    let existingIntegrationOrNull = await context.datastore.getIntegration({ id: input.id, includeDocs: false, orgId: context.orgId });

    if (mode === 'UPSERT') {
      mode = existingIntegrationOrNull ? 'UPDATE' : 'CREATE';
    }

    if (mode === 'CREATE') {
      if (existingIntegrationOrNull) {
        input.id = await generateUniqueId({
          baseId: input.id,
          exists: async (id) => !!(await context.datastore.getIntegration({ id, includeDocs: false, orgId: context.orgId }))
        });
        existingIntegrationOrNull = null;
      }
      input = enrichWithTemplate(input);
    } else if (mode === 'UPDATE') {
      if (!existingIntegrationOrNull) {
        throw new Error(`Integration with ID '${input.id}' not found.`);
      }
    }

    const shouldFetchDoc = shouldTriggerDocFetch(input, existingIntegrationOrNull);

    if (shouldFetchDoc) {
      triggerAsyncDocumentationFetch(input, context); // Fire-and-forget, will fetch docs in background and update integration documentation, documentationPending and metadata fields once its done
    }

    const integrationToSave = {
      id: input.id,
      name: resolveField(input.name, existingIntegrationOrNull?.name, ''),
      urlHost: resolveField(input.urlHost, existingIntegrationOrNull?.urlHost, ''),
      urlPath: resolveField(input.urlPath, existingIntegrationOrNull?.urlPath, ''),
      documentationUrl: resolveField(input.documentationUrl, existingIntegrationOrNull?.documentationUrl, ''),
      documentation: resolveField(input.documentation, existingIntegrationOrNull?.documentation, ''),
      openApiUrl: resolveField(input.openApiUrl, existingIntegrationOrNull?.openApiUrl, ''),
      openApiSchema: resolveField(input.openApiSchema, existingIntegrationOrNull?.openApiSchema, ''),
      // If we're starting a new fetch, set pending to true
      // If we're not starting a new fetch, preserve the existing pending state
      documentationPending: shouldFetchDoc ? true : (existingIntegrationOrNull?.documentationPending || false),
      credentials: resolveField(input.credentials, existingIntegrationOrNull?.credentials, {}),
      specificInstructions: resolveField(input.specificInstructions?.trim(), existingIntegrationOrNull?.specificInstructions, ''),
      documentationKeywords: uniqueKeywords(resolveField(input.documentationKeywords, existingIntegrationOrNull?.documentationKeywords, [])),
      createdAt: existingIntegrationOrNull?.createdAt || now,
      updatedAt: now
    };
    return await context.datastore.upsertIntegration({ id: input.id, integration: integrationToSave, orgId: context.orgId });
  } catch (error) {
    logMessage('error', `Error upserting integration with id ${input.id}: ${String(error)}`, { orgId: context.orgId });
    throw error;
  }
};

export const deleteIntegrationResolver = async (
  _: any,
  { id }: { id: string },
  context: Context,
  info: GraphQLResolveInfo
) => {
  if (!id) throw new Error("id is required");
  try {
    return await context.datastore.deleteIntegration({ id, orgId: context.orgId });
  } catch (error) {
    logMessage('error', `Error deleting integration: ${String(error)}`, { orgId: context.orgId });
    throw error;
  }
};

export const findRelevantIntegrationsResolver = async (
  _: any,
  { instruction }: { instruction?: string },
  context: Context,
  info: GraphQLResolveInfo
) => {
  const logInstruction = instruction ? `instruction: ${instruction}` : 'no instruction (returning all integrations)';
  logMessage('info', `Finding relevant integrations for ${logInstruction}`, { orgId: context.orgId });

  try {
    const metadata: Metadata = { orgId: context.orgId, runId: crypto.randomUUID() };
    const allIntegrations = await context.datastore.listIntegrations({ limit: 1000, offset: 0, includeDocs: false, orgId: context.orgId });

    const selector = new IntegrationSelector(metadata);
    return await selector.select(instruction, allIntegrations.items || []);
  } catch (error) {
    logMessage('error', `Error finding relevant integrations: ${String(error)}`, { orgId: context.orgId });
    return [];
  }
};

function enrichWithTemplate(input: Integration): Integration {
  const matchingTemplate = integrations[String(input.name || input.id).toLowerCase()] ||
    findMatchingIntegration(composeUrl(input.urlHost, input.urlPath))?.integration;

  if (!matchingTemplate) {
    return input;
  }

  const mergedKeywords = [
    ...(input.documentationKeywords || []),
    ...(matchingTemplate.keywords || [])
  ];

  return {
    ...input,
    openApiUrl: input.openApiUrl || matchingTemplate.openApiUrl,
    openApiSchema: input.openApiSchema || matchingTemplate.openApiSchema,
    documentationUrl: input.documentationUrl || matchingTemplate.docsUrl,
    urlHost: input.urlHost || matchingTemplate.apiUrl,
    documentationKeywords: uniqueKeywords(mergedKeywords),
  } as Integration;
}

function resolveField<T>(newValue: T | null | undefined, oldValue: T | undefined, defaultValue?: T): T | undefined {
  if (newValue === null) return undefined;
  if (newValue !== undefined) return newValue;
  if (oldValue !== undefined) return oldValue;
  return defaultValue;
}

function shouldTriggerDocFetch(input: Integration, existingIntegration?: Integration | null): boolean {
  // If a doc fetch is already in progress, never trigger a new one
  if (existingIntegration?.documentationPending === true) return false;
  // Special case: Manual refresh - if input explicitly sets documentationPending to true. Manual refresh only possible when doc fetching not in progress, so no conflict with condition one.
  if (input.documentationPending === true) return true;
  // Check if documentationUrl is a file:// URL (no need to fetch)
  if (input.documentationUrl?.startsWith('file://')) return false;
  // Trigger a fetch if:
  // 1. This is a new integration (no existing integration)
  if (!existingIntegration) return true;

  // 2. The documentation URL has changed (including from empty to populated)
  if (input.documentationUrl !== existingIntegration.documentationUrl) return true;
  // 3. The URL host/path has changed (affects API endpoint discovery)
  // This can trigger doc fetch even without documentationUrl (e.g., GraphQL introspection)
  if (input.urlHost !== existingIntegration.urlHost) return true;
  if (input.urlPath !== existingIntegration.urlPath) return true;
  // Otherwise, don't trigger a new fetch
  return false;
}

async function triggerAsyncDocumentationFetch(
  input: Integration,
  context: Context
): Promise<void> {
  try {
    // Re-enrich with template to ensure we have all the fields
    const enrichedInput = enrichWithTemplate(input);
    logMessage('info', `Starting async documentation fetch for integration ${input.id}`, { orgId: context.orgId });

    const docFetcher = new Documentation(
      {
        urlHost: enrichedInput.urlHost,
        urlPath: enrichedInput.urlPath,
        documentationUrl: enrichedInput.documentationUrl,
        openApiUrl: enrichedInput.openApiUrl,
        keywords: uniqueKeywords(enrichedInput.documentationKeywords),
      },
      enrichedInput.credentials || {},
      { orgId: context.orgId }
    );

    const docString = await docFetcher.fetchAndProcess();
    const openApiSchema = await docFetcher.fetchOpenApiDocumentation();

    // CRITICAL: Fetch the latest integration state before updating
    // This ensures we don't overwrite any changes made since the initial upsert
    const latestIntegration = await context.datastore.getIntegration({ id: input.id, includeDocs: false, orgId: context.orgId });
    if (!latestIntegration) {
      logMessage('warn', `Integration ${input.id} was deleted while fetching documentation. Skipping upsert.`, { orgId: context.orgId });
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
      orgId: context.orgId
    });
    logMessage('info', `Completed documentation fetch for integration ${input.id}`, { orgId: context.orgId });

  } catch (err) {
    logMessage('error', `Documentation fetch failed for integration ${input.id}: ${String(err)}`, { orgId: context.orgId });

    // Reset documentationPending to false on failure
    try {
      const latestIntegration = await context.datastore.getIntegration({ id: input.id, includeDocs: false, orgId: context.orgId });
      if (latestIntegration) {
        await context.datastore.upsertIntegration({
          id: input.id,
          integration: {
            ...latestIntegration,
            documentationPending: false,
            updatedAt: new Date(),
          },
          orgId: context.orgId
        });
        logMessage('info', `Reset documentationPending to false for integration ${input.id} after fetch failure`, { orgId: context.orgId });
      }
    } catch (resetError) {
      logMessage('error', `Failed to reset documentationPending for integration ${input.id}: ${String(resetError)}`, { orgId: context.orgId });
    }
  }
}

function uniqueKeywords(keywords: string[] | undefined): string[] {
  if (!keywords || keywords.length === 0) return [];
  return [...new Set(keywords)];
}