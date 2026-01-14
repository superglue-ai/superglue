import { parseJSON } from '@core/files/parsers/json.js';
import { logMessage } from '@core/utils/logs.js';
import { sampleResultObject } from '@/packages/shared/utils.js';
import { LLMMessage } from '@core/llm/llm-base-model.js';
import { z } from 'zod';

const softValidationSchema = z.object({
    success: z.boolean().describe('True if the actual result reasonably aligns with the expected criteria (be lenient)'),
    reason: z.string().describe('Brief explanation of why it passes or fails validation (focus on core objectives, not minor differences)')
});

export type SoftValidationResult = z.infer<typeof softValidationSchema>;

export async function validateWorkflowResult(
    actualResult: any,
    expectedResult: string,
    workflowInstruction: string,
    metadata: { orgId: string; userId: string }
): Promise<z.infer<typeof softValidationSchema>> {
    const { LanguageModel } = await import('@core/llm/llm-base-model.js');

        let actualContent = JSON.stringify(actualResult, null, 2);
        if (actualContent.length > 10000) {
            // Sample if too large
            actualContent = JSON.stringify(sampleResultObject(actualResult, 10), null, 2) + "\n\n...truncated...";
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

        const result = await LanguageModel.generateObject<z.infer<typeof softValidationSchema>>({
            messages,
            schema: z.toJSONSchema(softValidationSchema),
            temperature: 0.1
        });

        if (!result.success) {
            logMessage('error', `Soft validation failed: ${result.response}`, metadata);
            return {
                success: false,
                reason: `Validation error: ${result.response}`
            };
        }

        return result.response;
}