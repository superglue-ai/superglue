import { Request, Response } from 'express';
import * as services from './services.js';

export async function listIntegrations(req: Request, res: Response) {
  try {
    const offset = parseInt(req.query.offset as string) || 0;
    const limit = parseInt(req.query.limit as string) || 10;
    const orgId = req.orgId;

    // -- Skip orgID check for now while testing --

    // if (!orgId) {
    //   return res.status(401).json({ error: "Unauthorized. Missing orgId from auth." });
    // }

    const result = await services.listIntegrationService(limit, offset, orgId);
    return res.status(200).json(result);
  } catch (err) {
    console.error("Error listing integrations:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}


export const findRelevantIntegrations = async (req: Request, res: Response) => {
  try {
    const instruction = req.query.instruction as string | undefined;
    const context = req.context;

    const orgId = req.orgId;

    // if (!orgId) {
    //   return res.status(401).json({ error: 'Unauthorized. Missing orgId  from auth.' });
    // }

    const integrations = await services.findRelevantIntegrationService(instruction, orgId);
    res.json(integrations);
  } catch (error) {
    console.error('Error in finding Relevant Integrations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};



export const getIntegration = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: 'Integration ID is required' });
  }

  try {
    const orgId = req.orgId; 

    const integration = await services.getIntegrationById(id, orgId);

    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    return res.status(200).json(integration);
  } catch (error) {
    console.error('Error getting integration:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};


export const upsertIntegration = async (req: Request, res: Response) => {
  try {
    const input = req.body.input;
    const mode = req.body.mode || 'UPSERT';
    const orgId = req.orgId; 
    if (!input || !input.id) {
      return res.status(400).json({ error: 'Missing required field: input.id' });
    }

    const result = await services.upsertIntegrationService(input, mode, orgId);
    res.status(200).json(result);
  } catch (err) {
    console.error('REST: Error upserting integration:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
};