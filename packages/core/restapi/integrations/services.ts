import { createDataStore } from '../../datastore/datastore.js';
import { Metadata } from "@superglue/shared";
import {IntegrationSelector} from '../../integrations/integration-selector.js';
import { logMessage } from '../../utils/logs.js';
import { Integration } from '@superglue/client';
import { generateUniqueId } from '@superglue/shared/utils';
import { integrations, findMatchingIntegration } from '@superglue/shared';
import { composeUrl } from '../../utils/tools.js';
import { Documentation } from '../../utils/documentation.js';


const datastore = createDataStore({
  type: String(process.env.DATASTORE_TYPE || 'memory').toLowerCase() as 'redis' | 'memory' | 'file' | 'postgres',
});


export async function listIntegrationService(limit: number, offset: number, orgId: string) {

  try {
    return await datastore.listIntegrations({ limit, offset, orgId });
  } catch (error) {
    logMessage('error', `Error listing integrations: ${String(error)}`, { orgId });
    throw error;
  }

}


export const findRelevantIntegrationService = async (instruction: string | undefined, orgId: any) => {

  const logInstruction = instruction ? `instruction: ${instruction}` : 'no instruction (returning all integrations)';

  logMessage('info', `Finding relevant integrations for ${logInstruction}`, { orgId });

  try {
    const metadata: Metadata = {
      orgId,
      runId: crypto.randomUUID()
    };
    const allIntegrations = await datastore.listIntegrations({ limit: 1000, offset: 0, orgId });

    const selector = new IntegrationSelector(metadata);
    return await selector.select(instruction, allIntegrations.items || []);
  } catch (error) {
    logMessage('error', `Error finding relevant integrations: ${String(error)}`, { orgId });
    throw error;
  }
};


export const getIntegrationById = async (id: string, orgId: any) => {

  // if (!datastore || !orgId) {
  //   throw new Error('Missing datastore or orgId in context');
  // }

  try {

    const integration = await datastore.getIntegration({ id, orgId });
    return integration;

  }catch (error) {  
    logMessage('error', `Error getting integration by ID ${id}: ${String(error)}`, { orgId });
    throw error;
  }
};





export async function upsertIntegrationService(input: Integration, mode: 'CREATE' | 'UPDATE' | 'UPSERT', orgId: any) {
  const now = new Date();

  let existing = await datastore.getIntegration({id: input.id, includeDocs: false, orgId });

  if (mode === 'UPSERT') {
    mode = existing ? 'UPDATE' : 'CREATE';
  }

  if (mode === 'CREATE') {
    if (existing) {
      input.id = await generateUniqueId({
        baseId: input.id,
        exists: async (id) =>
          !!(await datastore.getIntegration({id, orgId})),
      });
      existing = null;
    }
    input = enrichWithTemplate(input);
  } else if (mode === 'UPDATE' && !existing) {
    throw new Error(`Integration with ID '${input.id}' not found.`);
  }

  const shouldFetchDoc = shouldTriggerDocFetch(input, existing);

  if (shouldFetchDoc) {
    triggerAsyncDocumentationFetch(input, orgId);
  }

  const integrationToSave = {
    id: input.id,
    name: resolveField(input.name, existing?.name, ''),
    urlHost: resolveField(input.urlHost, existing?.urlHost, ''),
    urlPath: resolveField(input.urlPath, existing?.urlPath, ''),
    documentationUrl: resolveField(input.documentationUrl, existing?.documentationUrl, ''),
    documentation: resolveField(input.documentation, existing?.documentation, ''),
    openApiUrl: resolveField(input.openApiUrl, existing?.openApiUrl, ''),
    openApiSchema: resolveField(input.openApiSchema, existing?.openApiSchema, ''),
    documentationPending: shouldFetchDoc ? true : (existing?.documentationPending || false),
    credentials: resolveField(input.credentials, existing?.credentials, {}),
    specificInstructions: resolveField(input.specificInstructions?.trim(), existing?.specificInstructions, ''),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  return await datastore.upsertIntegration(
    {id: input.id, 
    orgId,
    integration: integrationToSave
    }
  );
}


// --- helpers Functions START---

function resolveField<T>(newValue: T | null | undefined, oldValue: T | undefined, defaultValue?: T): T | undefined {
  if (newValue === null) return undefined;
  if (newValue !== undefined) return newValue;
  if (oldValue !== undefined) return oldValue;
  return defaultValue;
}

function enrichWithTemplate(input: Integration): Integration {
  const match = integrations[String(input.name || input.id).toLowerCase()] ||
    findMatchingIntegration(composeUrl(input.urlHost, input.urlPath))?.integration;

  if (!match) return input;

  return {
    ...input,
    openApiUrl: match.openApiUrl,
    openApiSchema: match.openApiSchema,
    documentationUrl: match.docsUrl,
    urlHost: match.apiUrl,
  } as Integration;
}

function shouldTriggerDocFetch(input: Integration, existing?: Integration | null): boolean {
  if (existing?.documentationPending === true) return false;
  if (input.documentationPending === true) return true;
  if (input.documentationUrl?.startsWith('file://')) return false;
  if (!existing) return true;
  if (input.documentationUrl !== existing.documentationUrl) return true;
  if (input.urlHost !== existing.urlHost || input.urlPath !== existing.urlPath) return true;
  return false;
}

async function triggerAsyncDocumentationFetch(input: Integration, context: any): Promise<void> {
  try {
    const enrichedInput = enrichWithTemplate(input);
    logMessage('info', `Starting async documentation fetch for ${input.id}`, { orgId: context.orgId });

    const docFetcher = new Documentation(
      {
        urlHost: enrichedInput.urlHost,
        urlPath: enrichedInput.urlPath,
        documentationUrl: enrichedInput.documentationUrl,
        openApiUrl: enrichedInput.openApiUrl,
      },
      enrichedInput.credentials || {},
      { orgId: context.orgId }
    );

    const doc = await docFetcher.fetchAndProcess();
    const schema = await docFetcher.fetchOpenApiDocumentation();

    const latest = await context.datastore.getIntegration({ id: input.id, includeDocs: false, orgId: context.orgId });
    if (!latest) return;

    await context.datastore.upsertIntegration({
      id: input.id,
      integration: {
        ...latest,
        documentation: doc,
        documentationPending: false,
        openApiSchema: schema,
        updatedAt: new Date(),
      },
      orgId: context.orgId,
    });
  } catch (err) {
    logMessage('error', `Doc fetch failed for ${input.id}: ${String(err)}`, { orgId: context.orgId });
    const latest = await context.datastore.getIntegration({ id: input.id, includeDocs: false, orgId: context.orgId });
    if (latest) {
      await context.datastore.upsertIntegration({
        id: input.id,
        integration: {
          ...latest,
          documentationPending: false,
          updatedAt: new Date(),
        },
        orgId: context.orgId,
      });
    }
  }
}


// --- helpers Functions END---
