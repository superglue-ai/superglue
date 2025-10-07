import { DataStore } from '../../../datastore/types.js';
import { DocumentationFetcher as DocumentationFetcherCore } from '../../../documentation/documentation-fetching.js';
import { logMessage } from '../../../utils/logs.js';

export interface DocumentationSite {
  id: string;
  name: string;
  documentationUrl: string;
  openApiUrl?: string;
  urlHost?: string;
  urlPath?: string;
  keywords?: string[];
  testQuestions: string[];
}

export interface FetchResult {
  siteId: string;
  siteName: string;
  success: boolean;
  documentationSize: number;
  openApiSize: number;
  fetchTime: number;
  error?: string;
}

export interface FetchSummary {
  totalSites: number;
  successfulFetches: number;
  totalDocumentationSize: number;
  totalOpenApiSize: number;
  totalTime: number;
}

/**
 * Handles fetching and storing documentation from various sources
 */
export class DocumentationFetcher {
  private metadata = { orgId: 'documentation-eval', userId: 'system' };
  private createdIntegrationIds: string[] = [];

  constructor(private datastore: DataStore, private orgId: string) {
    this.metadata = { orgId, userId: 'system' };
  }

  /**
   * Fetch documentation for all sites and store in database
   */
  async fetchAllDocumentation(sites: DocumentationSite[]): Promise<FetchSummary> {
    const startTime = Date.now();
    const results: FetchResult[] = [];

    logMessage('info', `🚀 Starting documentation fetch for ${sites.length} sites`, this.metadata);

    for (const site of sites) {
      const result = await this.fetchSiteDocumentation(site);
      results.push(result);
      
      if (result.success) {
        const docMB = (result.documentationSize / 1024 / 1024).toFixed(2);
        const openApiKB = result.openApiSize > 0 ? `, OpenAPI: ${Math.round(result.openApiSize / 1024)}KB` : '';
        logMessage('info', `✅ ${site.name}: ${docMB}MB${openApiKB}`, this.metadata);
      } else {
        logMessage('warn', `❌ ${site.name}: ${result.error}`, this.metadata);
      }
    }

    const summary = this.generateSummary(results, Date.now() - startTime);
    this.logSummary(summary);

    return summary;
  }

  /**
   * Fetch documentation for a single site
   */
  private async fetchSiteDocumentation(site: DocumentationSite): Promise<FetchResult> {
    const fetchStartTime = Date.now();
    
    try {
      const docFetcher = new DocumentationFetcherCore(
        {
          urlHost: site.urlHost,
          urlPath: site.urlPath || '',
          documentationUrl: site.documentationUrl,
          openApiUrl: site.openApiUrl,
          keywords: site.keywords,
        },
        {},
        this.metadata
      );

      // Fetch both documentation and OpenAPI schema
      const documentation = await docFetcher.fetchAndProcess();
      const openApiSchema = await docFetcher.fetchOpenApiDocumentation();
      
      const documentationSize = Buffer.byteLength(documentation, 'utf8');
      const openApiSize = (openApiSchema && openApiSchema.trim().length > 0) 
        ? Buffer.byteLength(openApiSchema, 'utf8') : 0;

      // Store in database if we have content
      if (documentationSize > 0) {
        await this.storeDocumentation(site, documentation, openApiSchema || '');
      }

      return {
        siteId: site.id,
        siteName: site.name,
        success: documentationSize > 0,
        documentationSize,
        openApiSize,
        fetchTime: Date.now() - fetchStartTime
      };

    } catch (error) {
      return {
        siteId: site.id,
        siteName: site.name,
        success: false,
        documentationSize: 0,
        openApiSize: 0,
        fetchTime: Date.now() - fetchStartTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Store documentation in datastore
   */
  private async storeDocumentation(site: DocumentationSite, documentation: string, openApiSchema: string): Promise<void> {
    const integrationId = `doc-eval-${site.id}`;
    
    const integration = {
      id: integrationId,
      name: `${site.name} Documentation`,
      urlHost: site.urlHost,
      urlPath: site.urlPath || '',
      documentationUrl: site.documentationUrl,
      documentation,
      openApiSchema,
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

    this.createdIntegrationIds.push(integrationId);
  }

  /**
   * Generate summary statistics
   */
  private generateSummary(results: FetchResult[], totalTime: number): FetchSummary {
    const successfulFetches = results.filter(r => r.success);
    
    return {
      totalSites: results.length,
      successfulFetches: successfulFetches.length,
      totalDocumentationSize: successfulFetches.reduce((sum, r) => sum + r.documentationSize, 0),
      totalOpenApiSize: successfulFetches.reduce((sum, r) => sum + r.openApiSize, 0),
      totalTime
    };
  }

  /**
   * Log fetch summary
   */
  private logSummary(summary: FetchSummary): void {
    const successRate = ((summary.successfulFetches / summary.totalSites) * 100).toFixed(1);
    const avgDocMB = (summary.totalDocumentationSize / summary.successfulFetches / 1024 / 1024).toFixed(2);
    const totalDocMB = (summary.totalDocumentationSize / 1024 / 1024).toFixed(1);
    const totalOpenApiMB = (summary.totalOpenApiSize / 1024 / 1024).toFixed(1);
    const totalTimeSec = (summary.totalTime / 1000).toFixed(1);

    logMessage('info', `📊 Fetch Summary: ${summary.successfulFetches}/${summary.totalSites} sites (${successRate}%)`, this.metadata);
    logMessage('info', `📚 Documentation: ${totalDocMB}MB total, ${avgDocMB}MB avg per site`, this.metadata);
    logMessage('info', `🔌 OpenAPI: ${totalOpenApiMB}MB total`, this.metadata);
    logMessage('info', `⏱️  Total time: ${totalTimeSec}s`, this.metadata);
  }

  /**
   * Clean up created integrations
   */
  async cleanup(): Promise<void> {
    if (this.createdIntegrationIds.length > 0) {
      logMessage('info', `Cleaned up ${this.createdIntegrationIds.length} integrations`, this.metadata);
      
      for (const integrationId of this.createdIntegrationIds) {
        try {
          await this.datastore.deleteIntegration({ id: integrationId, orgId: this.orgId });
        } catch (error) {
          logMessage('warn', `Failed to delete integration ${integrationId}: ${error}`, this.metadata);
        }
      }
    }

    // Close database connections
    try {
      if (this.datastore && typeof (this.datastore as any).close === 'function') {
        await (this.datastore as any).close();
      }
    } catch (error) {
      logMessage('debug', `Database cleanup: ${error}`, this.metadata);
    }
  }
}
