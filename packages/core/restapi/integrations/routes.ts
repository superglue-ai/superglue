import { Router } from 'express';
import { findRelevantIntegrations, getIntegration, listIntegrations, upsertIntegration } from './controller.js';
import { authMiddleware } from '../../auth/auth.js';

const router = Router();

router.get('/', authMiddleware, listIntegrations);
router.get('/relevant', authMiddleware, findRelevantIntegrations);
router.get('/:id', authMiddleware, getIntegration);

router.post('/upsert', upsertIntegration); 

export default router;
