import { Integration } from "@superglue/client";
import { Metadata } from "@superglue/shared";
import { type OpenAI } from "openai";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { LanguageModel } from "../llm/llm.js";
import { SELECTION_PROMPT } from "../llm/prompts.js";
import { logMessage } from "../utils/logs.js";

type ChatMessage = OpenAI.Chat.ChatCompletionMessageParam;

// Define the structure for a suggested integration
export interface SuggestedIntegration {
    id: string;
    reason: string;
    savedCredentials: string[];
}

export class IntegrationSelector {
    private metadata: Metadata;

    constructor(metadata: Metadata) {
        this.metadata = metadata;
    }

    public async select(
        instruction: string | undefined,
        integrations: Integration[]
    ): Promise<SuggestedIntegration[]> {
        // Handle case where no integrations are available
        if (!integrations || integrations.length === 0) {
            logMessage('info', 'No integrations available for selection.', this.metadata);
            return [];
        }

        // Handle empty/undefined instruction or special cases like "*" or "all"
        if (!instruction || instruction.trim() === "" || instruction.trim() === "*" || instruction.trim() === "all") {
            logMessage('info', 'No specific instruction provided, returning all available integrations.', this.metadata);
            return integrations.map(int => ({
                id: int.id,
                reason: "Available integration (no specific instruction provided)",
                savedCredentials: Object.keys(int.credentials || {})
            }));
        }

        const selectionSchema = zodToJsonSchema(z.object({
            suggestedIntegrations: z.array(z.object({
                id: z.string().describe("The ID of the suggested integration."),
                reason: z.string().describe("A brief explanation of why this integration is relevant to the user's instruction.")
            })).describe("A list of integrations that are relevant to the user's request.")
        }));

        const integrationDescriptions = integrations.map(int => {
            return `
---
Integration ID: ${int.id}
Documentation Summary: ${int.documentation?.slice(0, 1000)}
${int.specificInstructions ? `User Instructions for this integration: ${int.specificInstructions}\n` : ''}
`;
        }).join("\n");

        const messages: ChatMessage[] = [
            { role: "system", content: SELECTION_PROMPT },
            {
                role: "user",
                content: `
Based on the user's instruction, select the most relevant integrations from the following list.

User Instruction:
"${instruction}"

Available Integrations:
${integrationDescriptions}

Return a JSON object conforming to the schema, containing a list of suggested integration IDs no longer than 10 in order of relevance and a brief reason for each selection. If no integrations are relevant, return an empty list.
`
            }
        ];

        try {
            const { response: rawSelection } = await LanguageModel.generateObject(
                messages,
                selectionSchema
            );

            if (rawSelection && rawSelection.suggestedIntegrations && Array.isArray(rawSelection.suggestedIntegrations)) {
                // Enrich LLM suggestions with credentials
                const suggestions = rawSelection.suggestedIntegrations.map(suggestion => {
                    const integration = integrations.find(int => int.id === suggestion.id);
                    return {
                        id: suggestion.id,
                        reason: suggestion.reason,
                        savedCredentials: integration ? Object.keys(integration.credentials || {}) : []
                    };
                });

                // If LLM returned no specific integrations, fallback to all integrations
                if (suggestions.length === 0) {
                    logMessage('info', 'Integration selector returned no specific integrations. Returning all available integrations as a fallback.', this.metadata);
                    return integrations.map(int => ({
                        id: int.id,
                        reason: "No specific match found for your request, but this integration is available for use",
                        savedCredentials: Object.keys(int.credentials || {})
                    }));
                }

                return suggestions;
            }

            logMessage('warn', "Integration selection returned an unexpected format. Returning all available integrations as fallback.", this.metadata);
            // Return all integrations as fallback if the format is not as expected
            return integrations.map(int => ({
                id: int.id,
                reason: "Selection failed, but this integration is available for use",
                savedCredentials: Object.keys(int.credentials || {})
            }));

        } catch (error) {
            logMessage('error', `Error during integration selection: ${error}`, this.metadata);
            logMessage('info', 'Returning all available integrations as fallback due to selection error.', this.metadata);
            return integrations.map(int => ({
                id: int.id,
                reason: "Selection failed due to error, but this integration is available for use",
                savedCredentials: Object.keys(int.credentials || {})
            }));
        }
    }
} 