import type { System, Tool } from "./types.js";

export interface SeedConfig {
  systems: Partial<System>[];
  tools: Partial<Tool>[];
}

export const SEED_CONFIG: SeedConfig = {
  systems: [],
  tools: [],
};

export function getSeedSystemIds(): string[] {
  return SEED_CONFIG.systems.map((s) => s.id!);
}

export function getSeedToolIds(): string[] {
  return SEED_CONFIG.tools.map((t) => t.id!);
}

export function excludeSeededSystems<T extends { id: string }>(systems: T[]): T[] {
  const seedIds = getSeedSystemIds();
  return systems.filter((s) => !seedIds.includes(s.id));
}

export function excludeSeededTools<T extends { id: string }>(tools: T[]): T[] {
  const seedIds = getSeedToolIds();
  return tools.filter((t) => !seedIds.includes(t.id));
}
