import { Integration, Workflow } from '@superglue/client';
import { server_defaults } from '../default.js';
import { DocumentationSearch } from '../documentation/documentation-search.js';
import { composeUrl } from '../utils/tools.js';
import { buildFullObjectSection, buildPreviewSection, buildSamplesSection, buildSchemaSection, stringifyWithLimits } from './context-helpers.js';
import { BuildToolContextOptions, EvaluateStepResponseContextInput, EvaluateStepResponseContextOptions, EvaluateTransformContextInput, EvaluateTransformContextOptions, ExtractContextInput, ExtractContextOptions, FindRelevantIntegrationsContextInput, FindRelevantIntegrationsContextOptions, FindRelevantToolsContextInput, FindRelevantToolsContextOptions, IntegrationContextOptions, LoopSelectorContextInput, LoopSelectorContextOptions, ObjectContextOptions, TransformContextInput, TransformContextOptions, WorkflowBuilderContextInput, WorkflowBuilderContextOptions } from './context-types.js';

export function getObjectContext(obj: any, opts: ObjectContextOptions): string {

    if (opts.include?.schema === false && opts.include?.preview === false && opts.include?.samples === false) return '';

    const previewDepthLimit = opts.tuning?.previewDepthLimit ?? server_defaults.CONTEXT.JSON_PREVIEW_DEPTH_LIMIT;
    const previewArrayLimit = opts.tuning?.previewArrayLimit ?? server_defaults.CONTEXT.JSON_PREVIEW_ARRAY_LIMIT;
    const previewObjectKeyLimit = opts.tuning?.previewObjectKeyLimit ?? server_defaults.CONTEXT.JSON_PREVIEW_OBJECT_KEY_LIMIT;
    const samplesMaxArrayPaths = opts.tuning?.samplesMaxArrayPaths ?? server_defaults.CONTEXT.JSON_SAMPLES_MAX_ARRAY_PATHS;
    const samplesItemsPerArray = opts.tuning?.samplesItemsPerArray ?? server_defaults.CONTEXT.JSON_SAMPLES_ITEMS_PER_ARRAY;
    const sampleObjectMaxDepth = opts.tuning?.sampleObjectMaxDepth ?? server_defaults.CONTEXT.JSON_SAMPLE_OBJECT_MAX_DEPTH;
    const includeSchema = opts.include?.schema !== false;
    const includePreview = opts.include?.preview !== false;
    const includeSamples = opts.include?.samples !== false;
    const enabledParts: Array<'schema' | 'preview' | 'samples'> = [];
    if (includeSchema) enabledParts.push('schema');
    if (includePreview) enabledParts.push('preview');
    if (includeSamples) enabledParts.push('samples');
    if (enabledParts.length === 0) return '';

    const budget = Math.max(0, opts.characterBudget | 0);
    if (budget === 0) return '';

    let perShare = Math.floor(budget / enabledParts.length);
    let remainingCarry = 0;
    const sections: string[] = [];

    const nonSchemaEnabled = includePreview || includeSamples;
    const fullJson = nonSchemaEnabled ? stringifyWithLimits(obj, Infinity, Infinity, Infinity, false) : '';
    if (nonSchemaEnabled) {
        if (includeSchema) {
            // 1/3 schema, 2/3 full JSON
            const schemaShare = Math.floor(budget / 3);
            const fullShare = budget - schemaShare; // 2/3
            // Schema first
            const schemaStr = buildSchemaSection(obj, schemaShare);
            sections.push(schemaStr.text);
            // Full object block
            if (fullJson.length <= fullShare) {
                sections.push(buildFullObjectSection(fullJson));
                const combined = sections.filter(Boolean).join('\n\n');
                return combined.slice(0, budget);
            }
        } else {
            if (fullJson.length <= budget) {
                sections.push(buildFullObjectSection(fullJson));
                return sections[0].slice(0, budget);
            }
        }
    }

    if (includeSchema) {
        const share = perShare + remainingCarry;
        const schemaStr = buildSchemaSection(obj, share);
        sections.push(schemaStr.text);
        remainingCarry = Math.max(0, share - schemaStr.text.length);
    }

    if (includePreview) {
        const share = perShare + remainingCarry;
        const previewStr = buildPreviewSection(obj, share, previewDepthLimit, previewArrayLimit, previewObjectKeyLimit);
        sections.push(previewStr.text);
        remainingCarry = Math.max(0, share - previewStr.text.length);
    }

    if (includeSamples) {
        const share = perShare + remainingCarry;
        const samplesStr = buildSamplesSection(obj, share, previewDepthLimit, previewArrayLimit, previewObjectKeyLimit, samplesMaxArrayPaths, samplesItemsPerArray, sampleObjectMaxDepth);
        sections.push(samplesStr.text);
        remainingCarry = Math.max(0, share - samplesStr.text.length);
    }

    const combined = sections.filter(Boolean).join('\n\n');
    return combined.slice(0, budget);
}

function buildIntegrationContext(integration: Integration, opts: IntegrationContextOptions): string {
    const budget = Math.max(0, opts.characterBudget | 0);
    if (budget === 0) return '';

    const authMaxSections = opts.tuning?.documentationMaxSections ?? server_defaults.CONTEXT.INTEGRATIONS.AUTH_MAX_SECTIONS;
    const authSectionSize = opts.tuning?.documentationMaxChars ?? server_defaults.CONTEXT.INTEGRATIONS.AUTH_SECTION_SIZE_CHARS;
    const paginationMaxSections = opts.tuning?.documentationMaxSections ?? server_defaults.CONTEXT.INTEGRATIONS.PAGINATION_MAX_SECTIONS;
    const paginationSectionSize = opts.tuning?.documentationMaxChars ?? server_defaults.CONTEXT.INTEGRATIONS.PAGINATION_SECTION_SIZE_CHARS;
    const generalMaxSections = opts.tuning?.documentationMaxSections ?? server_defaults.CONTEXT.INTEGRATIONS.GENERAL_MAX_SECTIONS;
    const generalSectionSize = opts.tuning?.documentationMaxChars ?? server_defaults.CONTEXT.INTEGRATIONS.GENERAL_SECTION_SIZE_CHARS;

    const docSearch = new DocumentationSearch((undefined as any));
    const authSection = docSearch.extractRelevantSections(
        integration.documentation,
        "authentication authorization key token bearer basic oauth credentials",
        authMaxSections,
        authSectionSize,
        integration.openApiSchema
    );

    const paginationSection = docSearch.extractRelevantSections(
        integration.documentation,
        "pagination page offset cursor limit per_page pageSize after next previous paging paginated results list",
        paginationMaxSections,
        paginationSectionSize,
        integration.openApiSchema
    );
    const generalDocSection = docSearch.extractRelevantSections(
        integration.documentation,
        "reference object endpoints methods properties values fields enums search query filter list create update delete get put post patch",
        generalMaxSections,
        generalSectionSize,
        integration.openApiSchema
    );

    const xml_opening_tag = `<${integration.id}>`;
    const urlSection = '<base_url>: ' + composeUrl(integration.urlHost, integration.urlPath) + '</base_url>';
    const specificInstructionsSection = '<instructions>: ' + (integration.specificInstructions?.length > 0 ? integration.specificInstructions : "No specific instructions provided.") + '</instructions>';
    const xml_closing_tag = `</${integration.id}>`;
    return xml_opening_tag + '\n' + [urlSection, specificInstructionsSection, authSection, paginationSection, generalDocSection].filter(Boolean).join('\n').slice(0, budget - xml_opening_tag.length - xml_closing_tag.length) + '\n' + xml_closing_tag;
}

function buildAvailableVariableContext(payload: any, integrations: Integration[]): string {
    const availableVariables = [
        ...integrations.flatMap(int => Object.keys(int.credentials || {}).map(k => `<<${int.id}_${k}>>`)),
        ...Object.keys(payload || {}).map(k => `<<${k}>>`)
    ].join(", ");

    return availableVariables || 'No variables available'
}

function buildToolContext(tool: Workflow, opts: BuildToolContextOptions): string {
    const budget = Math.max(0, opts.characterBudget | 0);

    const toolOpeningTag = `<${tool.id}>`;
    const toolInstructionContext = `<tool_instruction>${tool.instruction}</tool_instruction>`;
    const integrationsUsedByToolStepsContext = `<integrations_used_in_tool_steps>${tool.steps.map(step => step.integrationId).join(', ')}</integrations_used_in_tool_steps>`;;
    const toolClosingTag = `</${tool.id}>`;
    return toolOpeningTag + '\n' + [toolInstructionContext, integrationsUsedByToolStepsContext].filter(Boolean).join('\n').slice(0, budget - toolOpeningTag.length - toolClosingTag.length) + '\n' + toolClosingTag;
}

export function getWorkflowBuilderContext(input: WorkflowBuilderContextInput, options: WorkflowBuilderContextOptions): string {
    const budget = Math.max(0, options.characterBudget | 0);
    if (budget === 0) return '';
    const hasIntegrations = input.integrations.length > 0;

    const prompt_start = `Build a complete workflow to fulfill the user's request.`;
    const userInstructionContext = options.include.userInstruction ? `<instruction>${input.userInstruction}</instruction>` : '';
    const availableVariablesContext = options.include?.availableVariablesContext ? `<available_variables>${buildAvailableVariableContext(input.payload, input.integrations)}</available_variables>` : '';
    const payloadContext = options.include?.payloadContext ? `<workflow_input>${getObjectContext(input.payload, { include: { schema: true, preview: false, samples: true }, characterBudget: budget * 0.5 })}</workflow_input>` : '';
    const integrationContext = options.include?.integrationContext ? `<available_integrations_and_documentation>${hasIntegrations ? input.integrations.map(int => buildIntegrationContext(int, { characterBudget: budget })).join('\n') : 'No integrations provided. Build a transform-only workflow using finalTransform to process the payload data.'}</available_integrations_and_documentation>` : '';
    const prompt_end = hasIntegrations ? 'Ensure that the final output matches the instruction and you use ONLY the available integration ids.' : 'Since no integrations are available, create a transform-only workflow with no steps, using only the finalTransform to process the payload data.';
    const prompt = prompt_start + '\n' + ([userInstructionContext, integrationContext, availableVariablesContext, payloadContext].filter(Boolean).join('\n')).slice(0, budget - prompt_start.length - prompt_end.length) + '\n' + prompt_end;
    return prompt;
}

export function getExtractContext(input: ExtractContextInput, options: ExtractContextOptions): string {
    const budget = Math.max(0, options.characterBudget | 0);
    if (budget === 0) return '';

    const prompt_start = `Generate API configuration for the following:`;
    const instructionContext = `<instruction>${input.extractConfig.instruction}</instruction>`;
    const baseUrlContext = `<base_url>${composeUrl(input.extractConfig.urlHost, input.extractConfig.urlPath)}</base_url>`;
    const documentationContext = `<documentation>${input.documentation}</documentation>`;
    const credentialsContext = `<credentials>${Object.keys(input.credentials || {}).join(", ")}</credentials>`;
    const payloadContext = `<extract_input>${getObjectContext(input.payload, { include: { schema: true, preview: false, samples: true }, characterBudget: budget * 0.5 })}</extract_input>`;
    const lastErrorContext = input.lastError ? `<last_error>${input.lastError}</last_error>` : '';
    const prompt = prompt_start + '\n' + ([instructionContext, baseUrlContext, documentationContext, credentialsContext, payloadContext, lastErrorContext].filter(Boolean).join('\n')).slice(0, budget - prompt_start.length);
    return prompt;
}

export function getLoopSelectorContext(input: LoopSelectorContextInput, options: LoopSelectorContextOptions): string {
    const budget = Math.max(0, options.characterBudget | 0);
    if (budget === 0) return '';

    const prompt_start = `Create a JavaScript function that extracts the array of items to loop over for step: ${input.step.id} from the payload (sourceData). The function should: 1. Extract an array of ACTUAL DATA ITEMS (not metadata or property definitions) 2. Apply any filtering based on the step's instruction`;
    const instructionContext = `<instruction>${input.step.apiConfig.instruction}</instruction>`;
    const payloadContext = `<loop_selector_input>${getObjectContext(input.payload, { include: { schema: true, preview: true, samples: false }, characterBudget: budget * 0.9 })}</loop_selector_input>`;
    const prompt_end = `The function should return an array of items that this step will iterate over.`;
    const prompt = prompt_start + '\n' + ([instructionContext, payloadContext].filter(Boolean).join('\n')).slice(0, budget - prompt_start.length - prompt_end.length) + '\n' + prompt_end;
    return prompt;
}

export function getEvaluateStepResponseContext(input: EvaluateStepResponseContextInput, options: EvaluateStepResponseContextOptions): string {
    const budget = Math.max(0, options.characterBudget | 0);
    if (budget === 0) return '';

    const prompt_start = `Evaluate the response returned by the step and return { success: true, shortReason: "", refactorNeeded: false } if the data in the response aligns with the instruction. If the data does not align with the instruction, return { success: false, shortReason: "reason why it does not align", refactorNeeded: false }.`;
    const dataContext = `<step_response>${getObjectContext(input.data, { include: { schema: true, preview: true, samples: false }, characterBudget: budget * 0.9 })}</step_response>`;
    const endpointContext = `<step_config>${JSON.stringify(input.endpoint)}</step_config>`;
    const docSearchResultsForStepInstructionContext = `<doc_search_results_for_step_instruction>${input.docSearchResultsForStepInstruction}</doc_search_results_for_step_instruction>`;
    const prompt = prompt_start + '\n' + ([dataContext, endpointContext, docSearchResultsForStepInstructionContext].filter(Boolean).join('\n')).slice(0, budget - prompt_start.length);
    return prompt;
}

export function getTransformContext(input: TransformContextInput, options: TransformContextOptions): string {
    const budget = Math.max(0, options.characterBudget | 0);
    if (budget === 0) return '';

    const prompt_start = `Given a source data object, create a JavaScript function that transforms the input data according to the instruction.`;
    const instructionContext = `<instruction>${input.instruction}</instruction>`;
    const schemaContext = `<target_schema>${JSON.stringify(input.targetSchema)}</target_schema>`;
    const dataContext = `<transform_input>${getObjectContext(input.sourceData, { include: { schema: true, preview: true, samples: true }, characterBudget: budget * 0.9 })}</transform_input>`;
    const prompt = prompt_start + '\n' + ([instructionContext, schemaContext, dataContext].filter(Boolean).join('\n')).slice(0, budget - prompt_start.length);
    return prompt;
}

export function getEvaluateTransformContext(input: EvaluateTransformContextInput, options: EvaluateTransformContextOptions): string {
    const budget = Math.max(0, options.characterBudget | 0);
    if (budget === 0) return '';

    const promptStart = input.instruction ? `<instruction>${input.instruction}</instruction>` : 'No specific instruction provided; focus on mapping the source data to the target schema as closely as possible.';
    const targetSchemaContext = input.targetSchema ? `<target_schema>${JSON.stringify(input.targetSchema)}</target_schema>` : '';
    const sourceDataContext = `<transform_input>${getObjectContext(input.sourceData, { include: { schema: true, preview: true, samples: true }, characterBudget: budget * 0.4 })}</transform_input>`;
    const transformedDataContext = `<transform_output>${getObjectContext(input.transformedData, { include: { schema: true, preview: true, samples: true }, characterBudget: budget * 0.4 })}</transform_output>`;
    const transformCodeContext = `<transform_code>${input.transformCode}</transform_code>`;
    const promptEnd = `Please evaluate the transformation based on the criteria in the system prompt, considering that samples may not show all data values present in the full dataset.`;
    const prompt = promptStart + '\n' + ([targetSchemaContext, sourceDataContext, transformedDataContext, transformCodeContext].filter(Boolean).join('\n')).slice(0, budget - promptStart.length - promptEnd.length) + '\n' + promptEnd;
    return prompt;
}

export function getFindRelevantIntegrationsContext(input: FindRelevantIntegrationsContextInput, options: FindRelevantIntegrationsContextOptions): string {
    const budget = Math.max(0, options.characterBudget | 0);
    if (budget === 0) return '';

    const promptStart = `Based on the search terms, select the most relevant integrations from the following list.`
    const searchTermsContext = `<search_terms>${input.searchTerms}</search_terms>`;
    const availableIntegrationsContext = `<availableIntegrations>${input.availableIntegrations.map(int => buildIntegrationContext(int, { characterBudget: 1500, include: { authContext: false, paginationContext: false, generalContext: true } })).join('\n')}</availableIntegrations>`;
    const promptEnd = `Return a JSON object conforming to the schema, containing a list of suggested integration IDs no longer than 10 in order of relevance and a brief reason for each selection. If no integrations are relevant, return an empty list.`
    const prompt = promptStart + '\n' + ([searchTermsContext, availableIntegrationsContext].filter(Boolean).join('\n')).slice(0, budget - promptStart.length - promptEnd.length) + '\n' + promptEnd;
    return prompt;
}

export function getFindRelevantToolsContext(input: FindRelevantToolsContextInput, options: FindRelevantToolsContextOptions): string {
    const budget = Math.max(0, options.characterBudget | 0);
    if (budget === 0) return '';

    const promptStart = `Based on the search terms, select the most relevant tools from the following list.`
    const searchTermsContext = `<search_terms>${input.searchTerms}</search_terms>`;
    const availableToolsContext = `<available_tools>${input.availableTools.map(tool => buildToolContext(tool, { characterBudget: 1500 })).join('\n')}</available_tools>`;
    const promptEnd = `Return a JSON object conforming to the schema, containing a list of suggested tool IDs no longer than 10 in order of relevance and a brief reason for each selection. If no tools are relevant, return an empty list.`
    const prompt = promptStart + '\n' + ([searchTermsContext, availableToolsContext].filter(Boolean).join('\n')).slice(0, budget - promptStart.length - promptEnd.length) + '\n' + promptEnd;
    return prompt;
}

