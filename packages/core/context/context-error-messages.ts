import { getObjectContext } from "./context-builders.js";
import { AuthErrorContextInput, AuthErrorContextOptions, ClientErrorContextInput, ClientErrorContextOptions, Deceptive2xxErrorContextInput, Deceptive2xxErrorContextOptions, FinalTransformErrorContextInput, FinalTransformErrorContextOptions, FtpBodyStructureErrorContextInput, FtpBodyStructureErrorContextOptions, FtpOperationExecutionErrorContextInput, FtpOperationExecutionErrorContextOptions, LoopSelectorErrorContextInput, LoopSelectorErrorContextOptions, MissingDataErrorContextInput, MissingDataErrorContextOptions, PaginationErrorContextInput, PaginationErrorContextOptions, PaginationStopConditionErrorContextInput, PaginationStopConditionErrorContextOptions, PostgresBodyStructureErrorContextInput, PostgresBodyStructureErrorContextOptions, PostgresSqlExecutionErrorContextInput, PostgresSqlExecutionErrorContextOptions, StepValidationErrorContextInput, StepValidationErrorContextOptions, VarResolverErrorContextInput, VarResolverErrorContextOptions } from "./context-types.js";

export function getPaginationErrorContext(input: PaginationErrorContextInput, options: PaginationErrorContextOptions): string {
    const budget = Math.max(0, options.characterBudget | 0);
    if (budget === 0) return '';

    const { paginationType, apiConfig, missingVariables } = input;

    if (!missingVariables || missingVariables.length === 0) {
        return '';
    }

    const paginationRelevantFields = {
        queryParams: apiConfig.queryParams,
        body: apiConfig.body,
        headers: apiConfig.headers,
        urlPath: apiConfig.urlPath
    };

    const promptStart = `The API configuration is invalid. You configured pagination type as ${paginationType}, but required variable(s) are missing.`;
    const instructionContext = `<instruction>${apiConfig.instruction}</instruction>`;
    const paginationTypeContext = `<pagination_type>${paginationType}</pagination_type>`;
    const missingVarsList = missingVariables.map(v => `<<${v}>>`).join(' and ');
    const missingVariablesContext = `<missing_variables>${missingVarsList}</missing_variables>`;
    const currentConfigContext = `<current_config>${JSON.stringify(paginationRelevantFields, null, 2)}</current_config>`;
    const promptEnd = `You MUST include these variables in queryParams, body, or headers and respect user instructions for pagination.`;
    const prompt = promptStart + '\n' + ([instructionContext, paginationTypeContext, missingVariablesContext, currentConfigContext].filter(Boolean).join('\n')).slice(0, budget - promptStart.length - promptEnd.length) + '\n' + promptEnd;
    return prompt;
}

export function getVarResolverErrorContext(input: VarResolverErrorContextInput, options: VarResolverErrorContextOptions): string {
    const budget = Math.max(0, options.characterBudget | 0);
    if (budget === 0) return '';

    const { apiConfig, configField, errorType, varReference, originalErrorMessage, allVariables } = input;

    const promptStart = `Failed to resolve expression in  ${configField}. The expression <<${varReference}>> could not be evaluated.`;
    const errorTypeContext = `<error_type>${errorType}</error_type>`;
    const failedExpressionContext = `<failed_expression>${varReference}</failed_expression>`;
    const originalErrorMessageContext = originalErrorMessage ? `<original_error_message>${originalErrorMessage}</original_error_message>` : '';
    const apiConfigContext = `<raw_api_config>${JSON.stringify(apiConfig, null, 2)}</raw_api_config>`;
    const allVariablesContext = `<all_variables>${getObjectContext(allVariables, { include: { schema: true, preview: true, samples: false }, characterBudget: Math.floor(budget * 0.4) })}</all_variables>`;
    const promptEnd = errorType === "code_execution_error"
        ? `Fix the JavaScript expression syntax or logic. Ensure the expression returns the correct value.`
        : `Use one of the available top level keys in sourceData or fix the variable name. If you need data from the step input (sourceData), write a JavaScript expression to extract it.`;
    const prompt = promptStart + '\n' + ([errorTypeContext, failedExpressionContext, originalErrorMessageContext, apiConfigContext, allVariablesContext].filter(Boolean).join('\n')).slice(0, budget - promptStart.length - promptEnd.length) + '\n' + promptEnd;
    return prompt;
}

export function getPostgresBodyStructureErrorContext(input: PostgresBodyStructureErrorContextInput, options: PostgresBodyStructureErrorContextOptions): string {
    const budget = Math.max(0, options.characterBudget | 0);
    if (budget === 0) return '';

    const { bodyContent, parseError, parsedBody } = input;

    const promptStart = parseError
        ? `Invalid JSON in Postgres body. The body could not be parsed.`
        : `Invalid Postgres body structure. The body must contain a 'query' field.`;
    const bodyContentContext = `<body_content>${bodyContent}</body_content>`;
    const parseErrorContext = parseError ? `<parse_error>${parseError}</parse_error>` : '';
    const parsedBodyContext = parsedBody ? `<parsed_body>${JSON.stringify(parsedBody, null, 2)}</parsed_body>` : '';
    const promptEnd = `The body must be valid JSON with a 'query' field containing the SQL statement. Optionally include 'params' or 'values' array for parameterized queries.`;

    const prompt = promptStart + '\n' + ([bodyContentContext, parseErrorContext, parsedBodyContext].filter(Boolean).join('\n')).slice(0, budget - promptStart.length - promptEnd.length) + '\n' + promptEnd;
    return prompt;
}

export function getPostgresSqlExecutionErrorContext(input: PostgresSqlExecutionErrorContextInput, options: PostgresSqlExecutionErrorContextOptions): string {
    const budget = Math.max(0, options.characterBudget | 0);
    if (budget === 0) return '';

    const { queryText, queryParams, postgresError, allVariables } = input;

    const promptStart = `PostgreSQL query execution failed.`;
    const queryContext = `<query>${queryText}</query>`;
    const paramsContext = queryParams ? `<params>${JSON.stringify(queryParams)}</params>` : '';
    const errorContext = `<postgres_error>${postgresError}</postgres_error>`;
    const allVariablesContext = `<available_variables>${getObjectContext(allVariables, { include: { schema: true, preview: false, samples: false }, characterBudget: Math.floor(budget * 0.4) })}</available_variables>`;
    const promptEnd = `Fix the SQL syntax, ensure the table/columns exist, and verify parameter types match the query placeholders.`;

    const prompt = promptStart + '\n' + ([queryContext, paramsContext, errorContext, allVariablesContext].filter(Boolean).join('\n')).slice(0, budget - promptStart.length - promptEnd.length) + '\n' + promptEnd;
    return prompt;
}

export function getFtpBodyStructureErrorContext(input: FtpBodyStructureErrorContextInput, options: FtpBodyStructureErrorContextOptions): string {
    const budget = Math.max(0, options.characterBudget | 0);
    if (budget === 0) return '';

    const { bodyContent, parseError, parsedBody, missingOperation, invalidOperation } = input;
    const SUPPORTED_OPERATIONS = ['list', 'get', 'put', 'delete', 'rename', 'mkdir', 'rmdir', 'exists', 'stat'];

    let promptStart: string;
    if (parseError) {
        promptStart = `Invalid JSON in FTP body. The body could not be parsed.`;
    } else if (missingOperation) {
        promptStart = `Invalid FTP body structure. The body must contain an 'operation' field.`;
    } else if (invalidOperation) {
        promptStart = `Unsupported FTP operation '${invalidOperation}'.`;
    } else {
        promptStart = `Invalid FTP body structure.`;
    }

    const bodyContentContext = `<body_content>${bodyContent.slice(0, 1500)}</body_content>`;
    const parseErrorContext = parseError ? `<parse_error>${parseError}</parse_error>` : '';
    const parsedBodyContext = parsedBody ? `<parsed_body>${JSON.stringify(parsedBody, null, 2)}</parsed_body>` : '';
    const supportedOpsContext = `<supported_operations>${SUPPORTED_OPERATIONS.join(', ')}</supported_operations>`;

    let promptEnd: string;
    if (parseError && (bodyContent.includes('%PDF') || bodyContent.includes('�') || parseError.includes('Unexpected token %'))) {
        promptEnd = `Binary content detected. Base64 encode before embedding: {"operation": "put", "path": "/file.pdf", "content": "<<(sourceData) => Buffer.from(sourceData.fileData).toString('base64')>>"}`;
    } else if (parseError) {
        promptEnd = `JSON parse failed. Common causes: binary content needs base64 encoding, unescaped backslashes in paths, special characters, or content is too large. Ensure body is valid JSON with 'operation' field.`;
    } else {
        promptEnd = `The body must be valid JSON with an 'operation' field.`;
    }

    const prompt = promptStart + '\n' + ([bodyContentContext, parseErrorContext, parsedBodyContext, supportedOpsContext].filter(Boolean).join('\n')).slice(0, budget - promptStart.length - promptEnd.length) + '\n' + promptEnd;
    return prompt;
}

export function getFtpOperationExecutionErrorContext(input: FtpOperationExecutionErrorContextInput, options: FtpOperationExecutionErrorContextOptions): string {
    const budget = Math.max(0, options.characterBudget | 0);
    if (budget === 0) return '';

    const { operation, protocol, ftpError, allVariables } = input;

    const promptStart = `${protocol.toUpperCase()} operation failed.`;
    const operationContext = `<operation>${JSON.stringify(operation, null, 2)}</operation>`;
    const errorContext = `<ftp_error>${ftpError}</ftp_error>`;
    const allVariablesContext = `<available_variables>${getObjectContext(allVariables, { include: { schema: true, preview: true, samples: false }, characterBudget: Math.floor(budget * 0.3) })}</available_variables>`;
    const promptEnd = `Check the path exists and ensure the operation parameters are correct.`;
    const prompt = promptStart + '\n' + ([operationContext, errorContext, allVariablesContext].filter(Boolean).join('\n')).slice(0, budget - promptStart.length - promptEnd.length) + '\n' + promptEnd;
    return prompt;
}

export function getAuthErrorContext(input: AuthErrorContextInput, options: AuthErrorContextOptions): string {
    const budget = Math.max(0, options.characterBudget | 0);
    if (budget === 0) return '';

    const { statusCode, method, url, responseData, headers, allVariables, retriesAttempted, lastFailureStatus } = input;

    const retryInfo = retriesAttempted ? ` (retries: ${retriesAttempted}${lastFailureStatus ? `, last failure: ${lastFailureStatus}` : ''})` : '';
    const promptStart = `Authentication failed with status ${statusCode}${retryInfo}.`;
    const requestContext = `<request>${method} ${url}</request>`;
    const headersStr = JSON.stringify(headers, null, 2);
    const headersContext = `<request_headers>${headersStr}</request_headers>`;
    const responseStr = typeof responseData === 'string' ? responseData : JSON.stringify(responseData);
    const responseContext = `<response_data>${responseStr}</response_data>`;
    const availableVarsContext = `<available_top_level_variables>${Object.keys(allVariables)}</available_top_level_variables>`;
    const promptEnd = `Verify authentication headers are correct. Check the API response_data for hints on what went wrong.`;
    const prompt = promptStart + '\n' + ([requestContext, headersContext, responseContext, availableVarsContext].filter(Boolean).join('\n')).slice(0, budget - promptStart.length - promptEnd.length) + '\n' + promptEnd;
    return prompt;
}

export function getClientErrorContext(input: ClientErrorContextInput, options: ClientErrorContextOptions): string {
    const budget = Math.max(0, options.characterBudget | 0);
    if (budget === 0) return '';

    const { statusCode, method, url, responseData, requestConfig, retriesAttempted, lastFailureStatus } = input;

    const retryInfo = retriesAttempted ? ` (retries: ${retriesAttempted}${lastFailureStatus ? `, last failure: ${lastFailureStatus}` : ''})` : '';
    const promptStart = `Request failed with status ${statusCode}${retryInfo}.`;
    const requestContext = `<request>${method} ${url}</request>`;
    const responseStr = typeof responseData === 'string' ? responseData : JSON.stringify(responseData);
    const responseContext = `<response>${responseStr}</response>`;
    const configStr = JSON.stringify(requestConfig, null, 2);
    const configContext = `<api_config>${configStr}</api_config>`;

    let promptEnd: string;
    if (statusCode === 404) {
        promptEnd = `The endpoint was not found. Check the URL path, ensure the resource exists, and verify the HTTP method is correct.`;
    } else if (statusCode === 400 || statusCode === 422) {
        promptEnd = `The request was malformed. Check query parameters, request body format, and ensure all required fields are included.`;
    } else {
        promptEnd = `Check the request configuration, verify all required parameters are included, and ensure the data format matches API expectations.`;
    }
    const prompt = promptStart + '\n' + ([requestContext, responseContext, configContext].filter(Boolean).join('\n')).slice(0, budget - promptStart.length - promptEnd.length) + '\n' + promptEnd;
    return prompt;
}

export function getDeceptive2xxErrorContext(input: Deceptive2xxErrorContextInput, options: Deceptive2xxErrorContextOptions): string {
    const budget = Math.max(0, options.characterBudget | 0);
    if (budget === 0) return '';

    const { statusCode, method, url, responseData, detectionReason, detectedValue } = input;

    const promptStart = `Request returned ${statusCode} but appears to be an error.`;
    const requestContext = `<request>${method} ${url}</request>`;
    const detectionContext = `<detection_reason>${detectionReason}</detection_reason>`;
    const detectedValueContext = detectedValue ? `<detected_value>${detectedValue}</detected_value>` : '';
    const responseStr = typeof responseData === 'string' ? responseData : JSON.stringify(responseData);
    const responseContext = `<response_preview>${responseStr}</response_preview>`;
    const promptEnd = `The API returned a success status but the response contains error indicators. Check if the endpoint URL is correct, verify the API documentation, or adjust query parameters.`;

    const prompt = promptStart + '\n' + ([requestContext, detectionContext, detectedValueContext, responseContext].filter(Boolean).join('\n')).slice(0, budget - promptStart.length - promptEnd.length) + '\n' + promptEnd;
    return prompt;
}

export function getMissingDataErrorContext(input: MissingDataErrorContextInput, options: MissingDataErrorContextOptions): string {
    const budget = Math.max(0, options.characterBudget | 0);
    if (budget === 0) return '';

    const { endpoint, statusCode, headers } = input;

    const promptStart = `API call returned no data. The request succeeded (status ${statusCode}) but the response body was empty or null.`;
    const endpointContext = `<endpoint>${JSON.stringify({ method: endpoint.method, urlHost: endpoint.urlHost, urlPath: endpoint.urlPath, queryParams: endpoint.queryParams, body: endpoint.body }, null, 2)}</endpoint>`;
    const statusContext = `<status_code>${statusCode}</status_code>`;
    const headersContext = `<response_headers>${JSON.stringify(headers, null, 2)}</response_headers>`;
    const promptEnd = `Check if the endpoint URL is correct and verify the request succeeded with data (some APIs return 204 No Content for successful operations).`;

    const prompt = promptStart + '\n' + ([endpointContext, statusContext, headersContext].filter(Boolean).join('\n')).slice(0, budget - promptStart.length - promptEnd.length) + '\n' + promptEnd;
    return prompt;
}

export function getStepValidationErrorContext(input: StepValidationErrorContextInput, options: StepValidationErrorContextOptions): string {
    const budget = Math.max(0, options.characterBudget | 0);
    if (budget === 0) return '';

    const { endpoint, responseData, validationReason } = input;

    const promptStart = `Step response validation failed. The API returned data but it does not match the step instruction.`;
    const instructionContext = `<step_instruction>${endpoint.instruction}</step_instruction>`;
    const validationReasonContext = `<validation_reason>${validationReason}</validation_reason>`;
    const responseDataContext = `<response_data>${getObjectContext(responseData, { include: { schema: true, preview: true, samples: true }, characterBudget: Math.floor(budget * 0.8) })}</response_data>`;
    const promptEnd = `The response does not match the instruction. Review the instruction, check if the endpoint/parameters are correct and think about whether the returned data is valid.`;

    const prompt = promptStart + '\n' + ([instructionContext, validationReasonContext, responseDataContext].filter(Boolean).join('\n')).slice(0, budget - promptStart.length - promptEnd.length) + '\n' + promptEnd;
    return prompt;
}

export function getLoopSelectorErrorContext(input: LoopSelectorErrorContextInput, options: LoopSelectorErrorContextOptions): string {
    const budget = Math.max(0, options.characterBudget | 0);
    if (budget === 0) return '';

    const { step, payload, errorMessage, generatedCode } = input;

    const errorParts = errorMessage.split(': ');
    const errorType = errorParts[0];
    const errorDetail = errorParts.slice(1).join(': ');

    const promptStart = errorType === "validation_error"
        ? `Loop selector for step '${step.id}' did not return an array.`
        : errorType === "execution_error"
            ? `Loop selector code failed to execute for step '${step.id}'.`
            : `Failed to generate loop selector code for step '${step.id}'.`;

    const instructionContext = `<step_instruction>${step.apiConfig.instruction}</step_instruction>`;
    const generatedCodeContext = generatedCode ? `<generated_code>${generatedCode}</generated_code>` : '';
    const errorContext = `<error>${errorDetail}</error>`;
    const payloadContext = `<sourceData>${getObjectContext(payload, { include: { schema: true, preview: false, samples: true }, characterBudget: Math.floor(budget * 0.5) })}</sourceData>`;
    const promptEnd = `Generate a function that extracts an array of items from sourceData: (sourceData) => sourceData.arrayField`;

    const prompt = promptStart + '\n' + ([instructionContext, generatedCodeContext, errorContext, payloadContext].filter(Boolean).join('\n')).slice(0, budget - promptStart.length - promptEnd.length) + '\n' + promptEnd;
    return prompt;
}

export function getFinalTransformErrorContext(input: FinalTransformErrorContextInput, options: FinalTransformErrorContextOptions): string {
    const budget = Math.max(0, options.characterBudget | 0);
    if (budget === 0) return '';

    const { instruction, responseSchema, sourceData, errorMessage, generatedCode } = input;

    const errorParts = errorMessage.split(': ');
    const errorType = errorParts[0];
    const errorDetail = errorParts.slice(1).join(': ');

    const promptStart = errorType === "evaluation_error"
        ? `Final transform generated valid output but failed quality evaluation.`
        : errorType === "validation_error"
            ? `Final transform output does not match the required schema.`
            : errorType === "execution_error"
                ? `Final transform code failed to execute.`
                : `Failed to generate final transform code.`;

    const instructionContext = instruction ? `<workflow_instruction>${instruction}</workflow_instruction>` : '';
    const schemaContext = responseSchema ? `<target_schema>${JSON.stringify(responseSchema, null, 2)}</target_schema>` : '';
    const generatedCodeContext = generatedCode ? `<final_transform_code>${generatedCode}</final_transform_code>` : '';
    const errorContext = `<error>${errorDetail}</error>`;
    const sourceDataContext = `<sourceData>${getObjectContext(sourceData, { include: { schema: true, preview: false, samples: true }, characterBudget: Math.floor(budget * 0.5) })}</sourceData>`;
    const promptEnd = `Generate a corrected transform function: (sourceData) => {...} that maps sourceData to match the target schema.`;

    const prompt = promptStart + '\n' + ([instructionContext, schemaContext, generatedCodeContext, errorContext, sourceDataContext].filter(Boolean).join('\n')).slice(0, budget - promptStart.length - promptEnd.length) + '\n' + promptEnd;
    return prompt;
}

export function getPaginationStopConditionErrorContext(input: PaginationStopConditionErrorContextInput, options: PaginationStopConditionErrorContextOptions): string {
    const budget = Math.max(0, options.characterBudget | 0);
    if (budget === 0) return '';

    const { paginationType, stopCondition, pageSize, firstRequestParams, secondRequestParams, responsePreview } = input;

    const promptStart = `Pagination stop condition is not working correctly. The first two requests returned identical data, indicating the stop condition failed to detect pagination end.`;
    const paginationTypeContext = `<pagination_type>${paginationType}</pagination_type>`;
    const pageSizeContext = `<page_size>${pageSize}</page_size>`;
    const firstRequestContext = `<first_request_params>${JSON.stringify(firstRequestParams)}</first_request_params>`;
    const secondRequestContext = `<second_request_params>${JSON.stringify(secondRequestParams)}</second_request_params>`;
    const stopConditionContext = `<current_stop_condition>${stopCondition}</current_stop_condition>`;
    const responseContext = `<response_structure>${getObjectContext(responsePreview, { include: { schema: true, preview: true, samples: false }, characterBudget: Math.floor(budget * 0.3) })}</response_structure>`;
    const promptEnd = `The pagination parameters ARE being applied correctly (see request params above), but your stop condition is not detecting when pagination should end. Fix the stop condition to return true when: no more data exists, response.data.length < pageSize, or response.data.has_more === false.`;

    const prompt = promptStart + '\n' + ([paginationTypeContext, pageSizeContext, firstRequestContext, secondRequestContext, stopConditionContext, responseContext].filter(Boolean).join('\n')).slice(0, budget - promptStart.length - promptEnd.length) + '\n' + promptEnd;
    return prompt;
}

