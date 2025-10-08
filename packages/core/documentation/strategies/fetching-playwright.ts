/**
 * Playwright Web Crawling Strategy
 * 
 * Uses headless browser to crawl documentation sites.
 * - First tries sitemap-based discovery for comprehensive coverage
 * - Falls back to iterative link crawling if sitemap fails
 * - Filters out non-documentation pages (login, pricing, etc.)
 */

import playwright from '@playwright/test';
import { Metadata } from "@superglue/shared";
import axios from "axios";
import { server_defaults } from '../../default.js';
import { logMessage } from "../../utils/logs.js";
import { filterDocumentationUrls } from '../documentation-utils.js';
import { DocumentationConfig, DocumentationFetchingStrategy } from '../types.js';

// Similarity functions for deduplication
function diceCoefficient(str1: string, str2: string): number {
  const words1 = new Set(str1.toLowerCase().split(/\s+/));
  const words2 = new Set(str2.toLowerCase().split(/\s+/));
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  
  return (2 * intersection.size) / (words1.size + words2.size);
}

function jaccardSimilarity(str1: string, str2: string): number {
  const words1 = new Set(str1.toLowerCase().split(/\s+/));
  const words2 = new Set(str2.toLowerCase().split(/\s+/));
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

export class PlaywrightFetchingStrategy implements DocumentationFetchingStrategy {
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
    '/de/', '/it/', '/fr/', '/nl/', '/es/', '/pt/', '/pl/', '/ru/', '/ja/', '/zh/',
    '/ko/', '/zh-CN/', '/zh-TW/', '/id/'
  ];

  private static async getBrowser(): Promise<playwright.Browser> {
    if (!PlaywrightFetchingStrategy.browserInstance) {
      PlaywrightFetchingStrategy.browserInstance = await playwright.chromium.launch({
        headless: true,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process',
        ]
      });
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
      this.browserContext = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        locale: 'en-US',
        timezoneId: 'America/New_York',
        extraHTTPHeaders: config.headers || {}
      });
    }
    return this.browserContext;
  }

  private async cleanupContext(): Promise<void> {
    if (this.browserContext) {
      try {
        await this.browserContext.close();
      } catch (e) {
      }
      this.browserContext = null;
    }
  }

  private async fetchPageContentWithPlaywright(urlString: string, config: DocumentationConfig, metadata: Metadata): Promise<{ content: string; textContent: string; links: Record<string, string>; } | null> {
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
      
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' });
        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
        Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      });
      
      await page.goto(url.toString(), { timeout: server_defaults.DOCUMENTATION.TIMEOUTS.PLAYWRIGHT });
      await page.waitForLoadState('domcontentloaded', { timeout: server_defaults.DOCUMENTATION.TIMEOUTS.PLAYWRIGHT });
      await page.waitForTimeout(1000);

      const result = await page.evaluate(() => {
        const selectorsToRemove = [
          'img, video, svg, canvas, iframe, picture, source, audio, embed, object',
          '[role="banner"], [role="dialog"], [role="contentinfo"], [role="complementary"]',
          '.cookie-banner, .cookie-consent, .cookies, .gdpr, .privacy-notice',
          'nav, header, footer, aside, .sidebar, .menu, .navbar, .toolbar',
          '.social, .share, .chat, .feedback, .comments, .disqus',
          '.intercom, .drift, .zendesk, .freshchat, .tawk',
          '.ads, .advertisement, .banner, .promo, .sponsored',
          'script, style, noscript, link[rel="stylesheet"]',
          '[data-ga], [data-gtm], [data-analytics], [data-track]',
          '.breadcrumb, .pagination, .pager',
          '.related, .recommended, .also-see',
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

        const textContent = document.body?.innerText || '';

        return { html, textContent, links };
      });

      if (!result || !result.html) {
        logMessage('warn', `Failed to extract content from ${urlString}`, metadata);
        return null;
      }

      let { html, textContent, links } = result;

      if (html.length > server_defaults.DOCUMENTATION.MAX_PAGE_SIZE_BYTES) {
        logMessage('warn', `Page ${urlString} exceeds size limit after cleanup (${Math.round(html.length / 1024 / 1024)}MB > ${Math.round(server_defaults.DOCUMENTATION.MAX_PAGE_SIZE_BYTES / 1024 / 1024)}MB), truncating`, metadata);
        html = html.substring(0, server_defaults.DOCUMENTATION.MAX_PAGE_SIZE_BYTES) + '\n<!-- Content truncated due to size limit -->';
      }

      logMessage('debug', `Successfully fetched content for ${urlString}`, metadata);
      return {
        content: html,
        textContent,
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
        candidates.push(`${baseUrl}/sitemap.xml`);

        const pathParts = pathname.split('/').filter(p => p);
        for (let i = pathParts.length; i > 0; i--) {
          const parentPath = '/' + pathParts.slice(0, i).join('/');
          candidates.push(`${origin}${parentPath}/sitemap.xml`);
        }
      }

      candidates.push(
        `${origin}/sitemap.xml`,
        `${origin}/sitemap_index.xml`
      );

    } catch {
    }
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
            }
          }
        }
      }
    } catch {
    }

    return { urls, sitemaps };
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
      if (processedSitemaps.size >= MAX_TOTAL_SITEMAPS) {
        logMessage('debug', `Reached global sitemap limit (${MAX_TOTAL_SITEMAPS}), stopping sitemap discovery`, metadata);
        break;
      }

      const currentBatch = [...sitemapQueue];
      sitemapQueue.length = 0;
      depth++;

      let sitemapsToProcess = currentBatch;
      if (currentBatch.length > MAX_SITEMAPS_PER_DEPTH) {
        const keywords = this.getMergedKeywords(config.keywords);
        sitemapsToProcess = this.rankItems(currentBatch, keywords) as string[];
        sitemapsToProcess = sitemapsToProcess.slice(0, MAX_SITEMAPS_PER_DEPTH);
        logMessage('debug', `Ranked and limited sitemaps at depth ${depth} from ${currentBatch.length} to ${sitemapsToProcess.length}`, metadata);
      }

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
        const filteredUrls = filterDocumentationUrls(urls, PlaywrightFetchingStrategy.EXCLUDED_LINK_KEYWORDS);

        if (filteredUrls.length > 0) {
          logMessage('debug', `Found ${urls.length} total URLs in sitemap, ${filteredUrls.length} after filtering. First few: ${filteredUrls.slice(0, 3).join(', ')}`, metadata);
        }

        allSitemapUrls.push(...filteredUrls);

        if (processedSitemaps.size >= MAX_TOTAL_SITEMAPS) {
          continue;
        }

        const relevantSitemaps = sitemaps.filter(s => {
          if (processedSitemaps.has(s)) return false;

          try {
            const sitemapUrl = new URL(s);

            if (sitemapUrl.hostname !== docUrl.hostname) {
              return false;
            }

            const docPath = docUrl.pathname.replace(/\/$/, '');
            const sitemapPath = sitemapUrl.pathname.replace(/\/$/, '');

            if (sitemapPath === '/sitemap.xml' || sitemapPath === '/sitemap_index.xml') {
              return true;
            }

            if (docPath && docPath !== '/') {
              const docParts = docPath.split('/').filter(p => p);
              const sitemapParts = sitemapPath.split('/').filter(p => p);

              for (let i = 0; i < Math.min(docParts.length, sitemapParts.length - 1); i++) {
                if (docParts[i] === sitemapParts[i]) {
                  return true;
                }
              }
            }

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

          if (urlObj.hostname !== docUrl.hostname) {
            return false;
          }

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
    const BATCH_SIZE = PlaywrightFetchingStrategy.PARALLEL_FETCH_LIMIT;
    const MAX_TOTAL_SIZE = server_defaults.DOCUMENTATION.MAX_TOTAL_CONTENT_SIZE;
    const pageResults: Array<{ url: string; html: string; textContent: string }> = [];
    let fetchedCount = 0;

    // Fetch all pages in batches
    for (let i = 0; i < urls.length && fetchedCount < PlaywrightFetchingStrategy.MAX_FETCHED_LINKS; i += BATCH_SIZE) {
      const remainingSlots = PlaywrightFetchingStrategy.MAX_FETCHED_LINKS - fetchedCount;
      const batch = urls.slice(i, Math.min(i + BATCH_SIZE, i + remainingSlots));

      const batchPromises = batch.map(async (url) => {
        const result = await this.fetchPageContentWithPlaywright(url, config, metadata);
        if (!result?.content) return null;
        return { url, html: result.content, textContent: result.textContent };
      });

      const results = await Promise.all(batchPromises);

      for (const result of results) {
        if (!result || !result.html) continue;
        pageResults.push(result);
        fetchedCount++;
      }
    }

    // Deduplicate based on similarity
    const deduplicatedPages: Array<{ url: string; html: string; textContent: string }> = [];
    
    if (pageResults.length > 0) {
      deduplicatedPages.push(pageResults[0]);
    }

    for (let i = 1; i < pageResults.length; i++) {
      const currentPage = pageResults[i];
      
      // Always include pages with short text content
      if (currentPage.textContent.length <= 500) {
        deduplicatedPages.push(currentPage);
        continue;
      }

      // Check similarity against all pages already in the deduplicated list
      let isSimilar = false;
      for (const existingPage of deduplicatedPages) {
        const dice = diceCoefficient(currentPage.textContent, existingPage.textContent);
        const jaccard = jaccardSimilarity(currentPage.textContent, existingPage.textContent);
        const avgSimilarity = (dice + jaccard) / 2;

        if (avgSimilarity > 0.80) {
          isSimilar = true;
          logMessage('debug', `Skipping similar page '${currentPage.url}' because it is ${(avgSimilarity * 100).toFixed(1)}% similar to '${existingPage.url}'`, metadata);
          break;
        }
      }

      if (!isSimilar) {
        deduplicatedPages.push(currentPage);
      }
    }

    // Build final combined content from deduplicated pages
    let combinedContent = "";
    let totalSize = 0;

    for (const page of deduplicatedPages) {
      const contentSize = Buffer.byteLength(page.html, 'utf8');

      if (totalSize + contentSize > MAX_TOTAL_SIZE) {
        logMessage('debug', `Reached size budget (${Math.round(totalSize / 1024 / 1024)}MB), skipping remaining pages`, metadata);
        break;
      }

      combinedContent += combinedContent ? `\n\n${page.html}` : page.html;
      totalSize += contentSize;
    }
    return combinedContent;
  }

  async tryFetch(config: DocumentationConfig, metadata: Metadata): Promise<string | null> {
    if (!config?.documentationUrl) return null;

    try {
      try {
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
      const prioritizedLinks = this.rankItems(linkQueue, searchKeywords, visitedUrls) as { linkText: string, href: string }[];
      if (prioritizedLinks.length === 0) break;

      const nextLink = prioritizedLinks[0];
      linkQueue.splice(linkQueue.findIndex(l => l.href === nextLink.href), 1);

      try {
        const pageData = await this.fetchPageContentWithPlaywright(nextLink.href, config, metadata);
        visitedUrls.add(nextLink.href);

        if (pageData?.content) {
          aggregatedContent += aggregatedContent ? `\n\n${pageData.content}` : pageData.content;

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
