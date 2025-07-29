
import { Router } from 'express';
import { listRuns } from './controller.js'
import { authMiddleware } from '../../auth/auth.js';

const router = Router();

router.get('/', authMiddleware, listRuns);


export default router;
