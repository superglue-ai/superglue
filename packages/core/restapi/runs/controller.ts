
import { Request, Response } from 'express';
import * as services from './services.js';

export async function listRuns(req: Request, res: Response) {
  try {
    const offset = parseInt(req.query.offset as string) || 0;
    const limit = parseInt(req.query.limit as string) || 10;
    const configId = req.query.configId as string;

    const orgId = req.orgId; 

    // -- Skip configId and orgID check for now while testing --

    // if (!configId) {
    //   return res.status(400).json({ error: "Missing configId in query params" });
    // }

    // if (!orgId) {
    //   return res.status(401).json({ error: "Unauthorized. Missing orgId from auth." });
    // }

    const result = await services.listRuns(limit, offset, configId, orgId);

    return res.status(200).json(result);
  } catch (err) {
    console.error("Error listing runs:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
