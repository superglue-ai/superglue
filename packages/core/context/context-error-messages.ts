import { getObjectContext } from "./context-builders.js";
import { PaginationErrorContextInput, PaginationErrorContextOptions, PostgresBodyStructureErrorContextInput, PostgresBodyStructureErrorContextOptions, PostgresSqlExecutionErrorContextInput, PostgresSqlExecutionErrorContextOptions, VarResolverErrorContextInput, VarResolverErrorContextOptions } from "./context-types.js";

export function getPaginationErrorContext(input: PaginationErrorContextInput, options: PaginationErrorContextOptions): string {
    const budget = Math.max(0, options.characterBudget | 0);
    if (budget === 0) return '';

    const { paginationType, apiConfig, missingVariables } = input;

    if (!missingVariables || missingVariables.length === 0) {
        return '';
    }

    const promptStart = `The API configuration is invalid. You configured pagination type as ${paginationType}, but required variable(s) are missing.`;
    const paginationTypeContext = `<pagination_type>${paginationType}</pagination_type>`;
    const missingVarsList = missingVariables.map(v => `<<${v}>>`).join(' and ');
    const missingVariablesContext = `<missing_variables>${missingVarsList}</missing_variables>`;
    const currentConfigContext = `<current_config>${JSON.stringify(apiConfig, null, 2)}</current_config>`;
    const promptEnd = `You MUST include these variables in queryParams, body, or headers.`;
    const prompt = promptStart + '\n' + ([paginationTypeContext, missingVariablesContext, currentConfigContext].filter(Boolean).join('\n')).slice(0, budget - promptStart.length - promptEnd.length) + '\n' + promptEnd;
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
    const expectedFormatContext = `<expected_format>{ "query": "SELECT * FROM users WHERE id = $1", "params": [123] }</expected_format>`;
    const promptEnd = `The body must be valid JSON with a 'query' field containing the SQL statement. Optionally include 'params' or 'values' array for parameterized queries.`;

    const prompt = promptStart + '\n' + ([bodyContentContext, parseErrorContext, parsedBodyContext, expectedFormatContext].filter(Boolean).join('\n')).slice(0, budget - promptStart.length - promptEnd.length) + '\n' + promptEnd;
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
