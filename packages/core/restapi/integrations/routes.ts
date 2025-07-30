import { Router } from 'express';
import { findRelevantIntegrations, listIntegrations } from './controller.js';
import { authMiddleware } from '../../auth/auth.js';

const router = Router();

router.get('/', authMiddleware, listIntegrations);
router.get('/relevant', authMiddleware, findRelevantIntegrations);

export default router;
