import { DataStore } from "../../../packages/core/datastore/types.js";
import { DocumentationFetcher as DocumentationFetcherCore } from "../../../packages/core/documentation/documentation-fetching.js";
import { logMessage } from "../../../packages/core/utils/logs.js";
import * as fs from "fs";
import * as path from "path";

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
  docFetchTime: number;
  openApiFetchTime: number;
  pageCount: number;
  error?: string;
}

export interface FetchSummary {
  totalSites: number;
  successfulFetches: number;
  totalDocumentationSize: number;
  totalOpenApiSize: number;
  totalTime: number;
  results: FetchResult[];
}

/**
 * Handles fetching and storing documentation from various sources for evaluation purposes
 */
export class DocumentationEvalFetcher {
  private metadata = { orgId: "documentation-eval", userId: "system" };
  private createdIntegrationIds: string[] = [];

  constructor(
    private datastore: DataStore,
    private orgId: string,
  ) {
    this.metadata = { orgId, userId: "system" };
  }

  /**
   * Fetch documentation for all sites and store in database
   */
  async fetchAllDocumentation(
    sites: DocumentationSite[],
  ): Promise<{ summary: FetchSummary; csvPath: string }> {
    const startTime = Date.now();
    const results: FetchResult[] = [];

    logMessage(
      "info",
      `\n🚀 Starting documentation fetch for ${sites.length} sites...`,
      this.metadata,
    );

    for (const site of sites) {
      const result = await this.fetchSiteDocumentation(site);
      results.push(result);

      if (result.success) {
        const docMB = (result.documentationSize / 1024 / 1024).toFixed(2);
        const apiIndicator = result.openApiSize > 0 ? " + OpenAPI" : "";
        logMessage("info", `✅ ${site.name}: ${docMB}MB${apiIndicator}`, this.metadata);
      } else {
        logMessage("warn", `❌ ${site.name}: ${result.error}`, this.metadata);
      }
    }

    const summary = this.generateSummary(results, Date.now() - startTime);
    const csvPath = this.logSummary(summary);

    return { summary, csvPath };
  }

  /**
   * Fetch documentation for a single site
   */
  private async fetchSiteDocumentation(site: DocumentationSite): Promise<FetchResult> {
    try {
      const docFetcher = new DocumentationFetcherCore(
        {
          urlHost: site.urlHost,
          urlPath: site.urlPath || "",
          documentationUrl: site.documentationUrl,
          openApiUrl: site.openApiUrl,
          keywords: site.keywords,
        },
        {},
        this.metadata,
      );

      const docStartTime = Date.now();
      const documentation = await docFetcher.fetchAndProcess();
      const docFetchTime = Date.now() - docStartTime;

      const openApiStartTime = Date.now();
      const openApiSchema = await docFetcher.fetchOpenApiDocumentation();
      const openApiFetchTime = Date.now() - openApiStartTime;

      const documentationSize = Buffer.byteLength(documentation, "utf8");
      const openApiSize =
        openApiSchema && openApiSchema.trim().length > 0
          ? Buffer.byteLength(openApiSchema, "utf8")
          : 0;

      const AVG_PAGE_SIZE_KB = 75;
      const pageCount = Math.max(1, Math.round(documentationSize / 1024 / AVG_PAGE_SIZE_KB));

      if (documentationSize > 0) {
        await this.storeDocumentation(site, documentation, openApiSchema || "");
      }

      return {
        siteId: site.id,
        siteName: site.name,
        success: documentationSize > 0,
        documentationSize,
        openApiSize,
        docFetchTime,
        openApiFetchTime,
        pageCount,
      };
    } catch (error) {
      return {
        siteId: site.id,
        siteName: site.name,
        success: false,
        documentationSize: 0,
        openApiSize: 0,
        docFetchTime: 0,
        openApiFetchTime: 0,
        pageCount: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Store documentation in datastore
   */
  private async storeDocumentation(
    site: DocumentationSite,
    documentation: string,
    openApiSchema: string,
  ): Promise<void> {
    const integrationId = `doc-eval-${site.id}`;

    const integration = {
      id: integrationId,
      name: `${site.name} Documentation`,
      urlHost: site.urlHost,
      urlPath: site.urlPath || "",
      documentationUrl: site.documentationUrl,
      documentation,
      openApiSchema,
      documentationPending: false,
      credentials: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.datastore.upsertIntegration({
      id: integrationId,
      integration,
      orgId: this.orgId,
    });

    this.createdIntegrationIds.push(integrationId);
  }

  /**
   * Generate summary statistics
   */
  private generateSummary(results: FetchResult[], totalTime: number): FetchSummary {
    const successfulFetches = results.filter((r) => r.success);

    return {
      totalSites: results.length,
      successfulFetches: successfulFetches.length,
      totalDocumentationSize: successfulFetches.reduce((sum, r) => sum + r.documentationSize, 0),
      totalOpenApiSize: successfulFetches.reduce((sum, r) => sum + r.openApiSize, 0),
      totalTime,
      results,
    };
  }

  /**
   * Log fetch summary with table and save to CSV
   */
  private logSummary(summary: FetchSummary): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const isCompiledDist = import.meta.url.includes("/dist/");
    const scriptDir = path.dirname(new URL(import.meta.url).pathname);
    const resultsDir = isCompiledDist
      ? path.join(scriptDir, "../../../../eval/documentation-crawl-and-fetch/results")
      : path.join(scriptDir, "../results");
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }
    const csvPath = path.join(resultsDir, `fetch-results-${timestamp}.csv`);

    logMessage("info", "\n📊 Fetch Results Table:", this.metadata);
    logMessage(
      "info",
      "═══════════════════════════════════════════════════════════════════════════════════",
      this.metadata,
    );
    logMessage(
      "info",
      `${"Site".padEnd(25)} ${"Pages*".padStart(6)} ${"Doc Size".padStart(10)} ${"OpenAPI".padStart(8)} ${"API Size".padStart(9)} ${"Doc s/pg".padStart(9)} ${"API Fetch".padStart(10)}`,
      this.metadata,
    );
    logMessage(
      "info",
      "───────────────────────────────────────────────────────────────────────────────────",
      this.metadata,
    );

    const csvLines: string[] = [
      "Site,Pages (estimated),Doc Size (MB),Has OpenAPI,OpenAPI Size (KB),Doc Fetch (s/page),OpenAPI Fetch (s)",
    ];

    for (const result of summary.results) {
      if (result.success) {
        const siteName =
          result.siteName.length > 24 ? result.siteName.substring(0, 21) + "..." : result.siteName;
        const pages = result.pageCount.toString();
        const docSize = `${(result.documentationSize / 1024 / 1024).toFixed(2)} MB`;
        const hasOpenApi = result.openApiSize > 0 ? "Yes" : "No";
        const apiSize =
          result.openApiSize > 0 ? `${Math.round(result.openApiSize / 1024)} KB` : "-";
        const docSecPerPage =
          result.pageCount > 0
            ? (result.docFetchTime / 1000 / result.pageCount).toFixed(2)
            : "0.00";
        const apiSec = (result.openApiFetchTime / 1000).toFixed(2);

        logMessage(
          "info",
          `${siteName.padEnd(25)} ${pages.padStart(6)} ${docSize.padStart(10)} ${hasOpenApi.padStart(8)} ${apiSize.padStart(9)} ${docSecPerPage.padStart(9)} ${apiSec.padStart(10)}s`,
          this.metadata,
        );

        csvLines.push(
          `"${result.siteName}",${result.pageCount},${(result.documentationSize / 1024 / 1024).toFixed(2)},${hasOpenApi},${result.openApiSize > 0 ? Math.round(result.openApiSize / 1024) : 0},${docSecPerPage},${apiSec}`,
        );
      }
    }

    const successfulResults = summary.results.filter((r) => r.success);
    const totalPages = successfulResults.reduce((sum, r) => sum + r.pageCount, 0);
    const avgDocSize =
      successfulResults.length > 0
        ? (summary.totalDocumentationSize / successfulResults.length / 1024 / 1024).toFixed(2)
        : "0.00";
    const sitesWithOpenApi = successfulResults.filter((r) => r.openApiSize > 0).length;
    const avgOpenApiSize =
      sitesWithOpenApi > 0 ? Math.round(summary.totalOpenApiSize / sitesWithOpenApi / 1024) : 0;
    const avgDocSecPerPage =
      totalPages > 0
        ? (
            successfulResults.reduce((sum, r) => sum + r.docFetchTime, 0) /
            1000 /
            totalPages
          ).toFixed(2)
        : "0.00";
    const avgOpenApiSec =
      sitesWithOpenApi > 0
        ? (
            successfulResults
              .filter((r) => r.openApiSize > 0)
              .reduce((sum, r) => sum + r.openApiFetchTime, 0) /
            1000 /
            sitesWithOpenApi
          ).toFixed(2)
        : "0.00";

    logMessage(
      "info",
      "───────────────────────────────────────────────────────────────────────────────────",
      this.metadata,
    );
    logMessage(
      "info",
      `${"AVERAGE".padEnd(25)} ${(totalPages / successfulResults.length).toFixed(0).padStart(6)} ${(avgDocSize + " MB").padStart(10)} ${`${sitesWithOpenApi}/${successfulResults.length}`.padStart(8)} ${(avgOpenApiSize + " KB").padStart(9)} ${avgDocSecPerPage.padStart(9)} ${avgOpenApiSec.padStart(10)}s`,
      this.metadata,
    );
    logMessage(
      "info",
      "═══════════════════════════════════════════════════════════════════════════════════",
      this.metadata,
    );
    logMessage(
      "info",
      "* Page count estimated based on documentation size (~75KB/page average)",
      this.metadata,
    );

    csvLines.push(
      `"AVERAGE",${(totalPages / successfulResults.length).toFixed(0)},${avgDocSize},${sitesWithOpenApi}/${successfulResults.length},${avgOpenApiSize},${avgDocSecPerPage},${avgOpenApiSec}`,
    );

    fs.writeFileSync(csvPath, csvLines.join("\n"));
    logMessage("info", `\n💾 Results saved to: ${csvPath}`, this.metadata);

    const successRate = ((summary.successfulFetches / summary.totalSites) * 100).toFixed(1);
    const totalTimeSec = (summary.totalTime / 1000).toFixed(1);
    logMessage(
      "info",
      `✅ Success rate: ${summary.successfulFetches}/${summary.totalSites} sites (${successRate}%)`,
      this.metadata,
    );
    logMessage("info", `⏱️  Total time: ${totalTimeSec}s\n`, this.metadata);

    return csvPath;
  }

  /**
   * Clean up created integrations
   */
  async cleanup(): Promise<void> {
    if (this.createdIntegrationIds.length > 0) {
      logMessage(
        "info",
        `Cleaned up ${this.createdIntegrationIds.length} integrations`,
        this.metadata,
      );

      for (const integrationId of this.createdIntegrationIds) {
        try {
          await this.datastore.deleteIntegration({ id: integrationId, orgId: this.orgId });
        } catch (error) {
          logMessage(
            "warn",
            `Failed to delete integration ${integrationId}: ${error}`,
            this.metadata,
          );
        }
      }
    }

    // Close database connections
    try {
      if (this.datastore && typeof (this.datastore as any).close === "function") {
        await (this.datastore as any).close();
      }
    } catch (error) {
      logMessage("debug", `Database cleanup: ${error}`, this.metadata);
    }
  }
}
