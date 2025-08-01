import { Router } from 'express';
import { findRelevantIntegrations, getIntegration, listIntegrations } from './controller.js';
import { authMiddleware } from '../../auth/auth.js';

const router = Router();

router.get('/', authMiddleware, listIntegrations);
router.get('/relevant', authMiddleware, findRelevantIntegrations);
router.get('/:id', authMiddleware, getIntegration);

export default router;
