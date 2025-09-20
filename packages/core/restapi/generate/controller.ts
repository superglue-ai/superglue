import { Request, Response } from "express";
import { generateSchemaService, generateInstructionsService } from "./services.js";

export const generateSchema = async (req: Request, res: Response) => {
  try {
    const { instruction, responseData } = req.body;
    if (!instruction) return res.status(400).json({ error: "Instruction is required" });

    const result = await generateSchemaService(instruction, responseData, req);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const generateInstructions = async (req: Request, res: Response) => {
  try {
    const { integrations } = req.body;
    if (!integrations || !Array.isArray(integrations)) {
      return res.status(400).json({ error: "Integrations array is required" });
    }

    const result = await generateInstructionsService(integrations, req);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
