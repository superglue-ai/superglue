import { Integration } from "@superglue/client";
import { Metadata } from "@superglue/shared";
import { type OpenAI } from "openai";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { LanguageModel } from "../llm/llm.js";
import { SELECTION_PROMPT } from "../llm/prompts.js";
import { Documentation } from "../utils/documentation.js";
import { logMessage } from "../utils/logs.js";

type ChatMessage = OpenAI.Chat.ChatCompletionMessageParam;

// Define the structure for a suggested integration
export interface SuggestedIntegration {
    id: string;
    reason: string;
    credentials: any;
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
        if (!instruction || instruction.trim() === "" || instruction.trim() === "*" || instruction.trim() === "all") {
            // If no instruction or instruction is *, return all integrations with a generic reason
            return integrations.map(int => ({
                id: int.id,
                reason: "Available integration (no specific instruction provided)",
                credentials: int.credentials || {}
            }));
        }

        const selectionSchema = zodToJsonSchema(z.object({
            suggestedIntegrations: z.array(z.object({
                id: z.string().describe("The ID of the suggested integration."),
                reason: z.string().describe("A brief explanation of why this integration is relevant to the user's instruction.")
            })).describe("A list of integrations that are relevant to the user's request.")
        }));

        const integrationDescriptions = integrations.map(int => {
            const processedDoc = Documentation.postProcess(int.documentation || "", instruction);
            return `
---
Integration ID: ${int.id}
Documentation Summary:
\`\`\`
${processedDoc || 'No documentation available.'}
\`\`\`
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
                return rawSelection.suggestedIntegrations.map(suggestion => {
                    const integration = integrations.find(int => int.id === suggestion.id);
                    return {
                        id: suggestion.id,
                        reason: suggestion.reason,
                        credentials: integration ? (integration.credentials || {}) : {}
                    };
                });
            }

            logMessage('warn', "Integration selection returned an unexpected format.", this.metadata);
            return []; // Return empty if the format is not as expected

        } catch (error) {
            logMessage('error', `Error during integration selection: ${error}`, this.metadata);
            throw new Error(`Failed to select integrations: ${error}`);
        }
    }
} 