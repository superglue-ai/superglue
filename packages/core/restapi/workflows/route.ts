import express from 'express';
import { authMiddleware } from '../../auth/auth.js';
import { getWorkflow, listWorkflows, upsertWorkflow, executeWorkflow, buildWorkflow, deleteWorkflow } from './controller.js';

const router = express.Router();

router.get('/', authMiddleware, listWorkflows);
router.get('/:id', authMiddleware, getWorkflow);


router.post('/', authMiddleware, upsertWorkflow);
router.post('/execute', authMiddleware, executeWorkflow);
router.post("/build", authMiddleware, buildWorkflow);


router.delete('/:id', authMiddleware, deleteWorkflow);

export default router;
