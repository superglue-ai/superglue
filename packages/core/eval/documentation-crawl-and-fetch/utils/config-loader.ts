import * as fs from 'fs';
import * as path from 'path';
import { logMessage } from '../../../utils/logs.js';
import { DocumentationSite } from './documentation-fetcher.js';

export interface DocumentationEvaluationConfig {
  sites: DocumentationSite[];
  crawlTimeoutMs: number;
  maxDocumentationSizeMB: number;
  enablePlaywright: boolean;
  enableOpenApiFetching: boolean;
}

export class DocumentationEvaluationConfigLoader {
  private metadata = { orgId: 'doc-eval-config-loader', userId: 'system' };

  /**
   * Load documentation evaluation configuration
   */
  async loadConfig(configPath?: string): Promise<DocumentationEvaluationConfig> {
    const defaultPath = path.join(process.cwd(), 'packages/core/eval/documentation-crawl-and-fetch/config/doc-eval-config.json');
    const finalPath = configPath || defaultPath;

    const config = await this.loadJsonConfig<DocumentationEvaluationConfig>(
      finalPath,
      'doc-eval-config.json',
      [
        'packages/core/eval/documentation-crawl-and-fetch/config/doc-eval-config.json',
        'doc-eval-config.json'
      ]
    );

    this.validateConfig(config);
    return config;
  }

  /**
   * Common JSON loading logic
   */
  private async loadJsonConfig<T>(
    providedPath: string,
    defaultFileName: string,
    additionalPaths: string[]
  ): Promise<T> {
    const possiblePaths = [
      providedPath,
      path.join(process.cwd(), 'packages/core/eval/documentation-crawl-and-fetch/config', defaultFileName),
      path.join(process.cwd(), 'eval/documentation-crawl-and-fetch/config', defaultFileName),
    ];

    let finalConfigPath: string | null = null;
    for (const testPath of possiblePaths) {
      if (fs.existsSync(testPath)) {
        finalConfigPath = testPath;
        logMessage('info', `Found config at: ${testPath}`, this.metadata);
        break;
      }
    }

    if (!finalConfigPath) {
      throw new Error(`Could not find ${defaultFileName} in any of: ${possiblePaths.join(', ')}`);
    }

    try {
      const configContent = fs.readFileSync(finalConfigPath, 'utf-8');
      return JSON.parse(configContent);
    } catch (error) {
      throw new Error(`Failed to load config from ${finalConfigPath}: ${String(error)}`);
    }
  }

  /**
   * Validate configuration structure
   */
  private validateConfig(config: any): asserts config is DocumentationEvaluationConfig {
    if (!config.evaluationSuite?.name) {
      throw new Error('Invalid config: missing evaluationSuite.name');
    }
    if (!config.sites || !Array.isArray(config.sites)) {
      throw new Error('Invalid config: missing sites array');
    }
    if (!config.settings) {
      throw new Error('Invalid config: missing settings object');
    }

    for (const site of config.sites) {
      if (!site.id || !site.name || !site.documentationUrl || !site.urlHost) {
        throw new Error(`Invalid site config: missing required fields (id, name, documentationUrl, urlHost)`);
      }
      if (!site.testQuestions || !Array.isArray(site.testQuestions) || site.testQuestions.length === 0) {
        throw new Error(`Invalid site config for ${site.id}: missing or empty testQuestions array`);
      }
      if (!site.keywords || !Array.isArray(site.keywords)) {
        throw new Error(`Invalid site config for ${site.id}: missing keywords array`);
      }
    }

    if (typeof config.settings.crawlTimeout !== 'number') {
      throw new Error('Invalid config: settings.crawlTimeout must be a number');
    }
    if (typeof config.settings.maxDocumentationSize !== 'number') {
      throw new Error('Invalid config: settings.maxDocumentationSize must be a number');
    }
  }

  /**
   * Get enabled sites from config
   */
  getEnabledSites(config: DocumentationEvaluationConfig): DocumentationSite[] {
    return config.sites;
  }

  /**
   * Validate that all required settings are present
   */
  validateSettings(config: DocumentationEvaluationConfig): boolean {
    if (config.crawlTimeoutMs <= 0) {
      logMessage('warn', 'Crawl timeout is set to 0 or negative value', this.metadata);
      return false;
    }
    
    if (config.maxDocumentationSizeMB <= 0) {
      logMessage('warn', 'Max documentation size is set to 0 or negative value', this.metadata);
      return false;
    }
    
    return true;
  }
}
