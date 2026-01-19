import { System } from "@superglue/shared";
import { ServiceMetadata } from "@superglue/shared";

export interface FoundSystem {
  system: System;
  reason: string;
}

export class SystemFinder {
  private metadata: ServiceMetadata;

  constructor(metadata: ServiceMetadata) {
    this.metadata = metadata;
  }

  private keywordSearch(searchTerms: string, systems: System[]): FoundSystem[] {
    const keywords = searchTerms
      .toLowerCase()
      .split(/\s+/)
      .filter((k) => k.length > 0);

    const scored = systems.map((system) => {
      const searchableText = [
        system.id,
        system.specificInstructions,
        system.documentationUrl,
        ...(system.documentationKeywords || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchedKeywords = keywords.filter((keyword) => searchableText.includes(keyword));
      const score = matchedKeywords.length;

      return {
        system,
        score,
        matchedKeywords,
      };
    });

    const matches = scored.filter((s) => s.score > 0);

    if (matches.length === 0) {
      return systems.map((sys) => ({
        system: sys,
        reason: "No specific match found, but this system is available",
      }));
    }

    matches.sort((a, b) => b.score - a.score);

    return matches.map((m) => ({
      system: m.system,
      reason: `Matched keywords: ${m.matchedKeywords.join(", ")}`,
    }));
  }

  public async findSystems(
    instruction: string | undefined,
    systems: System[],
  ): Promise<FoundSystem[]> {
    if (!systems || systems.length === 0) {
      return [];
    }

    if (
      !instruction ||
      instruction.trim() === "" ||
      instruction.trim() === "*" ||
      instruction.trim() === "all"
    ) {
      return systems.map((sys) => ({
        system: sys,
        reason: "Available system",
      }));
    }

    const results = this.keywordSearch(instruction, systems);
    return results;
  }
}
