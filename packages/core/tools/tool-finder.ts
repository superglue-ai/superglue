import { Tool } from "@superglue/shared";
import { Metadata } from "@superglue/shared";
import { logMessage } from "../utils/logs.js";

export interface FoundTool {
    id: string;
    instruction?: string;
    inputSchema?: any;
    steps: Array<{
        integrationId?: string;
        instruction?: string;
    }>;
    responseSchema?: any;
    reason: string;
}

export class ToolFinder {
    private metadata: Metadata;

    constructor(metadata: Metadata) {
        this.metadata = metadata;
    }

    private enrichTool(tool: Tool, reason: string): FoundTool {
        return {
            id: tool.id,
            instruction: tool.instruction,
            inputSchema: tool.inputSchema,
            responseSchema: tool.responseSchema,
            steps: tool.steps.map(s => ({
                integrationId: s.integrationId,
                instruction: s.apiConfig?.instruction
            })),
            reason
        };
    }

    private keywordSearch(query: string, tools: Tool[]): FoundTool[] {
        const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 0);

        const scored = tools.map(tool => {
            const searchableText = [
                tool.id,
                tool.instruction,
                ...tool.steps.map(s => s.apiConfig?.instruction),
                ...tool.steps.map(s => s.integrationId)
            ].filter(Boolean).join(' ').toLowerCase();

            const matchedKeywords = keywords.filter(keyword => searchableText.includes(keyword));
            const score = matchedKeywords.length;

            return {
                tool,
                score,
                matchedKeywords
            };
        });

        const matches = scored.filter(s => s.score > 0);

        if (matches.length === 0) {
            return tools.map(tool => this.enrichTool(tool, "No specific match found, but this tool is available"));
        }

        matches.sort((a, b) => b.score - a.score);

        return matches.map(m =>
            this.enrichTool(m.tool, `Matched keywords: ${m.matchedKeywords.join(', ')}`)
        );
    }

    public async findTools(
        query: string | undefined,
        tools: Tool[]
    ): Promise<FoundTool[]> {
        if (!tools || tools.length === 0) {
            logMessage('info', 'No tools available for selection.', this.metadata);
            return [];
        }

        if (!query || query.trim() === "" || query.trim() === "*" || query.trim() === "all") {
            logMessage('info', 'No specific query provided, returning all available tools.', this.metadata);
            return tools.map(tool => this.enrichTool(tool, "Available tool"));
        }

        const results = this.keywordSearch(query, tools);
        logMessage('info', `Found ${results.length} tools matching search terms`, this.metadata);
        return results;
    }
}

