
import { Router } from 'express';
import { listRuns, getRun } from './controller.js'
import { authMiddleware } from '../../auth/auth.js';

const router = Router();

router.get('/', authMiddleware, listRuns);

router.get("/:id", authMiddleware, getRun);


export default router;
