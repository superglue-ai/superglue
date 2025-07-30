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
