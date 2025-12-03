import { Integration } from "@superglue/shared";
import { ServiceMetadata } from "@superglue/shared";
import { logMessage } from "../utils/logs.js";

export interface FoundIntegration {
    integration: Integration;
    reason: string;
}

export class IntegrationFinder {
    private metadata: ServiceMetadata;

    constructor(metadata: ServiceMetadata) {
        this.metadata = metadata;
    }

    private keywordSearch(searchTerms: string, integrations: Integration[]): FoundIntegration[] {
        const keywords = searchTerms.toLowerCase().split(/\s+/).filter(k => k.length > 0);

        const scored = integrations.map(integration => {
            const searchableText = [
                integration.id,
                integration.specificInstructions,
                integration.documentationUrl,
                ...(integration.documentationKeywords || [])
            ].filter(Boolean).join(' ').toLowerCase();

            const matchedKeywords = keywords.filter(keyword => searchableText.includes(keyword));
            const score = matchedKeywords.length;

            return {
                integration,
                score,
                matchedKeywords
            };
        });

        const matches = scored.filter(s => s.score > 0);

        if (matches.length === 0) {
            return integrations.map(int => ({
                integration: int,
                reason: "No specific match found, but this integration is available"
            }));
        }

        matches.sort((a, b) => b.score - a.score);

        return matches.map(m => ({
            integration: m.integration,
            reason: `Matched keywords: ${m.matchedKeywords.join(', ')}`
        }));
    }

    public async findIntegrations(
        instruction: string | undefined,
        integrations: Integration[]
    ): Promise<FoundIntegration[]> {

        if (!integrations || integrations.length === 0) {
            logMessage('info', 'No integrations available for selection.', this.metadata);
            return [];
        }

        if (!instruction || instruction.trim() === "" || instruction.trim() === "*" || instruction.trim() === "all") {
            logMessage('info', 'No specific instruction provided, returning all available integrations.', this.metadata);
            return integrations.map(int => ({
                integration: int,
                reason: "Available integration"
            }));
        }

        const results = this.keywordSearch(instruction, integrations);
        logMessage('info', `Found ${results.length} integrations matching search terms`, this.metadata);
        return results;
    }
} 