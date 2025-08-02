import { Router } from 'express';
import { deleteIntegration, findRelevantIntegrations, getIntegration, listIntegrations, upsertIntegration } from './controller.js';

import { authMiddleware } from '../../auth/auth.js';

const router = Router();

router.get('/', authMiddleware, listIntegrations);
router.get('/relevant', authMiddleware, findRelevantIntegrations);
router.get('/:id', authMiddleware, getIntegration);

router.post('/upsert', authMiddleware, upsertIntegration); 


router.delete('/deleteIntegration/:id', authMiddleware, deleteIntegration);

export default router;
