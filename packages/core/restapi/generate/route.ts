import express from "express";
import { generateSchema, generateInstructions } from "./controller.js";
import { authMiddleware } from "../../auth/auth.js";

const router = express.Router();

router.post("/schema", authMiddleware, generateSchema);
router.post("/instructions", authMiddleware, generateInstructions);

export default router;
