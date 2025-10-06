import playwright from '@playwright/test';
import { ApiConfig } from "@superglue/client";
import { Metadata } from "@superglue/shared";
import axios from "axios";
import { getIntrospectionQuery } from "graphql";

import * as yaml from 'js-yaml';
import { server_defaults } from '../default.js';
import { LanguageModel } from '../llm/llm.js';
import { getSharedHtmlMarkdownPool } from './html-markdown-pool.js';
import { parseJSON } from "./json-parser.js";
import { logMessage } from "./logs.js";
import { callPostgres } from './postgres.js';
import { composeUrl } from "./tools.js";

interface FetchingStrategy {
  tryFetch(config: DocumentationConfig, metadata: Metadata, credentials?: Record<string, any>): Promise<string | null>;
}
interface ProcessingStrategy {
  tryProcess(rawResult: string, config: DocumentationConfig, metadata: Metadata, credentials?: Record<string, any>): Promise<string | null>;
}

export interface DocumentationConfig {
  urlHost?: string;
  instruction?: string;
  documentationUrl?: string;
  openApiUrl?: string;
  urlPath?: string;
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  keywords?: string[];
}

export class Documentation {
  public config: DocumentationConfig;
  private readonly credentials?: Record<string, any>;
  private readonly metadata: Metadata;

  private lastResult: string | null = null;

  constructor(config: DocumentationConfig, credentials: Record<string, any>, metadata: Metadata) {
    this.config = config;
    this.credentials = credentials;
    this.metadata = metadata;
  }

  public async fetchAndProcess(): Promise<string> {

    if (this.lastResult) {
      return this.lastResult;
    }

    const fetchingStrategies: FetchingStrategy[] = [
      new GraphQLStrategy(),
      new PlaywrightFetchingStrategy(),
      new AxiosFetchingStrategy()
    ];

    const processingStrategies: ProcessingStrategy[] = [
      new OpenApiStrategy(),
      new PostgreSqlStrategy(),
      new HtmlMarkdownStrategy(),
      new RawPageContentStrategy()
    ];

    let rawResult: string | null = null;

    for (const strategy of fetchingStrategies) {
      const result = await strategy.tryFetch(this.config, this.metadata, this.credentials);
      if (result == null || result.length === 0) {
        continue;
      }
      rawResult = result;
      break;
    }

    if (!rawResult) {
      rawResult = "";
    }

    for (const strategy of processingStrategies) {
      const result = await strategy.tryProcess(rawResult, this.config, this.metadata, this.credentials);
      if (result == null || result.length === 0) {
        continue;
      }
      this.lastResult = result;
      return this.lastResult;
    }

    logMessage('warn', "No processing strategy could handle the fetched documentation.", this.metadata);
    return "";
  }

  public async fetchOpenApiDocumentation(): Promise<string> {
    if (!this.config.openApiUrl) {
      return "";
    }
    try {
      const response = await axios.get(this.config.openApiUrl, { timeout: server_defaults.DOCUMENTATION.TIMEOUTS.AXIOS });
      let data = response.data;

      if (typeof data === 'object' && data !== null) {
        const openApiUrls = this.extractOpenApiUrls(data);
        if (openApiUrls.length > 0) {
          logMessage('debug', `Found ${openApiUrls.length} OpenAPI specification links in response`, this.metadata);
          const allSpecs = await this.fetchMultipleOpenApiSpecs(openApiUrls);
          return allSpecs;
        }
        return JSON.stringify(data, null, 2);
      }

      if (typeof data === 'string') {
        const trimmedData = data.trim();

        try {
          const parsed = parseJSON(trimmedData);
          const openApiUrls = this.extractOpenApiUrls(parsed);
          if (openApiUrls.length > 0) {
            logMessage('debug', `Found ${openApiUrls.length} OpenAPI specification links in response`, this.metadata);
            const allSpecs = await this.fetchMultipleOpenApiSpecs(openApiUrls);
            return allSpecs;
          }
          return JSON.stringify(parsed, null, 2);
        } catch {
          // Not valid JSON, try YAML parsing
          try {
            const parsed = yaml.load(trimmedData) as any;
            // Verify it actually parsed to an object (not just a string)
            if (typeof parsed === 'object' && parsed !== null) {
              logMessage('info', `Successfully converted YAML to JSON for ${this.config.openApiUrl}`, this.metadata);
              // Check for OpenAPI links in parsed YAML
              const openApiUrls = this.extractOpenApiUrls(parsed);
              if (openApiUrls.length > 0) {
                logMessage('debug', `Found ${openApiUrls.length} OpenAPI specification links in response`, this.metadata);
                const allSpecs = await this.fetchMultipleOpenApiSpecs(openApiUrls);
                return allSpecs;
              }
              return JSON.stringify(parsed, null, 2);
            }
          } catch (yamlError) {
            logMessage('warn', `Failed to parse content as JSON or YAML from ${this.config.openApiUrl}: ${yamlError?.message}`, this.metadata);
          }
          return data;
        }
      }

      return String(data);
    } catch (error) {
      logMessage('warn', `Failed to fetch OpenAPI documentation from ${this.config.openApiUrl}: ${error?.message}`, this.metadata);
      return "";
    }
  }

  private extractOpenApiUrls(data: any): string[] {
    const urls: string[] = [];

    const findOpenApiUrls = (obj: any) => {
      if (!obj || typeof obj !== 'object') return;

      for (const key in obj) {
        if (!obj.hasOwnProperty(key)) continue;
        const value = obj[key];

        if ((key.toLowerCase().includes('openapi') || key.toLowerCase().includes('spec')) &&
          typeof value === 'string' &&
          value.startsWith('http')) {
          urls.push(value);
        }


        if (Array.isArray(value)) {
          value.forEach(item => findOpenApiUrls(item));
        } else if (typeof value === 'object') {
          findOpenApiUrls(value);
        }
      }
    };

    findOpenApiUrls(data);
    return [...new Set(urls)]; // Remove duplicates
  }

  private async fetchMultipleOpenApiSpecs(urls: string[]): Promise<string> {
    const specs: any[] = [];
    const MAX_CONCURRENT_FETCHES = server_defaults.DOCUMENTATION.MAX_CONCURRENT_OPENAPI_FETCHES;
    const MAX_SPECS_TO_FETCH = server_defaults.DOCUMENTATION.MAX_OPENAPI_SPECS_TO_FETCH;

    const urlsToFetch = urls.slice(0, MAX_SPECS_TO_FETCH);
    if (urls.length > MAX_SPECS_TO_FETCH) {
      logMessage('warn', `Found ${urls.length} OpenAPI specs but limiting to ${MAX_SPECS_TO_FETCH}`, this.metadata);
    }

    for (let i = 0; i < urlsToFetch.length; i += MAX_CONCURRENT_FETCHES) {
      const batch = urlsToFetch.slice(i, i + MAX_CONCURRENT_FETCHES);
      const batchPromises = batch.map(async (url) => {
        try {
          const response = await axios.get(url, { timeout: server_defaults.DOCUMENTATION.TIMEOUTS.AXIOS });
          let specData = response.data;

          if (typeof specData === 'string') {
            try {
              specData = parseJSON(specData);
            } catch {
              try {
                specData = yaml.load(specData) as any;
              } catch {
              }
            }
          }

          logMessage('info', `Fetched OpenAPI spec from ${url}`, this.metadata);
          return {
            url,
            spec: specData
          };
        } catch (error) {
          logMessage('warn', `Failed to fetch OpenAPI spec from ${url}: ${error?.message}`, this.metadata);
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      specs.push(...batchResults.filter(result => result !== null));
    }

    if (specs.length === 0) {
      return "";
    } else if (specs.length === 1) {
      return JSON.stringify(specs[0].spec, null, 2);
    } else {
      return JSON.stringify({
        _meta: {
          fetchedAt: new Date().toISOString(),
          totalSpecs: specs.length
        },
        specifications: specs
      }, null, 2);
    }
  }

  public static extractRelevantSections(
    documentation: string,
    searchQuery: string,
    maxSections: number = 5,
    sectionSize: number = 2000
  ): string {
    if (!documentation || documentation.length === 0) {
      return '';
    }

    sectionSize = Math.max(200, Math.min(sectionSize, 50000));
    maxSections = Math.max(1, Math.min(maxSections, LanguageModel.contextLength / sectionSize));

    if (documentation.length <= sectionSize) {
      return documentation;
    }

    const MIN_SEARCH_TERM_LENGTH = server_defaults.DOCUMENTATION.MIN_SEARCH_TERM_LENGTH || 3;

    const searchTerms = searchQuery?.toLowerCase()?.split(/[^a-z0-9/]/)
      .map(term => term.trim())
      .filter(term => term.length >= MIN_SEARCH_TERM_LENGTH) || [];

    if (searchTerms.length === 0) {
      return '';
    }

    const sections: Array<{ content: string; searchableContent: string; index: number; sectionIndex: number }> = [];

    for (let i = 0; i < documentation.length; i += sectionSize) {
      const content = documentation.slice(i, Math.min(i + sectionSize, documentation.length));
      sections.push({
        content,
        searchableContent: content.toLowerCase(),
        index: i,
        sectionIndex: sections.length
      });
    }

    const sectionScores: Map<number, number> = new Map();

    for (const term of searchTerms) {
      sections.forEach((section, idx) => {
        let score = 0;
        const content = section.searchableContent;

        const wordBoundaryRegex = new RegExp(`\\b${term}\\b`, 'g');
        const exactMatches = (content.match(wordBoundaryRegex) || []).length;
        score += exactMatches * 3 * term.length;

        if (exactMatches === 0 && content.includes(term)) {
          score += term.length;
        }

        if (score > 0) {
          const currentScore = sectionScores.get(idx) || 0;
          sectionScores.set(idx, currentScore + score);
        }
      });
    }

    const scoredSections = sections.map((section, idx) => ({
      ...section,
      score: sectionScores.get(idx) || 0
    }));

    const topSections = scoredSections
      .sort((a, b) => b.score - a.score)
      .slice(0, maxSections)
      .filter(section => section.score > 0);

    if (topSections.length === 0) {
      return '';
    }

    topSections.sort((a, b) => a.index - b.index);

    const result = topSections.map(section => section.content).join('\n\n');

    const maxExpectedLength = maxSections * sectionSize;
    return result.length > maxExpectedLength
      ? result.slice(0, maxExpectedLength)
      : result;
  }
}

class GraphQLStrategy implements FetchingStrategy {
  private async fetchGraphQLSchema(url: string, config: ApiConfig, metadata: Metadata): Promise<any | null> {
    const introspectionQuery = getIntrospectionQuery();

    try {
      const response = await axios.post(
        url,
        {
          query: introspectionQuery,
          operationName: 'IntrospectionQuery'
        },
        { headers: config.headers, params: config.queryParams, timeout: server_defaults.DOCUMENTATION.TIMEOUTS.AXIOS }
      );

      if (response.data.errors) {
        return null;
      }
      return response.data?.data?.__schema ?? null;
    } catch (error) {
      return null;
    }
  }
  private isLikelyGraphQL(url: string, config: ApiConfig): boolean {
    if (!url) return false;
    return url?.includes('graphql') ||
      Object.values({ ...config.queryParams, ...config.headers })
        .some(val => typeof val === 'string' && val.includes('IntrospectionQuery'));
  }
  async tryFetch(config: ApiConfig, metadata: Metadata): Promise<string | null> {
    if (!config.urlHost?.startsWith("http")) return null;
    const endpointUrl = composeUrl(config.urlHost, config.urlPath);

    const urlIsLikelyGraphQL = this.isLikelyGraphQL(endpointUrl, config);
    const docUrlIsLikelyGraphQL = this.isLikelyGraphQL(config.documentationUrl, config);

    if (!urlIsLikelyGraphQL && !docUrlIsLikelyGraphQL) return null;

    const url = urlIsLikelyGraphQL ? endpointUrl : config.documentationUrl;
    if (!url) {
      return null;
    }

    const schema = await this.fetchGraphQLSchema(url, config, metadata);
    if (schema) {
      logMessage('info', `Successfully fetched GraphQL schema from ${url}.`, metadata);
      return JSON.stringify(schema);
    }
    return null;
  }
}

export class AxiosFetchingStrategy implements FetchingStrategy {
  async tryFetch(config: DocumentationConfig, metadata: Metadata): Promise<string | null> {
    if (!config.documentationUrl?.startsWith("http")) return null;

    try {
      const url = new URL(config.documentationUrl);
      if (config.queryParams) {
        Object.entries(config.queryParams).forEach(([key, value]) => {
          url?.searchParams?.append(key, value);
        });
      }

      const response = await axios.get(url.toString(), { headers: config.headers, timeout: server_defaults.DOCUMENTATION.TIMEOUTS.AXIOS });
      let data = response.data;
      return data;
    } catch (error) {
      logMessage('warn', `Axios fetch failed for ${config.documentationUrl}: ${error?.message}`, metadata);
      return null;
    }
  }
}
export class PlaywrightFetchingStrategy implements FetchingStrategy {
  private static readonly MAX_FETCHED_LINKS = server_defaults.DOCUMENTATION.MAX_FETCHED_LINKS;
  private static readonly PARALLEL_FETCH_LIMIT = server_defaults.DOCUMENTATION.MAX_PAGES_TO_FETCH_IN_PARALLEL;
  private static browserInstance: playwright.Browser | null = null;
  private browserContext: playwright.BrowserContext | null = null;

  public static readonly EXCLUDED_LINK_KEYWORDS = [
    'signup', 'login', 'pricing', 'contact', 'support', 'cookie',
    'privacy', 'terms', 'legal', 'policy', 'status', 'help', 'blog',
    'careers', 'about', 'press', 'news', 'events', 'partners',
    'changelog', 'release-notes', 'updates', 'upgrade', 'register', 'cli',
    'signin', 'sign-in', 'sign-up', 'trial', 'demo', 'sales', 'widget', 'webhooks',
    // dont include the same page in different languages
    '/de/', '/it/', '/fr/', '/nl/', '/es/', '/pt/', '/pl/', '/ru/', '/ja/', '/zh/',
    '/ko/', '/zh-CN/', '/zh-TW/', '/id/'
  ];



  private static async getBrowser(): Promise<playwright.Browser> {
    if (!PlaywrightFetchingStrategy.browserInstance) {
      PlaywrightFetchingStrategy.browserInstance = await playwright.chromium.launch();
    }
    return PlaywrightFetchingStrategy.browserInstance;
  }

  static async closeBrowser(): Promise<void> {
    if (PlaywrightFetchingStrategy.browserInstance) {
      const closedInstance = PlaywrightFetchingStrategy.browserInstance;
      PlaywrightFetchingStrategy.browserInstance = null;
      try {
        await closedInstance.close();
      } catch (error) {
        console.warn('Failed to close browser gracefully:', error?.message);
        try {
          // Force kill if graceful close fails
          const browserProcess = (closedInstance as any)._process;
          if (browserProcess && !browserProcess.killed) {
            browserProcess.kill('SIGKILL');
          }
        } catch (killError) {
          console.warn('Failed to force kill browser:', killError?.message);
        }
      }
    }
  }
  private async getOrCreateContext(config: DocumentationConfig): Promise<playwright.BrowserContext> {
    if (!this.browserContext) {
      const browser = await PlaywrightFetchingStrategy.getBrowser();
      this.browserContext = await browser.newContext();

      if (config.headers) {
        await this.browserContext.setExtraHTTPHeaders(config.headers);
      }
    }
    return this.browserContext;
  }

  private async cleanupContext(): Promise<void> {
    if (this.browserContext) {
      try {
        await this.browserContext.close();
      } catch (e) {
        // Context might already be closed
      }
      this.browserContext = null;
    }
  }

  private async fetchPageContentWithPlaywright(urlString: string, config: DocumentationConfig, metadata: Metadata): Promise<{ content: string; links: Record<string, string>; } | null> {

    if (!urlString?.startsWith("http")) {
      return null;
    }

    let page: playwright.Page | null = null;

    try {
      const browserContext = await this.getOrCreateContext(config);

      const url = new URL(urlString);
      if (config.queryParams) {
        Object.entries(config.queryParams).forEach(([key, value]) => {
          url?.searchParams?.append(key, value);
        });
      }

      page = await browserContext.newPage();
      await page.goto(url.toString(), { timeout: server_defaults.DOCUMENTATION.TIMEOUTS.PLAYWRIGHT });
      await page.waitForLoadState('domcontentloaded', { timeout: server_defaults.DOCUMENTATION.TIMEOUTS.PLAYWRIGHT });
      await page.waitForTimeout(1000);

      const result = await page.evaluate(() => {
        const selectorsToRemove = [
          // Media elements
          'img, video, svg, canvas, iframe, picture, source, audio, embed, object',
          // ARIA landmarks that typically contain non-content
          '[role="banner"], [role="dialog"], [role="contentinfo"], [role="complementary"]',
          // Cookie & privacy notices
          '.cookie-banner, .cookie-consent, .cookies, .gdpr, .privacy-notice',
          // Navigation elements
          'nav, header, footer, aside, .sidebar, .menu, .navbar, .toolbar',
          // Social & engagement widgets
          '.social, .share, .chat, .feedback, .comments, .disqus',
          // Chat widgets (specific vendors)
          '.intercom, .drift, .zendesk, .freshchat, .tawk',
          // Advertising & promotions
          '.ads, .advertisement, .banner, .promo, .sponsored',
          // Scripts, styles, and tracking
          'script, style, noscript, link[rel="stylesheet"]',
          '[data-ga], [data-gtm], [data-analytics], [data-track]',
          // Navigation helpers
          '.breadcrumb, .pagination, .pager',
          // Related content suggestions
          '.related, .recommended, .also-see',
          // Interactive elements
          'form, input, button, select, textarea'
        ];
        selectorsToRemove.forEach(selector =>
          document.querySelectorAll(selector).forEach(el => el.remove())
        );

        const links: Record<string, string> = {};
        document.querySelectorAll('a').forEach(link => {
          try {
            const anchor = link as HTMLAnchorElement;
            const url = new URL(anchor.href);
            const key = `${anchor.textContent} ${url.pathname}`.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
            links[key] = anchor.href.split('#')[0].trim();
          } catch (e) { }
        });

        const mainContent = document.querySelector('article, main, .docs-content, .markdown, .md-content, .api-content, .docContent, .content, .doc-body');
        const html = mainContent
          ? `<html><body>${mainContent.outerHTML}</body></html>`
          : `<html><body>${document.body?.innerHTML || ''}</body></html>`;

        return { html, links };
      });

      if (!result || !result.html) {
        logMessage('warn', `Failed to extract content from ${urlString}`, metadata);
        return null;
      }

      let { html, links } = result;

      if (html.length > server_defaults.DOCUMENTATION.MAX_PAGE_SIZE_BYTES) {
        logMessage('warn', `Page ${urlString} exceeds size limit after cleanup (${Math.round(html.length / 1024 / 1024)}MB > ${Math.round(server_defaults.DOCUMENTATION.MAX_PAGE_SIZE_BYTES / 1024 / 1024)}MB), truncating`, metadata);
        html = html.substring(0, server_defaults.DOCUMENTATION.MAX_PAGE_SIZE_BYTES) + '\n<!-- Content truncated due to size limit -->';
      }

      logMessage('debug', `Successfully fetched content for ${urlString}`, metadata);
      return {
        content: html,
        links
      };
    } catch (error) {
      logMessage('warn', `Playwright fetch failed for ${urlString}: ${error?.message}`, metadata);
      return null;
    } finally {
      if (page) {
        try {
          await page.close();
        } catch (e) {
        }
      }
    }
  }

  private async discoverSitemapUrls(baseUrl: string): Promise<string[]> {
    const candidates: string[] = [];
    try {
      const url = new URL(baseUrl);
      const origin = url.origin;
      const pathname = url.pathname;

      if (pathname && pathname !== '/') {
        // Try sitemap at the exact path
        candidates.push(`${baseUrl}/sitemap.xml`);

        // Try sitemap at parent directories
        const pathParts = pathname.split('/').filter(p => p);
        for (let i = pathParts.length; i > 0; i--) {
          const parentPath = '/' + pathParts.slice(0, i).join('/');
          candidates.push(`${origin}${parentPath}/sitemap.xml`);
        }
      }

      // Add common root sitemap locations
      candidates.push(
        `${origin}/sitemap.xml`,
        `${origin}/sitemap_index.xml`
      );

    } catch {
      // Invalid URL
    }
    // Remove duplicates while preserving order
    return [...new Set(candidates)];
  }

  private async fetchSitemapContent(sitemapUrl: string, config: DocumentationConfig): Promise<string | null> {
    try {
      const response = await axios.get(sitemapUrl, {
        headers: config.headers,
        timeout: server_defaults.DOCUMENTATION.TIMEOUTS.SITEMAP_FETCH,
        validateStatus: (status) => status === 200
      });

      const content = response.data;
      if (typeof content !== 'string') return null;

      const trimmed = content.trim();
      if (!trimmed.startsWith('<?xml') && !trimmed.startsWith('<urlset') && !trimmed.startsWith('<sitemapindex')) {
        return null;
      }

      if (!content.includes('<loc>') || (!content.includes('<url>') && !content.includes('<sitemap>'))) {
        return null;
      }

      return content;
    } catch {
      return null;
    }
  }

  private parseSitemapContent(content: string, baseUrl: string): { urls: string[], sitemaps: string[] } {
    const urls: string[] = [];
    const sitemaps: string[] = [];

    try {
      const hasXmlTags = content.includes('<loc>') && content.includes('</loc>');

      if (hasXmlTags) {
        const locMatches = content.matchAll(/<loc>([^<]+)<\/loc>/gi);
        const allLocs: string[] = [];
        for (const match of locMatches) {
          const url = match[1].trim();
          if (url.startsWith('http')) {
            allLocs.push(url);
          }
        }

        for (const loc of allLocs) {
          const locIndex = content.indexOf(`<loc>${loc}</loc>`);
          if (locIndex === -1) continue;

          const precedingContent = content.substring(Math.max(0, locIndex - 200), locIndex);
          if (precedingContent.match(/<sitemap[^>]*>/i)) {
            sitemaps.push(loc);
          } else {
            urls.push(loc);
          }
        }

        if (urls.length === 0 && sitemaps.length === 0 && allLocs.length > 0) {
          urls.push(...allLocs);
        }
      } else {
        const potentialUrls = content.split(/\s+/);
        for (const potentialUrl of potentialUrls) {
          const trimmed = potentialUrl.trim();
          if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
            try {
              new URL(trimmed);
              urls.push(trimmed);
            } catch {
              // Invalid URL
            }
          }
        }
      }
    } catch {
      // Parsing error
    }

    return { urls, sitemaps };
  }
  private filterUrls(urls: string[]): string[] {
    const filteredUrls = urls.filter(url => {
      try {
        const urlLower = new URL(url).pathname.toLowerCase();
        for (const excludedKeyword of PlaywrightFetchingStrategy.EXCLUDED_LINK_KEYWORDS) {
          if (urlLower.includes(excludedKeyword)) {
            return false;
          }
        }
        return true;
      } catch {
        return false;
      }
    });
    if (filteredUrls.length > 0) {
      return filteredUrls;
    }
    return urls;
  }
  private async collectSitemapUrls(config: DocumentationConfig, metadata: Metadata): Promise<string[]> {
    if (!config.documentationUrl) return [];

    const sitemapCandidates = await this.discoverSitemapUrls(config.documentationUrl);
    const processedSitemaps = new Set<string>();
    const sitemapQueue: string[] = [];

    let docUrl: URL;
    try {
      docUrl = new URL(config.documentationUrl);
    } catch {
      logMessage('warn', `Invalid documentation URL: ${config.documentationUrl}`, metadata);
      return [];
    }

    for (const candidate of sitemapCandidates) {
      const content = await this.fetchSitemapContent(candidate, config);
      if (content) {
        logMessage('debug', `Found sitemap at: ${candidate}`, metadata);
        sitemapQueue.push(candidate);
        break;
      }
    }

    if (sitemapQueue.length === 0) {
      logMessage('debug', `No sitemap found. Tried: ${sitemapCandidates.slice(0, 5).join(', ')}...`, metadata);
    }

    const MAX_SITEMAP_DEPTH = server_defaults.DOCUMENTATION.MAX_SITEMAP_DEPTH;
    const MAX_SITEMAPS_PER_DEPTH = server_defaults.DOCUMENTATION.MAX_SITEMAPS_PER_DEPTH;
    const MAX_TOTAL_SITEMAPS = server_defaults.DOCUMENTATION.MAX_TOTAL_SITEMAPS;

    let depth = 0;
    const allSitemapUrls: string[] = [];

    while (sitemapQueue.length > 0 && depth < MAX_SITEMAP_DEPTH) {
      // Global limit check - stop if we've processed enough sitemaps overall
      if (processedSitemaps.size >= MAX_TOTAL_SITEMAPS) {
        logMessage('debug', `Reached global sitemap limit (${MAX_TOTAL_SITEMAPS}), stopping sitemap discovery`, metadata);
        break;
      }

      const currentBatch = [...sitemapQueue];
      sitemapQueue.length = 0;
      depth++;

      // Rank and limit sitemaps at this depth level
      let sitemapsToProcess = currentBatch;
      if (currentBatch.length > MAX_SITEMAPS_PER_DEPTH) {
        const keywords = this.getMergedKeywords(config.keywords);
        sitemapsToProcess = this.rankItems(currentBatch, keywords) as string[];
        sitemapsToProcess = sitemapsToProcess.slice(0, MAX_SITEMAPS_PER_DEPTH);
        logMessage('debug', `Ranked and limited sitemaps at depth ${depth} from ${currentBatch.length} to ${sitemapsToProcess.length}`, metadata);
      }

      // Further limit by remaining global budget
      const remainingBudget = MAX_TOTAL_SITEMAPS - processedSitemaps.size;
      if (sitemapsToProcess.length > remainingBudget) {
        sitemapsToProcess = sitemapsToProcess.slice(0, remainingBudget);
        logMessage('debug', `Further limited sitemaps to ${sitemapsToProcess.length} based on global budget`, metadata);
      }

      for (const sitemapUrl of sitemapsToProcess) {
        if (processedSitemaps.has(sitemapUrl)) continue;
        processedSitemaps.add(sitemapUrl);

        const content = await this.fetchSitemapContent(sitemapUrl, config);
        if (!content) continue;

        const { urls, sitemaps } = this.parseSitemapContent(content, sitemapUrl);
        const filteredUrls = this.filterUrls(urls);

        if (filteredUrls.length > 0) {
          logMessage('debug', `Found ${urls.length} total URLs in sitemap, ${filteredUrls.length} after filtering. First few: ${filteredUrls.slice(0, 3).join(', ')}`, metadata);
        }

        allSitemapUrls.push(...filteredUrls);

        // Only process nested sitemaps if we haven't hit the global limit
        if (processedSitemaps.size >= MAX_TOTAL_SITEMAPS) {
          continue;
        }

        // Filter sitemaps to only include relevant ones based on the documentation URL
        const relevantSitemaps = sitemaps.filter(s => {
          if (processedSitemaps.has(s)) return false;

          try {
            const sitemapUrl = new URL(s);

            // Must be same host
            if (sitemapUrl.hostname !== docUrl.hostname) {
              return false;
            }

            // Check if sitemap path is relevant to documentation path
            const docPath = docUrl.pathname.replace(/\/$/, '');
            const sitemapPath = sitemapUrl.pathname.replace(/\/$/, '');

            // Accept sitemap if:
            // 1. It's at root level (applies to everything)
            if (sitemapPath === '/sitemap.xml' || sitemapPath === '/sitemap_index.xml') {
              return true;
            }

            // 2. It shares a common path prefix with the documentation URL
            if (docPath && docPath !== '/') {
              const docParts = docPath.split('/').filter(p => p);
              const sitemapParts = sitemapPath.split('/').filter(p => p);

              // Check if sitemap is under same path hierarchy
              for (let i = 0; i < Math.min(docParts.length, sitemapParts.length - 1); i++) {
                if (docParts[i] === sitemapParts[i]) {
                  return true; // Share common path prefix
                }
              }
            }

            // 3. It contains documentation-related keywords in the path
            const relevantKeywords = ['docs', 'api', 'documentation'];
            const sitemapLower = sitemapPath.toLowerCase();
            if (relevantKeywords.some(keyword => sitemapLower.includes(keyword))) {
              return true;
            }

            return false;
          } catch {
            return false;
          }
        });

        if (relevantSitemaps.length > 0) {
          // Only add if we have room in the global budget
          const roomLeft = MAX_TOTAL_SITEMAPS - processedSitemaps.size;
          if (roomLeft > 0) {
            const sitemapsToAdd = relevantSitemaps.slice(0, roomLeft);
            logMessage('debug', `Adding ${sitemapsToAdd.length} relevant sitemaps to queue (filtered from ${sitemaps.length} total, limited by budget)`, metadata);
            sitemapQueue.push(...sitemapsToAdd);
          }
        }
      }
    }

    const uniqueSitemapUrls = [...new Set(allSitemapUrls)];
    const filterPaths: string[] = [];
    const pathParts = docUrl.pathname.split('/').filter(p => p);

    filterPaths.push(docUrl.pathname);

    for (let i = pathParts.length - 1; i >= 0; i--) {
      const parentPath = '/' + pathParts.slice(0, i).join('/');
      if (parentPath !== '/' && !filterPaths.includes(parentPath)) {
        filterPaths.push(parentPath);
      }
    }

    filterPaths.push('/');

    for (const filterPath of filterPaths) {
      const filteredUrls = uniqueSitemapUrls.filter(url => {
        try {
          const urlObj = new URL(url);

          // Check if it's the same host
          if (urlObj.hostname !== docUrl.hostname) {
            return false;
          }

          // Check if the URL path starts with the filter path
          const normalizedFilterPath = filterPath.replace(/\/$/, '');
          const normalizedUrlPath = urlObj.pathname.replace(/\/$/, '');

          if (normalizedFilterPath === '') {
            return true;
          }

          return normalizedUrlPath.startsWith(normalizedFilterPath);
        } catch {
          return false;
        }
      });

      if (filteredUrls.length > 0) {
        if (filteredUrls.length >= PlaywrightFetchingStrategy.MAX_FETCHED_LINKS || filterPath === '/') {
          return filteredUrls;
        }
      }
    }
    return uniqueSitemapUrls;
  }

  private async fetchPagesInBatches(
    urls: string[],
    config: DocumentationConfig,
    metadata: Metadata
  ): Promise<string> {
    let combinedContent = "";
    const BATCH_SIZE = PlaywrightFetchingStrategy.PARALLEL_FETCH_LIMIT;
    const MAX_TOTAL_SIZE = server_defaults.DOCUMENTATION.MAX_TOTAL_CONTENT_SIZE;
    let totalSize = 0;
    let fetchedCount = 0;

    for (let i = 0; i < urls.length && fetchedCount < PlaywrightFetchingStrategy.MAX_FETCHED_LINKS; i += BATCH_SIZE) {
      const remainingSlots = PlaywrightFetchingStrategy.MAX_FETCHED_LINKS - fetchedCount;
      const batch = urls.slice(i, Math.min(i + BATCH_SIZE, i + remainingSlots));

      const batchPromises = batch.map(async (url) => {
        const result = await this.fetchPageContentWithPlaywright(url, config, metadata);
        if (!result?.content) return null;
        return { url, content: result.content };
      });

      const results = await Promise.all(batchPromises);

      for (const result of results) {
        if (!result || !result.content) continue;

        const contentSize = Buffer.byteLength(result.content, 'utf8');

        // Skip if adding this would exceed our total budget
        if (totalSize + contentSize > MAX_TOTAL_SIZE) {
          logMessage('debug', `Reached size budget (${Math.round(totalSize / 1024 / 1024)}MB), skipping remaining pages`, metadata);
          return combinedContent;
        }

        // Skip duplicate content
        if (combinedContent.includes(result.content)) {
          continue;
        }

        combinedContent += combinedContent ? `\n\n${result.content}` : result.content;
        totalSize += contentSize;
        fetchedCount++;
      }

      if (totalSize >= MAX_TOTAL_SIZE * 0.9) {
        logMessage('debug', `Approaching size budget (${Math.round(totalSize / 1024 / 1024)}MB), stopping fetch`, metadata);
        break;
      }
    }

    return combinedContent;
  }

  async tryFetch(config: DocumentationConfig, metadata: Metadata): Promise<string | null> {
    if (!config?.documentationUrl) return null;

    try {
      try {
        // Apply timeout only to sitemap URL collection
        const sitemapUrlsPromise = this.collectSitemapUrls(config, metadata);
        let timeoutHandle: NodeJS.Timeout;
        const timeoutPromise = new Promise<string[]>((resolve) => {
          timeoutHandle = setTimeout(() => {
            logMessage('warn', 'Sitemap URL collection timed out, falling back to iterative crawling', metadata);
            resolve([]);
          }, server_defaults.DOCUMENTATION.TIMEOUTS.SITEMAP_PROCESSING_TOTAL);
        });

        const sitemapUrls = await Promise.race([sitemapUrlsPromise, timeoutPromise]);

        if (timeoutHandle!) {
          clearTimeout(timeoutHandle);
        }

        if (sitemapUrls.length > 0) {
          const keywords = this.getMergedKeywords(config.keywords);
          const rankedUrls = this.rankItems(sitemapUrls, keywords) as string[];

          const topUrls = rankedUrls.slice(0, PlaywrightFetchingStrategy.MAX_FETCHED_LINKS);
          const content = await this.fetchPagesInBatches(topUrls, config, metadata);

          if (content) {
            return content;
          }
        }
      } catch (error) {
        logMessage('warn', `Sitemap processing failed: ${error?.message}, falling back to legacy crawling`, metadata);
      }

      return await this.legacyTryFetch(config, metadata);
    } finally {
      await this.cleanupContext();
    }
  }

  public getDefaultKeywords(): string[] {
    return [
      "authentication", "authorization", "bearer", "token", "pagination", "api",
      "getting started", "quickstart", "guides", "tutorial", "api-reference", "open api", "swagger",
      "objects", "data-objects", "properties", "values", "fields", "attributes", "parameters", "slugs", "schema", "lists", "query", "rest", "endpoints", "reference", "methods",
      "pagination", "response", "filtering", "sorting", "searching", "filter", "sort", "search",
      "get", "post", "put", "delete", "patch",
    ];
  }

  public getMergedKeywords(inputKeywords?: string[] | null): string[] {
    const defaultKeywords = this.getDefaultKeywords();

    if (!inputKeywords || inputKeywords.length === 0) {
      return defaultKeywords;
    }

    // Merge input keywords with defaults, removing duplicates
    const mergedSet = new Set([...inputKeywords, ...defaultKeywords]);
    return Array.from(mergedSet);
  }

  public rankItems(items: string[] | { linkText: string, href: string }[], keywords: string[], fetchedLinks?: Set<string>): any[] {
    const normalizedItems = items.map((item, index) => {
      const isString = typeof item === 'string';
      const url = isString ? new URL(item).pathname : new URL(item.href).pathname;
      const text = isString ? '' : item.linkText;
      const searchableContent = `${url} ${text}`.toLowerCase();

      return {
        url,
        original: item,
        searchableContent,
        index
      };
    });

    let itemsToRank = fetchedLinks
      ? normalizedItems.filter(item => {
        const href = typeof item.original === 'string' ? item.original : item.original.href;
        return !fetchedLinks.has(href);
      })
      : normalizedItems;

    const itemsToRankFiltered = itemsToRank.filter(item => {
      try {
        for (const excludedKeyword of PlaywrightFetchingStrategy.EXCLUDED_LINK_KEYWORDS) {
          if (item.url.includes(excludedKeyword)) {
            return false;
          }
        }
        return true;
      } catch {
        return false;
      }
    });
    if (itemsToRankFiltered.length > 0) {
      itemsToRank = itemsToRankFiltered;
    }


    if (!keywords || keywords.length === 0) {
      return itemsToRank.map(item => item.original);
    }

    const scored = itemsToRank.map(item => {
      let matchScore = 0;
      const content = item.searchableContent;

      for (const keyword of keywords) {
        const keywordLower = keyword.toLowerCase();
        const wordBoundaryRegex = new RegExp(`\\b${keywordLower}\\b`, 'g');
        const exactMatches = (content.match(wordBoundaryRegex) || []).length;
        matchScore += exactMatches * 3;

        if (exactMatches === 0 && content.includes(keywordLower)) {
          matchScore += 1;
        }
      }

      const urlLength = Math.max(item.url.length, 1);
      const score = matchScore / urlLength;

      return {
        item: item.original,
        score,
        hasMatch: matchScore > 0
      };
    });

    return scored
      .sort((a, b) => {
        if (a.hasMatch !== b.hasMatch) {
          return a.hasMatch ? -1 : 1;
        }
        return b.score - a.score;
      })
      .map(s => s.item);
  }

  private async crawlWithLinks(startUrl: string, config: DocumentationConfig, metadata: Metadata): Promise<string> {
    const visitedUrls = new Set<string>();
    const linkQueue: { linkText: string, href: string }[] = [{ linkText: "documentation", href: startUrl }];
    const searchKeywords = this.getMergedKeywords(config.keywords);
    let aggregatedContent = "";

    while (visitedUrls.size < PlaywrightFetchingStrategy.MAX_FETCHED_LINKS && linkQueue.length > 0) {
      // Get next prioritized link
      const prioritizedLinks = this.rankItems(linkQueue, searchKeywords, visitedUrls) as { linkText: string, href: string }[];
      if (prioritizedLinks.length === 0) break;

      const nextLink = prioritizedLinks[0];
      linkQueue.splice(linkQueue.findIndex(l => l.href === nextLink.href), 1);

      try {
        const pageData = await this.fetchPageContentWithPlaywright(nextLink.href, config, metadata);
        visitedUrls.add(nextLink.href);

        if (pageData?.content) {
          aggregatedContent += aggregatedContent ? `\n\n${pageData.content}` : pageData.content;

          // Add discovered links to queue
          if (pageData.links) {
            for (const [linkText, href] of Object.entries(pageData.links)) {
              if (this.isValidDocLink(href, linkText, startUrl) &&
                !visitedUrls.has(href) &&
                !linkQueue.some(l => l.href === href)) {
                linkQueue.push({ linkText, href });
              }
            }
          }
        }
      } catch (error) {
        logMessage('warn', `Failed to fetch ${nextLink.href}: ${error?.message}`, metadata);
      }
    }

    return aggregatedContent;
  }

  async legacyTryFetch(config: DocumentationConfig, metadata: Metadata): Promise<string | null> {
    if (!config?.documentationUrl) return null;
    return this.crawlWithLinks(config.documentationUrl, config, metadata);
  }

  private isValidDocLink(href: string, linkText: string, baseUrl: string): boolean {
    if (!linkText || !href) return false;

    const hrefLower = new URL(href).pathname.toLowerCase();
    if (PlaywrightFetchingStrategy.EXCLUDED_LINK_KEYWORDS.some(kw => hrefLower.includes(kw))) {
      return false;
    }

    try {
      const base = new URL(baseUrl);
      const link = new URL(href);

      if (link.hostname !== base.hostname) return false;

      // Stay within documentation path scope
      const baseParts = base.pathname.split('/').filter(p => p);
      if (baseParts.length >= 2) {
        const requiredPath = '/' + baseParts.slice(0, -1).join('/');
        if (!link.pathname.startsWith(requiredPath)) return false;
      }

      return true;
    } catch {
      return false;
    }
  }


}

class PostgreSqlStrategy implements ProcessingStrategy {
  async tryProcess(content: string, config: ApiConfig, metadata: Metadata, credentials?: Record<string, any>): Promise<string | null> {
    if (config.urlHost?.startsWith("postgres://") || config.urlHost?.startsWith("postgresql://")) {
      const url = composeUrl(config.urlHost, config.urlPath);

      // First get the schema information
      const schemaQuery = {
        query: `SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;`
      };

      const schemaResponse = await callPostgres({ ...config, body: JSON.stringify(schemaQuery) }, null, credentials, null);
      logMessage('info', `PostgreSQL Documentation Fetch: Schema retrieved ${schemaResponse.length} rows`, {});
      if (!schemaResponse) return null;
      return `${content ? `<DOCUMENTATION>\n${content}\n</DOCUMENTATION>\n` : ""}<DB_SCHEMA>\n${JSON.stringify(schemaResponse, null, 2)}\n</DB_SCHEMA>`;
    }
    return null;
  }
}

class OpenApiStrategy implements ProcessingStrategy {
  private extractOpenApiUrl(html: string, metadata: Metadata): string | null {
    try {
      const settingsMatch = html.match(/<script[^>]*id=["']swagger-settings["'][^>]*>([\s\S]*?)<\/script>/i);
      if (settingsMatch && settingsMatch[1]) {
        const settingsContent = settingsMatch[1].trim();
        try {
          const settings = parseJSON(settingsContent);
          if (settings.url && typeof settings.url === 'string') {
            return settings.url;
          }
        } catch (e) {
        }
      }

      // Fallback: look for JSON with a url property pointing to openapi/swagger spec
      const jsonMatch = html.match(/{\s*"url"\s*:\s*"([^"]*(?:openapi|swagger|spec)\.(?:json|yaml|yml))"/i);
      if (jsonMatch && jsonMatch[1]) {
        return jsonMatch[1];
      }
      // Fallback: look for a slightly different JSON structure often used
      const jsonMatch2 = html.match(/url:\s*"([^"]*(?:openapi|swagger|spec)\.(?:json|yaml|yml))"/i);
      if (jsonMatch2 && jsonMatch2[1]) {
        return jsonMatch2[1];
      }

      // find direct references to common spec file names within quotes
      const directUrlMatch = html.match(/["']((?:https?:\/\/|\/)[^"']*(?:openapi|swagger)\.(?:json|yaml|yml))["']/i);
      if (directUrlMatch && directUrlMatch[1]) {
        return directUrlMatch[1];
      }

      // find references in script blocks that might assign the URL to a variable
      const scriptVarMatch = html.match(/url\s*=\s*["']([^"']*(?:openapi|swagger)\.(?:json|yaml|yml))["']/i);
      if (scriptVarMatch && scriptVarMatch[1]) {
        return scriptVarMatch[1];
      }


      return null;
    } catch (error) {
      return null;
    }
  }
  private async fetchOpenApiFromUrl(openApiUrl: string, config: ApiConfig, metadata: Metadata): Promise<string | null> {
    try {
      let absoluteOpenApiUrl = openApiUrl;
      if (openApiUrl.startsWith("/")) {
        const baseUrl = config.documentationUrl ? new URL(config.documentationUrl).origin : config.urlHost;
        absoluteOpenApiUrl = composeUrl(baseUrl, openApiUrl);
      }
      const openApiResponse = await axios.get(absoluteOpenApiUrl, { headers: config.headers, timeout: server_defaults.DOCUMENTATION.TIMEOUTS.AXIOS });
      const openApiData = openApiResponse.data;

      if (!openApiData) return null;

      if (typeof openApiData === 'object' && openApiData !== null) {
        if (openApiData.openapi || openApiData.swagger) {
          return JSON.stringify(openApiData);
        } else {
          return JSON.stringify(openApiData);
        }
      } else if (typeof openApiData === 'string') {
        try {
          const parsed = parseJSON(openApiData);
          if (parsed && (parsed.openapi || parsed.swagger)) {
            logMessage('info', `Successfully fetched valid OpenAPI/Swagger JSON string from ${absoluteOpenApiUrl}`, metadata);
            return openApiData; // Valid JSON spec
          }
        } catch (e) { /* ignore */ }
        const trimmedData = openApiData.trim();
        if (trimmedData.startsWith('openapi:') || trimmedData.startsWith('swagger:')) {
          logMessage('info', `Successfully fetched likely OpenAPI/Swagger YAML string from ${absoluteOpenApiUrl}`, metadata);
          return openApiData; // Likely YAML spec
        }
        return openApiData; // Return raw string as fallback
      }

      logMessage('warn', `Unexpected data type received from ${absoluteOpenApiUrl}: ${typeof openApiData}`, metadata);
      return null;

    } catch (error) {
      logMessage('warn', `Failed to fetch or process OpenAPI spec from ${openApiUrl}: ${error?.message}`, metadata);
      return null;
    }
  }

  async tryProcess(content: string, config: ApiConfig, metadata: Metadata): Promise<string | null> {
    if (content === undefined || content === null) {
      return null;
    }
    if (typeof content !== 'string') {
      content = JSON.stringify(content, null, 2);
    }
    const trimmedContent = content.trim();
    const isJson = trimmedContent.startsWith('{') && trimmedContent.endsWith('}');
    const isYaml = trimmedContent.startsWith('openapi:') || trimmedContent.startsWith('swagger:');
    const isHtml = trimmedContent.slice(0, 500).toLowerCase().includes("<html");
    if (isJson) {
      try {
        const parsed = parseJSON(trimmedContent);
        if (parsed && (parsed.openapi || parsed.swagger)) {
          logMessage('info', "Provided content is already a valid OpenAPI/Swagger JSON spec.", metadata);
          return trimmedContent; // Content is a valid JSON spec
        }
      } catch (e) { /* ignore parse error */ }
    }
    if (isYaml) {
      logMessage('info', "Provided content appears to be an OpenAPI/Swagger YAML spec.", metadata);
      // Basic check is enough for YAML start
      return trimmedContent; // Content is likely a YAML spec
    }
    if (isHtml) {
      const openApiUrl = this.extractOpenApiUrl(content, metadata);
      if (!openApiUrl) {
        return null;
      }

      const openApiSpec = await this.fetchOpenApiFromUrl(openApiUrl, config, metadata);
      if (!openApiSpec) {
        return null; // Only return null if fetching the SPEC failed. If HTML->MD fails, we still return the spec.
      }

      // Try to convert HTML to Markdown as supplementary info
      const markdownContent = await new HtmlMarkdownStrategy().tryProcess(content, config, metadata);
      if (markdownContent) {
        logMessage('info', "Successfully extracted OpenAPI spec and converted HTML to Markdown.", metadata);
        return `${openApiSpec}\n\n${markdownContent}`;
      } else {
        logMessage('warn', "Successfully extracted OpenAPI spec, but failed to convert HTML to Markdown. Returning spec only.", metadata);
        return openApiSpec;
      }
    }
    // Content is not JSON, YAML, or HTML that contained an OpenAPI spec
    return null;
  }
}

class HtmlMarkdownStrategy implements ProcessingStrategy {
  async tryProcess(content: string, config: ApiConfig, metadata: Metadata): Promise<string | null> {
    if (content === undefined || content === null) {
      return null;
    }
    if (typeof content !== 'string') {
      content = JSON.stringify(content, null, 2);
    }

    const contentStart = content.slice(0, 1000).toLowerCase();
    const hasMarkdownIndicators = contentStart.includes('##') || contentStart.includes('###') ||
      contentStart.includes('```') || contentStart.includes('- ') ||
      contentStart.includes('* ');
    const hasHtmlIndicators = contentStart.includes("<html") || contentStart.includes("<!doctype") ||
      contentStart.includes("<body") || contentStart.includes("<div");

    // Already Markdown
    if (hasMarkdownIndicators && !hasHtmlIndicators) {
      return content;
    }

    // Not HTML
    if (!hasHtmlIndicators) {
      return null;
    }

    try {
      const pool = getSharedHtmlMarkdownPool();
      const markdown = await pool.convert(content);
      return markdown ?? '';
    } catch (translateError) {
      logMessage('error', `HTML to Markdown conversion failed: ${translateError}`, metadata);
      return null;
    }
  }
}

class RawPageContentStrategy implements ProcessingStrategy {
  async tryProcess(content: string, config: ApiConfig, metadata: Metadata): Promise<string | null> {
    // This is the final fallback if content was fetched but not processed by other strategies
    if (content) {
      logMessage('info', "Using raw fetched content as final documentation.", metadata);
      if (typeof content !== 'string') {
        content = JSON.stringify(content, null, 2);
      }
      return content;
    }
    return null;
  }
}
