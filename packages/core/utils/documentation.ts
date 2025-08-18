import playwright from '@playwright/test';
import { ApiConfig } from "@superglue/client";
import { Metadata } from "@superglue/shared";
import axios from "axios";
import { getIntrospectionQuery } from "graphql";
import * as yaml from 'js-yaml';
import { NodeHtmlMarkdown } from "node-html-markdown";
import { server_defaults } from '../default.js';
import { LanguageModel } from '../llm/llm.js';
import { parseJSON } from "./json-parser.js";
import { logMessage } from "./logs.js";
import { callPostgres } from './postgres.js';
import { composeUrl } from "./tools.js";

// Strategy Interface
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
  // Configuration stored per instance
  public config: DocumentationConfig;
  private readonly credentials?: Record<string, any>;
  private readonly metadata: Metadata;

  private lastResult: string | null = null;

  constructor(config: DocumentationConfig, credentials: Record<string, any>, metadata: Metadata) {
    this.config = config;
    this.credentials = credentials;
    this.metadata = metadata;
  }

  // Main function to fetch and process documentation using strategies
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

      // If data is already an object (axios parsed it), check for OpenAPI links
      if (typeof data === 'object' && data !== null) {
        // Check if this is a discovery/index response with links to other OpenAPI docs
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

        // First, try to parse as JSON
        try {
          const parsed = parseJSON(trimmedData);
          // Check for OpenAPI links in parsed JSON
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

    // Recursive function to find all OpenAPI URLs in the data structure
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

    // Fetch specs in batches to avoid overwhelming the server
    for (let i = 0; i < urlsToFetch.length; i += MAX_CONCURRENT_FETCHES) {
      const batch = urlsToFetch.slice(i, i + MAX_CONCURRENT_FETCHES);
      const batchPromises = batch.map(async (url) => {
        try {
          const response = await axios.get(url, { timeout: server_defaults.DOCUMENTATION.TIMEOUTS.AXIOS });
          let specData = response.data;

          // Parse if string
          if (typeof specData === 'string') {
            try {
              specData = parseJSON(specData);
            } catch {
              // Try YAML parsing
              try {
                specData = yaml.load(specData) as any;
              } catch {
                // Keep as string if parsing fails
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

    // Return combined specs
    if (specs.length === 0) {
      return "";
    } else if (specs.length === 1) {
      return JSON.stringify(specs[0].spec, null, 2);
    } else {
      // Return all specs with their URLs for reference
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

    // Validate and adjust maxSections
    sectionSize = Math.max(200, Math.min(sectionSize, 50000)); // Between 200 and 50000
    maxSections = Math.max(1, Math.min(maxSections, LanguageModel.contextLength / sectionSize)); // Between 1 and ContextLength / sectionSize

    // If document is smaller than one section, return the whole thing
    if (documentation.length <= sectionSize) {
      return documentation;
    }

    const MIN_SEARCH_TERM_LENGTH = server_defaults.DOCUMENTATION_MIN_SEARCH_TERM_LENGTH || 3;

    // Extract search terms from query - split on non-alphanumeric characters
    const searchTerms = searchQuery?.toLowerCase()?.split(/[^a-z0-9/]/)
      .map(term => term.trim())
      .filter(term => term.length >= MIN_SEARCH_TERM_LENGTH) || [];

    // If no valid search terms, return empty string
    if (searchTerms.length === 0) {
      return '';
    }

    const sections: { content: string; score: number; index: number; }[] = [];

    // Create sections of the specified size
    for (let i = 0; i < documentation.length; i += sectionSize) {
      const section = documentation.slice(i, Math.min(i + sectionSize, documentation.length));
      const sectionLower = section.toLowerCase();

      // Score section based on search term matches
      let score = 0;
      for (const term of searchTerms) {
        const matches = sectionLower.split(term).length - 1;
        score += matches * term.length;
      }

      sections.push({
        content: section,
        score,
        index: i
      });
    }

    // Sort by score (highest first) and take top sections
    const topSections = sections
      .sort((a, b) => b.score - a.score)
      .slice(0, maxSections);

    // If no sections have matches, return empty string
    if (topSections.every(section => section.score === 0)) {
      return '';
    }

    // Sort selected sections by their original position to maintain document order
    topSections.sort((a, b) => a.index - b.index);

    const result = topSections.map(section => section.content).join('\n\n');

    // Ensure we don't exceed the maximum expected length
    const maxExpectedLength = maxSections * sectionSize;
    return result.length > maxExpectedLength
      ? result.slice(0, maxExpectedLength)
      : result;
  }
}

// --- Concrete Strategy Implementations ---

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
      // Don't log warning here, as it's expected to fail if it's not a GQL endpoint
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
    if (!config.urlHost?.startsWith("http")) return null; // Needs a valid HTTP URL
    const endpointUrl = composeUrl(config.urlHost, config.urlPath);

    // Heuristic: Check path or query params typical for GraphQL
    const urlIsLikelyGraphQL = this.isLikelyGraphQL(endpointUrl, config);
    const docUrlIsLikelyGraphQL = this.isLikelyGraphQL(config.documentationUrl, config);

    if (!urlIsLikelyGraphQL && !docUrlIsLikelyGraphQL) return null;

    // Use the endpoint URL if it looks like GraphQL, otherwise use the documentation URL
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
// Special strategy solely responsible for fetching page content if needed
export class PlaywrightFetchingStrategy implements FetchingStrategy {
  private static readonly MAX_FETCHED_LINKS = server_defaults.DOCUMENTATION.MAX_FETCHED_LINKS;
  private static readonly PARALLEL_FETCH_LIMIT = server_defaults.DOCUMENTATION.PARALLEL_FETCH_LIMIT;
  private static browserInstance: playwright.Browser | null = null;

  // Keywords that indicate non-documentation links (support, legal, marketing, etc.)
  public static readonly EXCLUDED_LINK_KEYWORDS = [
    'signup', 'login', 'pricing', 'contact', 'support', 'cookie',
    'privacy', 'terms', 'legal', 'policy', 'status', 'help', 'blog',
    'careers', 'about', 'press', 'news', 'events', 'partners',
    'changelog', 'release-notes', 'updates', 'upgrade', 'register', 'cli',
    'signin', 'sign-in', 'sign-up', 'trial', 'demo', 'sales'
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
      await closedInstance.close();
    }
  }
  private async fetchPageContentWithPlaywright(urlString: string, config: DocumentationConfig, metadata: Metadata): Promise<{ content: string; links: Record<string, string>; } | null> {

    if (!urlString?.startsWith("http")) {
      return null;
    }

    let page: playwright.Page | null = null;
    let browserContext: playwright.BrowserContext | null = null;
    try {
      const browser = await PlaywrightFetchingStrategy.getBrowser();
      browserContext = await browser.newContext();

      if (config.headers) {
        await browserContext.setExtraHTTPHeaders(config.headers);
      }

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

      const links: Record<string, string> = await page.evaluate(() => {
        const links = {};
        const allLinks = document.querySelectorAll('a');
        allLinks.forEach(link => {
          try {
            const url = new URL(link?.href);
            const key = `${link.textContent} ${url.pathname}`?.toLowerCase()?.replace(/[^a-z0-9]/g, ' ').trim();
            links[key] = link?.href?.split('#')[0]?.trim();
          } catch (e) {
            // ignore
          }
        });
        return links;
      });

      await page.evaluate((textPatternMaxLength) => {
        const selectorsToRemove = [
          // Navigation & Layout
          'nav', 'header', 'footer', '.nav', '.navbar', '.header', '.footer',
          '.sidebar', '.menu', '[role="navigation"]', '[role="banner"]',
          '[role="contentinfo"]', '.site-header', '.site-footer', '#navbar',
          '.top-bar', '.bottom-bar', '.breadcrumb', '.breadcrumbs',

          // Cookie & Privacy
          '.cookie-banner', '.cookie-consent', '.cookies', '#cookie-banner',
          '.cookie-notice', '.cookie-policy', '.privacy-notice', '.gdpr',
          '.cc-banner', '.cookiebar', '.cookie-bar', '#cookieConsent',
          '.cookie-popup', '.cookie-modal', '[class*="cookie"]', '[id*="cookie"]',
          '.consent-banner', '.consent-notice', '[data-cookie]', '[data-consent]',

          // Popups & Modals
          '[role="dialog"]', '.modal', '.popup', '.overlay', '.lightbox',
          '.newsletter', '.subscribe', '.subscription', '.email-signup',
          '.exit-popup', '.exit-intent', '.promotion', '.promo-banner',
          '.notification-bar', '.alert-banner', '.announcement-bar',

          // Social & Sharing
          '.social', '.share', '.sharing', '.social-media', '.social-links',
          '.share-buttons', '.social-buttons', '[class*="share"]', '[class*="social"]',
          '.follow-us', '.connect', '.facebook', '.twitter', '.linkedin',

          // Support & Chat
          '.chat', '.chat-widget', '.chatbot', '.live-chat', '.support-chat',
          '.help-widget', '.feedback', '.feedback-widget', '[id*="chat"]',
          '.intercom', '.drift', '.zendesk', '.freshchat', '.tawk',

          // Ads & Marketing
          '.ad', '.ads', '.advertisement', '.banner-ad', '.sponsored',
          '.marketing', '.cta-banner', '.call-to-action', '[class*="ad-"]',
          '.demo-request', '.free-trial', '.pricing-banner', '.upgrade-banner',

          // Comments & Reviews
          '.comments', '.comment-section', '.reviews', '.testimonials',
          '.disqus', '#disqus_thread', '.discourse', '.rating',

          // Media & Embeds
          '.video-player', '.youtube', '.vimeo', 'iframe[src*="youtube"]',
          'iframe[src*="vimeo"]', '.embed', '.media-embed',

          // Misc UI Elements
          '.search', '.search-box', '.search-bar', '#search', '[role="search"]',
          '.language-selector', '.locale-selector', '.country-selector',
          '.back-to-top', '.scroll-to-top', '.floating-button',
          '.survey', '.survey-widget', '.nps', '.feedback-survey',
          '.banner:not(.info-banner)', '.ribbon', '.badge:not(.version-badge)',

          // Scripts & Styles
          'script', 'style', 'link[rel="stylesheet"]', 'noscript',

          // Data attributes commonly used for tracking/analytics
          '[data-ga]', '[data-gtm]', '[data-analytics]', '[data-track]',
          '[data-beacon]', '[data-segment]', '[data-heap]'
        ];

        selectorsToRemove.forEach(selector => {
          document.querySelectorAll(selector).forEach(element => {
            try {
              element.remove();
            } catch (e) {
              console.warn("Failed to remove element:", e?.message);
            }
          });
        });

        const textPatternsToRemove = [
          /accept.*cookies?/i,
          /cookie.*policy/i,
          /privacy.*policy/i,
          /subscribe.*newsletter/i,
          /sign.*up.*updates/i,
          /follow.*us/i,
          /connect.*with.*us/i,
          /share.*article/i,
          /was.*this.*helpful/i,
          /rate.*this/i,
          /leave.*feedback/i
        ];

        const allElements = document.querySelectorAll('*');
        allElements.forEach(element => {
          const text = element.textContent || '';
          if (text.length < textPatternMaxLength && textPatternsToRemove.some(pattern => pattern.test(text))) {
            try {
              element.remove();
            } catch (e) {
              console.warn("Failed to remove element by text pattern:", e?.message);
            }
          }
        });

        // Remove empty containers that might have held removed content
        document.querySelectorAll('div, section, aside').forEach(element => {
          if (element.innerHTML.trim() === '' && !element.querySelector('*')) {
            try {
              element.remove();
            } catch (e) {
              console.warn("Failed to remove empty container:", e?.message);
            }
          }
        });
      }, server_defaults.DOCUMENTATION.TEXT_PATTERN_REMOVAL_MAX_LENGTH);

      const content = await page.content();
      logMessage('info', `Successfully fetched content for ${urlString}`, metadata);
      return {
        content,
        links
      };
    } catch (error) {
      logMessage('warn', `Playwright fetch failed for ${urlString}: ${error?.message}`, metadata);
      return null;
    } finally {
      if (page) await page.close();
      if (browserContext) await browserContext.close();
    }
  }

  private async discoverSitemapUrls(baseUrl: string): Promise<string[]> {
    const candidates: string[] = [];
    try {
      const url = new URL(baseUrl);
      const origin = url.origin;
      const pathname = url.pathname;

      // First, try sitemaps specific to the documentation path
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

      // Then try common sitemap locations at the root
      candidates.push(
        `${origin}/sitemap.xml`,
        `${origin}/sitemap_index.xml`,
        `${origin}/sitemaps/sitemap.xml`,
        `${origin}/sitemap/index.xml`,
        `${origin}/docs/sitemap.xml`,
        `${origin}/api/sitemap.xml`
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

  private async collectSitemapUrls(config: DocumentationConfig, metadata: Metadata): Promise<string[]> {
    if (!config.documentationUrl) return [];

    const sitemapCandidates = await this.discoverSitemapUrls(config.documentationUrl);
    const allUrls: string[] = [];
    const processedSitemaps = new Set<string>();
    const sitemapQueue: string[] = [];

    // Parse the documentation URL to get the base path for filtering
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
    let depth = 0;

    // First, collect all URLs from sitemaps
    const allSitemapUrls: string[] = [];
    while (sitemapQueue.length > 0 && depth < MAX_SITEMAP_DEPTH) {
      const currentBatch = [...sitemapQueue];
      sitemapQueue.length = 0;
      depth++;

      for (const sitemapUrl of currentBatch) {
        if (processedSitemaps.has(sitemapUrl)) continue;
        processedSitemaps.add(sitemapUrl);

        const content = await this.fetchSitemapContent(sitemapUrl, config);
        if (!content) continue;

        const { urls, sitemaps } = this.parseSitemapContent(content, sitemapUrl);

        // Filter out URLs with excluded keywords before adding
        const filteredUrls = urls.filter(url => {
          const urlLower = url.toLowerCase();
          for (const excludedKeyword of PlaywrightFetchingStrategy.EXCLUDED_LINK_KEYWORDS) {
            if (urlLower.includes(excludedKeyword)) {
              return false;
            }
          }
          return true;
        });

        // Log sample URLs for debugging
        if (filteredUrls.length > 0) {
          logMessage('debug', `Found ${urls.length} total URLs in sitemap, ${filteredUrls.length} after filtering. First few: ${filteredUrls.slice(0, 3).join(', ')}`, metadata);
        }

        allSitemapUrls.push(...filteredUrls);

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
            const relevantKeywords = ['docs', 'api', 'reference', 'guide', 'documentation'];
            const sitemapLower = sitemapPath.toLowerCase();
            if (relevantKeywords.some(keyword => sitemapLower.includes(keyword))) {
              return true;
            }

            return false; // Skip irrelevant sitemaps
          } catch {
            return false; // Invalid URL
          }
        });

        if (relevantSitemaps.length > 0) {
          logMessage('debug', `Adding ${relevantSitemaps.length} relevant sitemaps to queue (filtered from ${sitemaps.length} total)`, metadata);
        }

        sitemapQueue.push(...relevantSitemaps);
      }
    }

    // Now apply progressive filtering
    const uniqueSitemapUrls = [...new Set(allSitemapUrls)];

    // Build a list of filter paths from most specific to least specific
    const filterPaths: string[] = [];
    const pathParts = docUrl.pathname.split('/').filter(p => p);

    // Start with the full path
    filterPaths.push(docUrl.pathname);

    // Add progressively shorter paths
    for (let i = pathParts.length - 1; i >= 0; i--) {
      const parentPath = '/' + pathParts.slice(0, i).join('/');
      if (parentPath !== '/' && !filterPaths.includes(parentPath)) {
        filterPaths.push(parentPath);
      }
    }

    // Finally add root
    filterPaths.push('/');

    // Try each filter path until we have enough URLs
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

          // Special case for root path
          if (normalizedFilterPath === '') {
            return true; // All URLs from the same domain
          }

          return normalizedUrlPath.startsWith(normalizedFilterPath);
        } catch {
          return false;
        }
      });

      if (filteredUrls.length > 0) {
        logMessage('debug', `Collected ${filteredUrls.length} URLs under ${docUrl.origin}${filterPath} from sitemap(s)`, metadata);

        // If we have enough URLs or this is the last filter, use these URLs
        if (filteredUrls.length >= PlaywrightFetchingStrategy.MAX_FETCHED_LINKS || filterPath === '/') {
          return filteredUrls;
        }
      }
    }
    return uniqueSitemapUrls;
  }

  private async fetchPagesInParallel(
    urls: string[],
    config: DocumentationConfig,
    metadata: Metadata
  ): Promise<string> {
    let combinedContent = "";
    const BATCH_SIZE = PlaywrightFetchingStrategy.PARALLEL_FETCH_LIMIT;

    for (let i = 0; i < urls.length && i < PlaywrightFetchingStrategy.MAX_FETCHED_LINKS; i += BATCH_SIZE) {
      const batch = urls.slice(i, Math.min(i + BATCH_SIZE, PlaywrightFetchingStrategy.MAX_FETCHED_LINKS));

      const batchPromises = batch.map(async (url) => {
        const result = await this.fetchPageContentWithPlaywright(url, config, metadata);
        if (!result?.content) return null;

        // Convert HTML to Markdown immediately for each page
        try {
          if (result.content.slice(0, 500).toLowerCase().includes("<html")) {
            const markdown = NodeHtmlMarkdown.translate(result.content);
            return markdown;
          } else {
            // Not HTML, return as-is
            return result.content;
          }
        } catch (translateError) {
          logMessage('warn', `Failed to convert HTML to Markdown for ${url}: ${translateError?.message}`, metadata);
          return result.content; // Fallback to raw content
        }
      });

      const results = await Promise.all(batchPromises);

      for (const content of results) {
        if (content && !combinedContent.includes(content)) {
          combinedContent += combinedContent ? `\n\n${content}` : content;
        }
      }
    }

    return combinedContent;
  }

  async tryFetch(config: DocumentationConfig, metadata: Metadata): Promise<string | null> {
    if (!config?.documentationUrl) return null;

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

      // Clear the timeout if sitemap collection succeeded
      if (timeoutHandle!) {
        clearTimeout(timeoutHandle);
      }

      if (sitemapUrls.length > 0) {
        const keywords = this.getMergedKeywords(config.keywords);
        const rankedUrls = this.rankItems(sitemapUrls, keywords) as string[];

        const topUrls = rankedUrls.slice(0, PlaywrightFetchingStrategy.MAX_FETCHED_LINKS);

        // Content fetching happens without the sitemap timeout
        const content = await this.fetchPagesInParallel(topUrls, config, metadata);

        if (content) {
          return content;
        }
      }
    } catch (error) {
      logMessage('warn', `Sitemap processing failed: ${error?.message}, falling back to legacy crawling`, metadata);
    }

    return this.legacyTryFetch(config, metadata);
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
    // Helper function to extract path from URL
    const extractPath = (url: string): string => {
      try {
        const urlObj = new URL(url);
        // Return pathname + search + hash (everything after the domain)
        return urlObj.pathname + urlObj.search + urlObj.hash;
      } catch {
        // If it's not a valid URL, return as-is (might already be a path)
        return url;
      }
    };

    // Normalize items to a common format
    const normalizedItems = items.map(item => {
      if (typeof item === 'string') {
        return { url: extractPath(item), text: '', original: item };
      } else {
        return { url: extractPath(item.href), text: item.linkText, original: item };
      }
    });

    // Filter out already fetched links if provided
    const itemsToRank = fetchedLinks
      ? normalizedItems.filter(item => !fetchedLinks.has(item.original))
      : normalizedItems;

    const scored = itemsToRank.map(item => {
      const combined = `${item.url} ${item.text}`.toLowerCase();

      // Filter out links containing excluded keywords
      for (const excludedKeyword of PlaywrightFetchingStrategy.EXCLUDED_LINK_KEYWORDS) {
        if (combined.includes(excludedKeyword)) {
          return {
            item: item.original,
            score: 0  // Set score to 0 for excluded links
          };
        }
      }

      // Count keyword matches
      let matchCount = 0;
      for (const keyword of keywords) {
        const keywordLower = keyword.toLowerCase();
        if (combined.includes(keywordLower)) {
          matchCount++;
        }
      }

      // Simple scoring: match count divided by URL length to avoid bias towards long URLs
      const score = matchCount / Math.max(item.url.length, 1);

      return {
        item: item.original,
        score: score
      };
    });

    // Filter out items with score 0 (excluded links), sort by score, and return the original items
    return scored
      .sort((a, b) => b.score - a.score)
      .map(s => s.item);
  }

  async legacyTryFetch(config: DocumentationConfig, metadata: Metadata): Promise<string | null> {
    if (!config?.documentationUrl) return null;

    const visitedUrls = new Set<string>();
    let aggregatedDocumentation = "";

    const searchKeywords = this.getMergedKeywords(config.keywords);

    // Queue of discovered links with their anchor text for ranking (text helps prioritize relevant pages)
    const linkQueue: { linkText: string, href: string; }[] = [];

    // Add documentation URL with high priority score
    linkQueue.push({
      linkText: "documentation",
      href: config.documentationUrl,
    });

    while (visitedUrls.size < PlaywrightFetchingStrategy.MAX_FETCHED_LINKS && linkQueue.length > 0) {
      const prioritizedLinks =
        linkQueue.length > 1 ?
          this.rankItems(linkQueue, searchKeywords, visitedUrls) as { linkText: string, href: string }[]
          : linkQueue;

      if (prioritizedLinks.length === 0) break;
      const nextLinkToFetch = prioritizedLinks[0];

      // Remove the selected link from the queue to free memory
      const linkIndex = linkQueue.findIndex(l => l.href === nextLinkToFetch.href);
      if (linkIndex > -1) {
        linkQueue.splice(linkIndex, 1);
      }

      try {
        const fetchedPageData = await this.fetchPageContentWithPlaywright(nextLinkToFetch.href, config, metadata);
        visitedUrls.add(nextLinkToFetch.href);

        if (!fetchedPageData?.content) continue;

        aggregatedDocumentation += aggregatedDocumentation ? `\n\n${fetchedPageData.content}` : fetchedPageData.content;

        // Add newly discovered links to the queue
        if (!fetchedPageData.links) continue;

        for (const [linkText, href] of Object.entries(fetchedPageData.links)) {
          if (this.shouldSkipLink(linkText, href, config.documentationUrl)) continue;
          if (visitedUrls.has(href) || linkQueue.some(l => l.href === href)) continue;

          linkQueue.push({ linkText, href });
        }
      } catch (error) {
        logMessage('warn', `Failed to fetch link ${nextLinkToFetch.href}: ${error?.message}`, metadata);
      }
    }
    linkQueue.length = 0;
    return aggregatedDocumentation;
  }

  private shouldSkipLink(linkText: string, href: string, documentationUrl?: string): boolean {
    // Basic content filtering
    if (!linkText) {
      return true;
    }

    // Check if link contains any excluded keywords
    const hrefLower = href.toLowerCase();
    for (const excludedKeyword of PlaywrightFetchingStrategy.EXCLUDED_LINK_KEYWORDS) {
      if (hrefLower.includes(excludedKeyword)) {
        return true;
      }
    }

    // Domain and path filtering to stay within relevant documentation scope
    if (documentationUrl) {
      try {
        const docUrl = new URL(documentationUrl);
        const linkUrl = new URL(href);

        // Skip if different hostname (domain)
        if (linkUrl.hostname !== docUrl.hostname) {
          return true;
        }

        // Get the base path from documentation URL for path filtering
        // e.g., https://discord.com/developers/docs/reference -> /developers
        const docPathParts = docUrl.pathname.split('/').filter(p => p);
        const linkPathParts = linkUrl.pathname.split('/').filter(p => p);

        // If documentation URL has a meaningful path structure, enforce it
        if (docPathParts.length >= 2) {
          // For URLs like /developers/docs/*, we want to stay under /developers
          const requiredBasePath = '/' + docPathParts.slice(0, -1).join('/');

          // Allow same path or deeper under the base path
          if (!linkUrl.pathname.startsWith(requiredBasePath)) {
            return true;
          }
        }
        // If documentation URL is at root or shallow (e.g., /docs), allow any path on same domain
      } catch (error) {
        // Invalid URL, skip it
        return true;
      }
    }

    return false;
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
      if (!schemaResponse) return null;
      return `${content ? `<DOCUMENTATION>\n${content}\n</DOCUMENTATION>\n` : ""}<DB_SCHEMA>\n${JSON.stringify(schemaResponse, null, 2)}\n</DB_SCHEMA>`;
    }
    return null;
  }
}

class OpenApiStrategy implements ProcessingStrategy {
  private extractOpenApiUrl(html: string, metadata: Metadata): string | null {
    try {
      // First try to match based on swagger settings
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
    // Needs page content fetched by PlaywrightFetchingStrategy (or null if fetch failed)
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
        // We still have the spec, return it. Don't include the original raw HTML.
        return openApiSpec;
      }
    }
    // Content is not JSON, YAML, or HTML that contained an OpenAPI spec
    return null;
  }
}

class HtmlMarkdownStrategy implements ProcessingStrategy {
  async tryProcess(content: string, config: ApiConfig, metadata: Metadata): Promise<string | null> {
    // Needs page content fetched by PlaywrightFetchingStrategy
    if (content === undefined || content === null) {
      return null;
    }
    if (typeof content !== 'string') {
      content = JSON.stringify(content, null, 2);
    }

    // Check if content is already Markdown (from individual page conversion)
    const contentStart = content.slice(0, 1000).toLowerCase();
    const hasMarkdownIndicators = contentStart.includes('##') || contentStart.includes('###') ||
      contentStart.includes('```') || contentStart.includes('- ') ||
      contentStart.includes('* ');
    const hasHtmlIndicators = contentStart.includes("<html") || contentStart.includes("<!doctype");

    if (hasMarkdownIndicators && !hasHtmlIndicators) {
      return content;
    }

    // Only apply if content looks like HTML
    if (!hasHtmlIndicators) {
      return null;
    }

    try {
      const markdown = NodeHtmlMarkdown.translate(content);
      logMessage('info', "Successfully converted HTML to Markdown.", metadata);
      return markdown;
    } catch (translateError) {
      return null; // Failed translation, let RawPageContentStrategy handle it
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
    return null; // No content was fetched or available
  }
}