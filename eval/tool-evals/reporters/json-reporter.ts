import { ToolAttempt } from "../types.js";
import { writeFileSync } from "fs";
import { join } from "path";
import { logMessage } from "../../../packages/core/utils/logs.js";
import { Metadata } from "@superglue/shared";
import { AgentEvalConfig } from "../types.js";

export class JsonReporter {
  private MAX_ERROR_LENGTH = 20_000;
  private MAX_DATA_LENGTH = 500;

  constructor(
    private baseDir: string,
    private metadata: Metadata,
    private attemptsPerMode: number
  ) {
  }

  public reportAttempts(timestamp: string, attempts: ToolAttempt[], config: AgentEvalConfig): void {
    const filepath = join(this.baseDir, `data/results/${timestamp}-tool-eval.json`);

    const secrets = this.discoverSecretsFromConfig(config);

    const llmProvider = process.env.LLM_PROVIDER || 'not_set';
    const backendModel = this.getBackendModel(llmProvider);

    const detailedAttempts = attempts.map(attempt => {
      // truncating long strings to avoid large files (>200mb)
      const buildErrorTruncated = this.truncateStringsRecursively(attempt.buildError, this.MAX_ERROR_LENGTH);
      const executionErrorTruncated = this.truncateStringsRecursively(attempt.executionError, this.MAX_ERROR_LENGTH);
      const validationFunctionErrorTruncated = this.truncateStringsRecursively(attempt.validationResult?.functionError, this.MAX_ERROR_LENGTH);
      const dataTruncated = this.truncateStringsRecursively(attempt.result?.data, this.MAX_DATA_LENGTH);
      
      // mask secrets to avoid leaking sensitive information
      const buildErrorMasked = this.maskSecretsRecursively(buildErrorTruncated, secrets);
      const executionErrorMasked = this.maskSecretsRecursively(executionErrorTruncated, secrets);
      const validationFunctionErrorMasked = this.maskSecretsRecursively(validationFunctionErrorTruncated, secrets);
      const dataMasked = this.maskSecretsRecursively(dataTruncated, secrets);

      return {
        tool: attempt.toolConfig.id,
        toolName: attempt.toolConfig.name,
        description: attempt.toolConfig.expectedResultDescription ?? null,
        instruction: attempt.toolConfig.instruction,
        selfHealingEnabled: attempt.selfHealingEnabled,

        buildSuccess: attempt.buildSuccess,
        buildError: buildErrorMasked ?? null,
        buildTime: attempt.buildTime,

        executionSuccess: attempt.executionSuccess,
        executionError: executionErrorMasked ?? null,
        executionTime: attempt.executionTime,

        status: attempt.status,
        failureReason: attempt.failureReason ?? null,

        overallValidationPassed: attempt.validationResult?.passed ?? null,
        validationFunctionPassed: attempt.validationResult?.functionPassed ?? null,
        validationFunctionError: validationFunctionErrorMasked ?? null,
        llmJudgment: attempt.validationResult?.llmJudgment ?? null,
        llmReason: attempt.validationResult?.llmReason ?? null,

        data: dataMasked ?? null,
      };
    });

    const report = {
      config: {
        attemptsPerMode: this.attemptsPerMode,
        llmProvider: llmProvider,
        backendModel: backendModel,
        validationLlmProvider: config.validationLlmConfig?.provider || 'not_set',
        validationLlmModel: config.validationLlmConfig?.model || 'not_set',
      },
      results: detailedAttempts,
    };

    try {
      writeFileSync(filepath, JSON.stringify(report, null, 2), "utf-8");
      logMessage("info", `JSON report created: ${filepath}`, this.metadata);
    } catch (error) {
      logMessage("error", `Failed to write JSON report: ${error}`, this.metadata);

      const fallbackPath = join(this.baseDir, `data/results/${timestamp}-tool-eval-fallback.txt`);
      writeFileSync(fallbackPath, String(report), "utf-8");
      logMessage("info", `Fallback text report created: ${fallbackPath}`, this.metadata);
    }
  }

  private getBackendModel(provider: string): string {
    const providerLower = provider.toLowerCase();

    switch (providerLower) {
      case 'openai':
        return process.env.OPENAI_MODEL || 'not_set';
      case 'anthropic':
        return process.env.ANTHROPIC_MODEL || 'not_set';
      case 'gemini':
        return process.env.GEMINI_MODEL || 'not_set';
      case 'azure':
        return process.env.AZURE_MODEL || 'not_set';
      default:
        return 'not_set';
    }
  }

  private discoverSecretsFromConfig(config: AgentEvalConfig): string[] {
    const secrets: string[] = [];
    const credentialPairs: Array<{ email?: string; token?: string; api_token?: string; username?: string; password?: string }> = [];

    for (const integrationConfig of config.integrations) {
      if (!integrationConfig.credentials || !integrationConfig.id) {
        continue;
      }

      const creds: any = {};
      for (const [key, _] of Object.entries(integrationConfig.credentials)) {
        const envVarName = `${integrationConfig.id.toUpperCase().replace(/-/g, '_')}_${key.toUpperCase()}`;
        const envValue = process.env[envVarName];

        if (envValue && envValue.length > 5) {
          secrets.push(envValue);
          creds[key.toLowerCase()] = envValue;
        }
      }

      if (Object.keys(creds).length > 0) {
        credentialPairs.push(creds);
      }
    }

    // Add Basic Auth combinations (email:token, username:password, etc.)
    for (const creds of credentialPairs) {
      if (creds.email && creds.api_token) {
        const basicAuthString = `${creds.email}:${creds.api_token}`;
        secrets.push(basicAuthString);
        // Add Base64 encoded version
        secrets.push(Buffer.from(basicAuthString).toString('base64'));
      }
      if (creds.email && creds.token) {
        const basicAuthString = `${creds.email}:${creds.token}`;
        secrets.push(basicAuthString);
        secrets.push(Buffer.from(basicAuthString).toString('base64'));
      }
      if (creds.username && creds.password) {
        const basicAuthString = `${creds.username}:${creds.password}`;
        secrets.push(basicAuthString);
        secrets.push(Buffer.from(basicAuthString).toString('base64'));
      }
      if (creds.username && creds.api_token) {
        const basicAuthString = `${creds.username}:${creds.api_token}`;
        secrets.push(basicAuthString);
        secrets.push(Buffer.from(basicAuthString).toString('base64'));
      }
    }

    return secrets;
  }

  private maskSecretsRecursively(data: any, secrets: string[]): any {
    if (typeof data === 'string') {
      let masked = data;

      // Mask direct secret matches
      for (const secret of secrets) {
        const escaped = secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escaped, 'g');
        masked = masked.replace(regex, '[REDACTED]');
      }

      // Mask ATATT tokens (Atlassian) that might not be in env
      masked = masked.replace(/ATATT[A-Za-z0-9_\-+/=]{50,}/g, '[REDACTED_ATLASSIAN_TOKEN]');

      // Mask Authorization: Basic headers (in case we missed the Base64 encoding)
      masked = masked.replace(/Authorization['":\s]*Basic\s+([A-Za-z0-9+/=]{100,})/gi, 
        'Authorization: Basic [REDACTED_BASE64_AUTH]');

      return masked;
    }

    if (Array.isArray(data)) {
      return data.map(item => this.maskSecretsRecursively(item, secrets));
    }

    if (typeof data === 'object' && data !== null) {
      return Object.fromEntries(
        Object.entries(data).map(([key, value]) => [key, this.maskSecretsRecursively(value, secrets)])
      );
    }

    return data;
  }

  private truncateStringsRecursively(data: any, maxLength: number): any {
    if (typeof data === 'string') {
      return data.length > maxLength ? data.substring(0, maxLength) + `... [truncated]` : data;
    }

    if (Array.isArray(data)) {
      return data.map(item => this.truncateStringsRecursively(item, maxLength));
    }

    if (typeof data === 'object' && data !== null) {
      return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, this.truncateStringsRecursively(value, maxLength)]));
    }

    return data;
  }
}

