import { Integration } from '@superglue/client';
import { server_defaults } from '../default.js';
import { DocumentationSearch } from '../documentation/documentation-search.js';
import { logMessage } from '../utils/logs.js';
import { composeUrl } from '../utils/tools.js';
import { buildFullObjectSection, buildPreviewSection, buildSamplesSection, buildSchemaSection, stringifyWithLimits } from './context-helpers.js';
import { EvaluateStepResponseContextInput, EvaluateStepResponseContextOptions, EvaluateTransformContextInput, EvaluateTransformContextOptions, IntegrationContextOptions, LoopSelectorContextInput, LoopSelectorContextOptions, ObjectContextOptions, TransformContextInput, TransformContextOptions, ToolBuilderContextInput, ToolBuilderContextOptions, GenerateStepConfigContextInput, GenerateStepConfigContextOptions } from './context-types.js';

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
        "pagination page offset cursor limit per_page pageSize",
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
    const specificInstructionsSection = '<integration_specific_instructions>: ' + (integration.specificInstructions?.length > 0 ? integration.specificInstructions : "No integration-specific instructions provided.") + '</integration_specific_instructions>';
    const xml_closing_tag = `</${integration.id}>`;
    const newlineCount = 2;
    const availableBudget = budget - xml_opening_tag.length - xml_closing_tag.length - newlineCount;
    return xml_opening_tag + '\n' + [urlSection, specificInstructionsSection, authSection, paginationSection, generalDocSection].filter(Boolean).join('\n').slice(0, availableBudget) + '\n' + xml_closing_tag;
}

function buildAvailableVariableContext(payload: any, integrations: Integration[]): string {
    const availableVariables = [
        ...integrations.flatMap(int => Object.keys(int.credentials || {}).map(k => `<<${int.id}_${k}>>`)),
        ...Object.keys(payload || {}).map(k => `<<${k}>>`)
    ].join(", ");

    return availableVariables || 'No variables available'
}

export function getToolBuilderContext(input: ToolBuilderContextInput, options: ToolBuilderContextOptions): string {
    const budget = Math.max(0, options.characterBudget | 0);
    if (budget === 0) return '';
    const hasIntegrations = input.integrations.length > 0;

    const prompt_start = `Build a complete workflow to fulfill the user's instruction.`;
    const prompt_end = hasIntegrations ? 'Ensure that the final output matches the instruction and you use ONLY the available integration ids.' : 'Since no integrations are available, create a transform-only workflow with no steps, using only the finalTransform to process the payload data.';
    const userInstructionContext = options.include.userInstruction ? `<instruction>${input.userInstruction}</instruction>` : '';

    const availableVariablesWrapperLength = '<available_variables>'.length + '</available_variables>'.length;
    const payloadWrapperLength = '<workflow_input>'.length + '</workflow_input>'.length;
    const integrationWrapperLength = '<available_integrations_and_documentation>'.length + '</available_integrations_and_documentation>'.length;

    const newlineCount = 5;
    const totalWrapperLength = (options.include?.availableVariablesContext ? availableVariablesWrapperLength : 0) +
        (options.include?.payloadContext ? payloadWrapperLength : 0) +
        (options.include?.integrationContext ? integrationWrapperLength : 0);
    const essentialLength = prompt_start.length + prompt_end.length + userInstructionContext.length + newlineCount + totalWrapperLength;

    if (budget <= essentialLength) {
        logMessage('warn', `Character budget (${budget}) is less than or equal to essential context length (${essentialLength}) in getWorkflowBuilderContext`, {});
        return prompt_start + '\n' + userInstructionContext + '\n' + prompt_end;
    }

    const remainingBudget = budget - essentialLength;
    const availableVariablesBudget = Math.floor(remainingBudget * 0.1);
    const payloadBudget = Math.floor(remainingBudget * 0.2);
    const integrationBudget = Math.floor(remainingBudget * 0.7);

    const availableVariablesContent = buildAvailableVariableContext(input.payload, input.integrations).slice(0, availableVariablesBudget);
    const integrationContent = hasIntegrations
        ? input.integrations.map(int => buildIntegrationContext(int, { characterBudget: Math.floor(integrationBudget / input.integrations.length) })).join('\n').slice(0, integrationBudget)
        : 'No integrations provided. Build a transform-only workflow using finalTransform to process the payload data.'.slice(0, integrationBudget);

    const availableVariablesContext = options.include?.availableVariablesContext ? `<available_variables>${availableVariablesContent}</available_variables>` : '';
    const payloadContext = options.include?.payloadContext ? `<workflow_input>${getObjectContext(input.payload, { include: { schema: true, preview: false, samples: true }, characterBudget: payloadBudget })}</workflow_input>` : '';
    const integrationContext = options.include?.integrationContext ? `<available_integrations_and_documentation>${integrationContent}</available_integrations_and_documentation>` : '';

    return prompt_start + '\n' + userInstructionContext + '\n' + integrationContext + '\n' + availableVariablesContext + '\n' + payloadContext + '\n' + prompt_end;
}

export function getLoopSelectorContext(input: LoopSelectorContextInput, options: LoopSelectorContextOptions): string {
    const budget = Math.max(0, options.characterBudget | 0);
    if (budget === 0) return '';

    const prompt_start = `Create a JavaScript function that extracts the array of items to loop over for step: ${input.step.id} from the payload (sourceData). The function should: 1. Extract an array of ACTUAL DATA ITEMS (not metadata or property definitions) 2. Apply any filtering based on the step's instruction`;
    const instructionContext = `<instruction>${input.step.apiConfig.instruction}</instruction>`;
    const prompt_end = `The function should return an array of items that this step will iterate over.`;

    const payloadWrapperLength = '<loop_selector_input>'.length + '</loop_selector_input>'.length;
    const newlineCount = 3;
    const essentialLength = prompt_start.length + instructionContext.length + prompt_end.length + newlineCount + payloadWrapperLength;

    if (budget <= essentialLength) {
        logMessage('warn', `Character budget (${budget}) is less than or equal to essential context length (${essentialLength}) in getLoopSelectorContext`, {});
        return prompt_start + '\n' + instructionContext + '\n' + prompt_end;
    }

    const remainingBudget = budget - essentialLength;
    const payloadContext = `<loop_selector_input>${getObjectContext(input.payload, { include: { schema: true, preview: true, samples: false }, characterBudget: remainingBudget })}</loop_selector_input>`;

    return prompt_start + '\n' + instructionContext + '\n' + payloadContext + '\n' + prompt_end;
}

export function getEvaluateStepResponseContext(input: EvaluateStepResponseContextInput, options: EvaluateStepResponseContextOptions): string {
    const budget = Math.max(0, options.characterBudget | 0);
    if (budget === 0) return '';

    const prompt_start = `Evaluate the response returned by the step and return { success: true, shortReason: "", refactorNeeded: false } if the data in the response aligns with the instruction. If the data does not align with the instruction, return { success: false, shortReason: "reason why it does not align", refactorNeeded: false }.`;
    const configContext = `<step_config>${JSON.stringify(input.config)}</step_config>`;

    const dataWrapperLength = '<step_response>'.length + '</step_response>'.length;
    const docSearchWrapperLength = '<doc_search_results_for_step_instruction>'.length + '</doc_search_results_for_step_instruction>'.length;
    const newlineCount = 3;
    const essentialLength = prompt_start.length + configContext.length + newlineCount + dataWrapperLength + docSearchWrapperLength;

    if (budget <= essentialLength) {
        logMessage('warn', `Character budget (${budget}) is less than or equal to essential context length (${essentialLength}) in getEvaluateStepResponseContext`, {});
        return prompt_start + '\n' + configContext;
    }

    const remainingBudget = budget - essentialLength;
    const dataContextBudget = Math.floor(remainingBudget * 0.8);
    const docSearchBudget = Math.floor(remainingBudget * 0.2);

    const dataContext = `<step_response>${getObjectContext(input.data, { include: { schema: true, preview: true, samples: false }, characterBudget: dataContextBudget })}</step_response>`;
    const docSearchResultsForStepInstructionContext = `<doc_search_results_for_step_instruction>${input.docSearchResultsForStepInstruction.slice(0, docSearchBudget)}</doc_search_results_for_step_instruction>`;

    return prompt_start + '\n' + configContext + '\n' + dataContext + '\n' + docSearchResultsForStepInstructionContext;
}

export function getTransformContext(input: TransformContextInput, options: TransformContextOptions): string {
    const budget = Math.max(0, options.characterBudget | 0);
    if (budget === 0) return '';

    const prompt_start = `Given a source data object, create a JavaScript function that transforms the input data according to the instruction.`;
    const instructionContext = `<instruction>${input.instruction}</instruction>`;
    const schemaContext = input.targetSchema ? `<target_schema>${JSON.stringify(input.targetSchema)}</target_schema>` : '';

    const dataWrapperLength = '<transform_input>'.length + '</transform_input>'.length;
    const newlineCount = 3;
    const essentialLength = prompt_start.length + instructionContext.length + schemaContext.length + newlineCount + dataWrapperLength;

    if (budget <= essentialLength) {
        logMessage('warn', `Character budget (${budget}) is less than or equal to essential context length (${essentialLength}) in getTransformContext`, {});
        return prompt_start + '\n' + instructionContext + '\n' + schemaContext;
    }

    const remainingBudget = budget - essentialLength;
    const dataContext = `<transform_input>${getObjectContext(input.sourceData, { include: { schema: true, preview: true, samples: true }, characterBudget: remainingBudget })}</transform_input>`;

    return prompt_start + '\n' + instructionContext + '\n' + schemaContext + '\n' + dataContext;
}

export function getEvaluateTransformContext(input: EvaluateTransformContextInput, options: EvaluateTransformContextOptions): string {
    const budget = Math.max(0, options.characterBudget | 0);
    if (budget === 0) return '';

    const promptStart = input.instruction ? `<instruction>${input.instruction}</instruction>` : 'No specific instruction provided; focus on mapping the source data to the target schema as closely as possible.';
    const transformCodeContext = `<transform_code>${input.transformCode}</transform_code>`;
    const promptEnd = `Please evaluate the transformation based on the criteria in the system prompt, considering that samples may not show all data values present in the full dataset.`;

    const targetSchemaWrapperLength = '<target_schema>'.length + '</target_schema>'.length;
    const sourceDataWrapperLength = '<transform_input>'.length + '</transform_input>'.length;
    const transformedDataWrapperLength = '<transform_output>'.length + '</transform_output>'.length;
    const totalWrapperLength = targetSchemaWrapperLength + sourceDataWrapperLength + transformedDataWrapperLength;
    const newlineCount = 5;
    const essentialLength = promptStart.length + transformCodeContext.length + promptEnd.length + newlineCount + totalWrapperLength;

    if (budget <= essentialLength) {
        logMessage('warn', `Character budget (${budget}) is less than or equal to essential context length (${essentialLength}) in getEvaluateTransformContext`, {});
        return promptStart + '\n' + transformCodeContext + '\n' + promptEnd;
    }

    const remainingBudget = budget - essentialLength;
    const targetSchemaBudget = Math.floor(remainingBudget * 0.2);
    const sourceDataBudget = Math.floor(remainingBudget * 0.4);
    const transformedDataBudget = Math.floor(remainingBudget * 0.4);

    const targetSchemaContext = input.targetSchema ? `<target_schema>${JSON.stringify(input.targetSchema).slice(0, targetSchemaBudget)}</target_schema>` : '';
    const sourceDataContext = `<transform_input>${getObjectContext(input.sourceData, { include: { schema: true, preview: true, samples: true }, characterBudget: sourceDataBudget })}</transform_input>`;
    const transformedDataContext = `<transform_output>${getObjectContext(input.transformedData, { include: { schema: true, preview: true, samples: true }, characterBudget: transformedDataBudget })}</transform_output>`;

    return promptStart + '\n' + targetSchemaContext + '\n' + sourceDataContext + '\n' + transformedDataContext + '\n' + transformCodeContext + '\n' + promptEnd;
}


export function getGenerateStepConfigContext(input: GenerateStepConfigContextInput, options: GenerateStepConfigContextOptions): string {
    const budget = Math.max(0, options.characterBudget | 0);
    if (budget === 0) return '';

    const promptStart = options.mode === 'create'
        ? `Generate a new API configuration to execute this instruction:`
        : options.mode === 'self-healing'
        ? `The previous step config failed. Generate a corrected configuration that executes the step instruction:`
        : `Edit the step configuration according to the edit instructions:`;

    const instructionContext = `<step_instruction>${input.instruction}</step_instruction>`;
    const stepConfigContext = input.previousStepConfig ? `<previous_step_config>${JSON.stringify(input.previousStepConfig)}</previous_step_config>` : '';
    const errorContext = input.errorMessage ? `<error_message>${input.errorMessage}</error_message>` : '';
    const editInstructionsContext = input.editInstruction ? `<edit_instructions>${input.editInstruction}</edit_instructions>` : '';

    const documentationWrapperLength = '<documentation>'.length + '</documentation>'.length;
    const stepInputWrapperLength = '<step_input>'.length + '</step_input>'.length;
    const integrationInstructionsWrapperLength = '<integration_specific_instructions>'.length + '</integration_specific_instructions>'.length;
    const credentialsWrapperLength = '<available_credentials>'.length + '</available_credentials>'.length;
    const totalWrapperLength = documentationWrapperLength + stepInputWrapperLength + integrationInstructionsWrapperLength + credentialsWrapperLength;

    let newlineCount = 6;
    if (stepConfigContext) newlineCount += 1;
    if (errorContext) newlineCount += 1;
    if (editInstructionsContext) newlineCount += 1;

    const essentialLength = promptStart.length + instructionContext.length + stepConfigContext.length + errorContext.length + editInstructionsContext.length + newlineCount + totalWrapperLength;

    if (budget <= essentialLength) {
        logMessage('warn', `Character budget (${budget}) is less than or equal to essential context length (${essentialLength}) in getGenerateStepConfigContext`, {});
        let minimalContext = promptStart + '\n' + instructionContext;
        if (editInstructionsContext) minimalContext += '\n' + editInstructionsContext;
        if (stepConfigContext) minimalContext += '\n' + stepConfigContext;
        if (errorContext) minimalContext += '\n' + errorContext;
        return minimalContext;
    }

    const remainingBudget = budget - essentialLength;
    const documentationBudget = Math.floor(remainingBudget * 0.4);
    const stepInputBudget = Math.floor(remainingBudget * 0.4);
    const integrationInstructionsBudget = Math.floor(remainingBudget * 0.1);
    const credentialsBudget = Math.floor(remainingBudget * 0.1);

    const documentationContent = input.integrationDocumentation.slice(0, documentationBudget);
    const integrationSpecificInstructions = input.integrationSpecificInstructions.slice(0, integrationInstructionsBudget);
    const credentialsContent = Object.keys(input.credentials).map(v => `<<${v}>>`).join(", ").slice(0, credentialsBudget);

    const documentationContext = `<documentation>${documentationContent}</documentation>`;
    const stepInputContext = `<step_input>${getObjectContext(input.stepInput, { include: { schema: true, preview: false, samples: true }, characterBudget: stepInputBudget })}</step_input>`;
    const integrationInstructionsContext = `<integration_specific_instructions>${integrationSpecificInstructions}</integration_specific_instructions>`;
    const credentialsContext = `<available_credentials>${credentialsContent}</available_credentials>`;

    let contextParts = [promptStart, instructionContext];
    if (editInstructionsContext) contextParts.push(editInstructionsContext);
    if (stepConfigContext) contextParts.push(stepConfigContext);
    if (errorContext) contextParts.push(errorContext);
    contextParts.push(documentationContext, stepInputContext, integrationInstructionsContext, credentialsContext);

    return contextParts.join('\n');
}

