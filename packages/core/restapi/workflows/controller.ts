import { Request, Response } from 'express';
import { listWorkflowsService, getWorkflowService, upsertWorkflowService, deleteWorkflowService, executeWorkflowService, buildWorkflowService } from './services.js';

export const listWorkflows = async (req: Request, res: Response) => {
  const orgId = req.orgId;
  const limit = parseInt(req.query.limit as string) || 10;
  const offset = parseInt(req.query.offset as string) || 0;

  try {
    const result = await listWorkflowsService({ orgId, limit, offset });
    res.status(200).json(result);
  } catch (error) {
    console.error("Error listing workflows:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
};


export const getWorkflow = async (req: Request, res: Response) => {
  const { id } = req.params;
  const orgId = req.orgId;

  if (!id) {
    return res.status(400).json({ error: 'Workflow ID is required' });
  }

  try {
    const workflow = await getWorkflowService({ id, orgId });
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    return res.status(200).json(workflow);
  } catch (error) {
    console.error(`Error fetching workflow ${id}:`, error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const upsertWorkflow = async (req: Request, res: Response) => {
  const orgId = req.orgId;
  const { id, name, steps } = req.body;

  if (!name || !Array.isArray(steps)) {
    return res.status(400).json({ error: 'Name and steps are required' });
  }

  try {
    const result = await upsertWorkflowService( id, steps, orgId );
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error upserting workflow:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};


export const deleteWorkflow = async (req: Request, res: Response) => {
  const { id } = req.params;
  const orgId = req.orgId;

  if (!id) {
    return res.status(400).json({ error: 'Workflow ID is required' });
  }

  try {
    const deleted = await deleteWorkflowService(id, orgId);
    return res.status(200).json({ success: deleted });
  } catch (error) {
    console.error(`Error deleting workflow ${id}:`, error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};


export const executeWorkflow = async (req: Request, res: Response) => {
  const orgId = req.orgId;
  const args = req.body;

  try {
    const result = await executeWorkflowService(orgId, args);
    res.status(200).json(result);
  } catch (err: any) {
    console.error('Error executing workflow:', err);
    res.status(500).json({ error: err.message || 'Failed to execute workflow' });
  }
};


export const buildWorkflow = async (req: Request, res: Response) => {
  const orgId = req.orgId;
  const args = req.body;

  try {
    const workflow = await buildWorkflowService(orgId, args);
    res.status(200).json(workflow);
  } catch (err: any) {
    console.error("Error building workflow:", err);
    res.status(400).json({ error: err.message || "Failed to build workflow" });
  }
};