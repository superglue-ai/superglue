import { DataStore } from '../../../datastore/types.js';
import { Documentation } from '../../../utils/documentation.js';
import { logMessage } from '../../../utils/logs.js';

// Types moved from separate file
export interface DocumentationSite {
  id: string;
  name: string;
  description: string;
  documentationUrl: string;
  openApiUrl?: string;
  urlHost: string;
  keywords: string[];
  testQuestions: string[];
}

export interface DocumentationEvaluationConfig {
  evaluationSuite: {
    name: string;
    description: string;
    version: string;
  };
  sites: DocumentationSite[];
  settings: {
    crawlTimeout: number;
    maxDocumentationSize: number;
    enablePlaywrightCrawling: boolean;
    enableOpenApiFetching: boolean;
  };
}

export interface CrawlResult {
  siteId: string;
  siteName: string;
  success: boolean;
  documentationSize: number;
  documentationPreview: string;
  crawlTime: number;
  error?: string;
  strategies: {
    fetching: string[];
    processing: string[];
  };
}

export interface DocumentationEvaluationResult {
  siteId: string;
  siteName: string;
  crawlResult: CrawlResult;
  questions: string[];
}

export interface DocumentationEvaluationSuite {
  config: DocumentationEvaluationConfig;
  results: DocumentationEvaluationResult[];
  totalSites: number;
  successfulCrawls: number;
  failedCrawls: number;
  totalCrawlTime: number;
  averageDocumentationSize: number;
}

export class DocumentationEvaluator {
  private metadata: { orgId: string; userId: string };
  private createdIntegrationIds: string[] = [];

  constructor(private datastore: DataStore, private orgId: string) {
    this.metadata = { orgId, userId: 'system' };
  }

  /**
   * Run the complete documentation evaluation suite
   */
  async runEvaluation(config: DocumentationEvaluationConfig): Promise<DocumentationEvaluationSuite> {
    const startTime = Date.now();
    
    logMessage('info', '🚀 Starting Documentation Crawl and Fetch Evaluation', this.metadata);

    logMessage('info', `📋 Loaded configuration for ${config.sites.length} sites`, this.metadata);

    // Run evaluation for each site
    const results: DocumentationEvaluationResult[] = [];
    let successfulCrawls = 0;
    let failedCrawls = 0;
    let totalDocumentationSize = 0;

    for (const site of config.sites) {
      logMessage('info', `🔍 Evaluating site: ${site.name} (${site.id})`, this.metadata);
      
      try {
        const result = await this.evaluateSite(site, config);
        results.push(result);
        
        if (result.crawlResult.success) {
          successfulCrawls++;
          totalDocumentationSize += result.crawlResult.documentationSize;
        } else {
          failedCrawls++;
        }
        
        const sizeInMB = (result.crawlResult.documentationSize / 1024 / 1024).toFixed(2);
        logMessage('info', 
          `✅ ${site.name}: ${result.crawlResult.success ? 'SUCCESS' : 'FAILED'} ` +
          `(${sizeInMB}MB, ${result.crawlResult.crawlTime}ms)`, 
          this.metadata
        );
        
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logMessage('error', `❌ Failed to evaluate ${site.name}: ${errorMsg}`, this.metadata);
        
        failedCrawls++;
        results.push({
          siteId: site.id,
          siteName: site.name,
          crawlResult: {
            siteId: site.id,
            siteName: site.name,
            success: false,
            documentationSize: 0,
            documentationPreview: '',
            crawlTime: 0,
            error: errorMsg,
            strategies: { fetching: [], processing: [] }
          },
          questions: site.testQuestions
        });
      }
    }

    const totalCrawlTime = Date.now() - startTime;
    const averageDocumentationSize = successfulCrawls > 0 ? totalDocumentationSize / successfulCrawls : 0;

    const suite: DocumentationEvaluationSuite = {
      config,
      results,
      totalSites: config.sites.length,
      successfulCrawls,
      failedCrawls,
      totalCrawlTime,
      averageDocumentationSize
    };

    // Generate summary report
    this.generateSummaryReport(suite);

    const avgSizeInMB = (averageDocumentationSize / 1024 / 1024).toFixed(2);
    logMessage('info', 
      `🏁 Crawl completed: ${successfulCrawls}/${config.sites.length} sites successful, ` +
      `avg ${avgSizeInMB}MB per site`, 
      this.metadata
    );

    return suite;
  }

  /**
   * Evaluate a single site's documentation crawling
   */
  private async evaluateSite(
    site: DocumentationSite, 
    config: DocumentationEvaluationConfig
  ): Promise<DocumentationEvaluationResult> {
    const crawlStartTime = Date.now();
    
    try {
      // Create documentation fetcher
      const docFetcher = new Documentation(
        {
          urlHost: site.urlHost,
          documentationUrl: site.documentationUrl,
          openApiUrl: site.openApiUrl,
          keywords: site.keywords
        },
        {}, // No credentials needed for public documentation
        this.metadata
      );

      // Fetch and process documentation
      const documentation = await docFetcher.fetchAndProcess();
      const crawlTime = Date.now() - crawlStartTime;
      
      const documentationSize = Buffer.byteLength(documentation, 'utf8');
      const documentationPreview = documentation.slice(0, 500) + (documentation.length > 500 ? '...' : '');

      // Store documentation in datastore for future retrieval testing
      if (documentationSize > 0) {
        await this.storeDocumentation(site.id, documentation, site);
      }

      const crawlResult: CrawlResult = {
        siteId: site.id,
        siteName: site.name,
        success: documentationSize > 0,
        documentationSize,
        documentationPreview,
        crawlTime,
        strategies: {
          fetching: ['GraphQL', 'Playwright', 'Axios'],
          processing: ['OpenAPI', 'PostgreSQL', 'HtmlMarkdown', 'RawContent']
        }
      };

      return {
        siteId: site.id,
        siteName: site.name,
        crawlResult,
        questions: site.testQuestions
      };

    } catch (error) {
      const crawlTime = Date.now() - crawlStartTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      const crawlResult: CrawlResult = {
        siteId: site.id,
        siteName: site.name,
        success: false,
        documentationSize: 0,
        documentationPreview: '',
        crawlTime,
        error: errorMsg,
        strategies: { fetching: [], processing: [] }
      };

      return {
        siteId: site.id,
        siteName: site.name,
        crawlResult,
        questions: site.testQuestions
      };
    }
  }


  /**
   * Store documentation in datastore for future retrieval testing
   */
  private async storeDocumentation(siteId: string, documentation: string, site: DocumentationSite): Promise<void> {
    try {
      const integrationId = `doc-eval-${siteId}`;
      
      const integration = {
        id: integrationId,
        name: `${site.name} Documentation`,
        urlHost: site.urlHost,
        urlPath: '',
        documentationUrl: site.documentationUrl,
        documentation,
        documentationPending: false,
        credentials: {},
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      await this.datastore.upsertIntegration({
        id: integrationId,
        integration,
        orgId: this.orgId
      });

      // Track created integrations for cleanup
      this.createdIntegrationIds.push(integrationId);

      logMessage('debug', `Successfully stored documentation for ${siteId} (${Buffer.byteLength(documentation, 'utf8')} bytes)`, this.metadata);
    } catch (error) {
      logMessage('warn', `Failed to store documentation for ${siteId}: ${error}`, this.metadata);
      logMessage('debug', `PostgreSQL connection details - orgId: ${this.orgId}, integrationId: doc-eval-${siteId}`, this.metadata);
    }
  }

  /**
   * Generate summary report
   */
  private generateSummaryReport(suite: DocumentationEvaluationSuite): void {
    const avgSizeInMB = (suite.averageDocumentationSize / 1024 / 1024).toFixed(2);
    const successRate = ((suite.successfulCrawls / suite.totalSites) * 100).toFixed(1);
    
    logMessage('info', `📊 Results: ${suite.successfulCrawls}/${suite.totalSites} sites (${successRate}% success)`, this.metadata);
    logMessage('info', `⏱️  Total time: ${(suite.totalCrawlTime / 1000).toFixed(1)}s, avg doc size: ${avgSizeInMB}MB`, this.metadata);
  }

  /**
   * Cleanup test environment - delete all created integrations
   */
  async cleanup(): Promise<void> {
    if (this.createdIntegrationIds.length > 0) {
      logMessage('info', `🗑️ Cleaning up ${this.createdIntegrationIds.length} integrations...`, this.metadata);
      
      for (const integrationId of this.createdIntegrationIds) {
        try {
          await this.datastore.deleteIntegration({ id: integrationId, orgId: this.orgId });
        } catch (error) {
          logMessage('warn', `Failed to delete integration ${integrationId}: ${error}`, this.metadata);
        }
      }
    }
    
    // Close any database connections
    try {
      if (this.datastore && typeof (this.datastore as any).close === 'function') {
        await (this.datastore as any).close();
      }
    } catch (error) {
      logMessage('debug', `Database cleanup: ${error}`, this.metadata);
    }
  }
}
