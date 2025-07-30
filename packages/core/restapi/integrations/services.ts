import { createDataStore } from '../../datastore/datastore.js';
import { Metadata } from "@superglue/shared";
import {IntegrationSelector} from '../../integrations/integration-selector.js';
import { logMessage } from '../../utils/logs.js';


const datastore = createDataStore({
  type: String(process.env.DATASTORE_TYPE || 'memory').toLowerCase() as 'redis' | 'memory' | 'file' | 'postgres',
});


export async function listIntegrationService(limit: number, offset: number, orgId: string) {

  try {
    return await datastore.listIntegrations(limit, offset, orgId);
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
    const allIntegrations = await datastore.listIntegrations(1000, 0, orgId);

    const selector = new IntegrationSelector(metadata);
    return await selector.select(instruction, allIntegrations.items || []);
  } catch (error) {
    logMessage('error', `Error finding relevant integrations: ${String(error)}`, { orgId });
    throw error;
  }
};