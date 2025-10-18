import { parseJSON } from "../../utils/json-parser.js";
import { logMessage } from '../../utils/logs.js';
import { sample } from '../../utils/tools.js';
import { LLMMessage } from '../../llm/llm.js';

export interface SoftValidationResult {
    success: boolean;
    reason: string;
}

export async function validateWorkflowResult(
    actualResult: any,
    expectedResult: string,
    workflowInstruction: string,
    metadata: { orgId: string; userId: string }
): Promise<SoftValidationResult> {
    try {
        // Lazy import to ensure env vars are loaded
        const { LanguageModel } = await import('../../llm/llm.js');

        let actualContent = JSON.stringify(actualResult, null, 2);
        if (actualContent.length > 10000) {
            // Sample if too large
            actualContent = JSON.stringify(sample(actualResult, 10), null, 2) + "\n\n...truncated...";
        }

        let expectedContent = expectedResult;
        let isExpectedJson = false;

        try {
            const parsed = parseJSON(expectedResult);
            expectedContent = JSON.stringify(parsed, null, 2);
            isExpectedJson = true;
        } catch (e) {
            expectedContent = expectedResult;
            isExpectedJson = false;
        }

        const systemPrompt = `You are a workflow result validator for integration testing. Your job is to determine if the actual workflow result meets the expected criteria.

IMPORTANT CONSIDERATIONS:
- For operations that create, update, delete, or send data (non-retrieval operations), minimal or empty responses often indicate success
- An empty response body (like {}, [], null, or "") can be a valid successful response, especially for:
  * Resource creation/updates where the API acknowledges receipt without returning data
  * Deletion operations that return no content
  * Asynchronous operations that accept requests for processing
  * Messaging/notification APIs that confirm delivery without response data
- For retrieval operations, an empty response might indicate no matching data was found (which could be valid)
- Always consider the workflow instruction type to understand expected response patterns
- Focus on whether the response contains the REQUESTED DATA or achieves the INTENDED OUTCOME, not the exact structure
- DO NOT fail validation just because field names differ from what's mentioned in the expected result

VALIDATION APPROACH:
1. If the expected result is a JSON structure, check if the actual result contains similar data (flexible matching)
2. If the expected result is a description, check if the actual result reasonably fulfills that description
3. Be lenient with numerical expectations - if expecting "1230 records" and get 1229 or 1231, that's likely acceptable
4. Consider the original workflow instruction for context
5. Structural differences are fine - focus on whether the core data/outcome is present

FLEXIBILITY GUIDELINES:
- Field names don't need to match exactly (e.g., "customer_id" vs "customerId" vs "id" are equivalent)
- Extra fields in the actual result are perfectly fine
- Order of items in arrays doesn't matter unless explicitly stated
- Data types can be flexible (e.g., "123" vs 123 for IDs)
- Nested structures can vary as long as the data is present
- Aggregations, groupings, or sorting will be handled in later steps if needed`;

        const userPrompt = `Workflow Instruction: "${workflowInstruction}"

Expected Result:
${isExpectedJson ? '(JSON Structure - flexible matching expected)' : '(Description - general guidance)'}
${expectedContent}

Actual Result:
${actualContent}

Please validate if the actual result reasonably aligns with the expected criteria. Remember to be lenient and focus on whether the core objective was achieved.`;

        const messages: LLMMessage[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ];

        const schema = {
            type: 'object',
            properties: {
                success: {
                    type: 'boolean',
                    description: 'True if the actual result reasonably aligns with the expected criteria (be lenient)'
                },
                reason: {
                    type: 'string',
                    description: 'Brief explanation of why it passes or fails validation (focus on core objectives, not minor differences)'
                }
            },
            required: ['success', 'reason'],
            additionalProperties: false
        };

        const response = await LanguageModel.generateObject(messages, schema, 0.1);

        logMessage('debug',
            `Soft validation result: success=${response.response.success}`,
            metadata
        );

        return response.response;

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logMessage('error', `Soft validation failed: ${errorMsg}`, metadata);

        return {
            success: false,
            reason: `Validation error: ${errorMsg}`
        };
    }
}