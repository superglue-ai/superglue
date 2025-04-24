import axios from "axios";
import { getIntrospectionQuery } from "graphql";
import { NodeHtmlMarkdown } from "node-html-markdown";
import playwright from '@playwright/test';
import { composeUrl } from "./tools.js";
import { LanguageModel } from "../llm/llm.js";
import { ApiConfig, ApiInput } from "@superglue/shared";

// Strategy Interface
interface FetchingStrategy {
  tryFetch(config: ApiInput): Promise<string | null>;
}
interface ProcessingStrategy {
  tryProcess(rawResult: string, config: ApiInput): Promise<string | null>;
}

export class Documentation {
  private static MAX_LENGTH = Math.min(LanguageModel.contextLength - 50000, 200000);

  // Configuration stored per instance
  private readonly config: ApiInput;

  private lastResult: string | null = null;

  constructor(config: ApiInput) {
    this.config = config;
  }

  // --- Post Processing ---

  private postProcess(documentation: string): string {
    // (Renamed from postProcessLargeDoc - same logic)
    if (documentation.length <= Documentation.MAX_LENGTH) {
      return documentation;
    }
    const CONTEXT_SEPARATOR = "\n\n";
    const MIN_SEARCH_TERM_LENGTH = 3;

    const docLower = documentation.toLowerCase();
    const positions: number[] = [];

    const endpointPath = this.config.urlPath || '';
    let searchTerms = endpointPath?.toLowerCase()?.split(/[\/=&]/)
      .map(term => term.trim())
      .filter(term => term.length >= MIN_SEARCH_TERM_LENGTH);

    for(const searchTerm of searchTerms) {
      let pos = docLower.indexOf(searchTerm);
      while (pos !== -1) {
        positions.push(pos);
        pos = docLower.indexOf(searchTerm, pos + 1);
      }
    }

    let authPosSecuritySchemes = docLower.indexOf("securityschemes");
    if (authPosSecuritySchemes !== -1) positions.push(authPosSecuritySchemes);
    let authPosAuthorization = docLower.indexOf("authorization");
    if (authPosAuthorization !== -1) positions.push(authPosAuthorization);

    if (positions.length === 0) {
      return documentation.slice(0, Documentation.MAX_LENGTH);
    }
    positions.sort((a, b) => a - b);

    const firstHalfLength = Math.floor(Documentation.MAX_LENGTH * 0.4);
    const secondHalfLength = Documentation.MAX_LENGTH - firstHalfLength;

    // Calculate chunk size for the second half, ensuring it's an integer
    const chunkSize = Math.floor(secondHalfLength / positions.length);
    if (chunkSize <= 0) {
      // Fallback if MAX_LENGTH is too small or too many positions
      return documentation.slice(0, Documentation.MAX_LENGTH);
    }

    // Extract the first half
    const firstHalf = documentation.slice(0, firstHalfLength);

    // Extract chunks for the second half, avoiding overlaps and out-of-bounds
    const chunks: string[] = [];
    let lastChunkEnd = firstHalfLength; // Start checking for overlaps after the first half

    for (const pos of positions) {
      // Calculate start and end, trying to center the chunk around the position
      const halfChunk = Math.floor(chunkSize / 2);
      let start = Math.max(0, pos - halfChunk);
      let end = start + chunkSize;

      // Adjust if chunk goes beyond document length
      if (end > documentation.length) {
        end = documentation.length;
        start = Math.max(0, end - chunkSize); // Readjust start if possible
      }

      // Skip if the chunk is entirely contained within the first half or previous chunks
      if (start >= end || end <= lastChunkEnd) {
        continue;
      }

      // Adjust start if it overlaps with the last chunk
      start = Math.max(start, lastChunkEnd);

      // Only add if the adjusted chunk has content
      if (start < end) {
        chunks.push(documentation.slice(start, end));
        lastChunkEnd = end;
      }
    }

    // Combine the first half and the extracted chunks
    let finalDoc = firstHalf + CONTEXT_SEPARATOR + chunks.join(CONTEXT_SEPARATOR);

    // Final trim if we somehow exceeded length due to rounding/logic or separators
    if (finalDoc.length > Documentation.MAX_LENGTH) {
      finalDoc = finalDoc.slice(0, Documentation.MAX_LENGTH);
    }

    return finalDoc;
  }


  // --- Main Method using Strategies ---
  async fetch(): Promise<string> {
    if (this.lastResult) {
      return this.postProcess(this.lastResult);
    }

    const fetchingStrategies: FetchingStrategy[] = [
      new RawContentStrategy(),
      new GraphQLStrategy(),
      new PlaywrightFetchingStrategy()
    ];

    const processingStrategies: ProcessingStrategy[] = [
      new OpenApiStrategy(),
      new HtmlMarkdownStrategy(),
      new RawPageContentStrategy()
    ];

    let rawResult: string | null = null;

    for (const strategy of fetchingStrategies) {
      const result = await strategy.tryFetch(this.config);
      if (result == null || result.length === 0) {
        continue;
      }
      rawResult = result;
      break;
    }

    if(!rawResult) {
      return "";  
    }

    for (const strategy of processingStrategies) {
      const result = await strategy.tryProcess(rawResult, this.config);
      if (result == null || result.length === 0) {
        continue;
      }
      this.lastResult = this.postProcess(result);
      return this.lastResult;
    }

    return "";
  }
}

// --- Concrete Strategy Implementations ---

class RawContentStrategy implements FetchingStrategy {
  async tryFetch(config: ApiInput): Promise<string | null> {
    if (!config.documentationUrl?.startsWith("http")) {
      // It's raw content passed directly in the URL field
      if(config.documentationUrl && config.documentationUrl.length > 0) { 
        return config.documentationUrl;
      }
      return null;
    }
    return null; // Not applicable
  }
}

class GraphQLStrategy implements FetchingStrategy {
  private async fetchGraphQLSchema(url: string, config: ApiInput): Promise<any | null> {
    const introspectionQuery = getIntrospectionQuery();

    try {
      const response = await axios.post(
        url,
        {
          query: introspectionQuery,
          operationName: 'IntrospectionQuery'
        },
        { headers: config.headers, params: config.queryParams }
      );

      if (response.data.errors) {
        console.warn(`GraphQL Introspection failed for ${url}: ${response.data.errors[0].message}`);
        return null;
      }
      return response.data?.data?.__schema ?? null;
    } catch (error) {
      // Don't log warning here, as it's expected to fail if it's not a GQL endpoint
      return null;
    }
  }
  private isLikelyGraphQL(url: string, config: ApiInput): boolean {
    if(!url) return false;
    return url?.includes('graphql') ||
           Object.values({...config.queryParams, ...config.headers})
           .some(val => typeof val === 'string' && val.includes('IntrospectionQuery'));
  }
  async tryFetch(config: ApiInput): Promise<string | null> {
    if (!config.urlHost.startsWith("http")) return null; // Needs a valid HTTP URL
    const endpointUrl = composeUrl(config.urlHost, config.urlPath);

    // Heuristic: Check path or query params typical for GraphQL
    const urlIsLikelyGraphQL = this.isLikelyGraphQL(endpointUrl, config);
    const docUrlIsLikelyGraphQL = this.isLikelyGraphQL(config.documentationUrl, config);

    if (!urlIsLikelyGraphQL && !docUrlIsLikelyGraphQL) return null;

    // Use the endpoint URL if it looks like GraphQL, otherwise use the documentation URL
    const url = urlIsLikelyGraphQL ? endpointUrl : config.documentationUrl;

    const schema = await this.fetchGraphQLSchema(url, config);
    if (schema) {
        return JSON.stringify(schema);
    }
    // Log if it looked like GQL but failed (fetchGraphQLSchema logs internal errors)
    console.warn(`URL ${config.documentationUrl} looked like GraphQL but introspection failed or returned no schema.`);
    return null;
  }
}

// Special strategy solely responsible for fetching page content if needed
export class PlaywrightFetchingStrategy implements FetchingStrategy {
    // --- Static Helpers (accessible by strategies) ---
    private static browserInstance: playwright.Browser | null = null;

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
  private async fetchPageContentWithPlaywright(config: ApiInput): Promise<string | null> {

    if (!config.documentationUrl?.startsWith("http")) {
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

      const url = new URL(config.documentationUrl);
      if (config.queryParams) {
        Object.entries(config.queryParams).forEach(([key, value]) => {
          url.searchParams.append(key, value);
        });
      }

      page = await browserContext.newPage();
      await page.goto(url.toString());
      // Wait for network idle might be better for SPAs, but has risks of timeout
      // Let's stick with domcontentloaded + short timeout
      await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
      await page.waitForTimeout(1000); // Allow JS execution

      await page.evaluate(() => {
        const selectorsToRemove = [
          'nav', 'header', 'footer', '.nav', '.navbar', '.header', '.footer',
          '.cookie-banner', '.cookie-consent', '.cookies', '#cookie-banner',
          '.cookie-notice', '.sidebar', '.menu', '[role="navigation"]',
          '[role="banner"]', '[role="contentinfo"]', 'script', 'style', // Also remove scripts/styles
        ];
        selectorsToRemove.forEach(selector => {
          document.querySelectorAll(selector).forEach(element => {
             try { element.remove(); }
             catch(e) { console.warn("Failed to remove element:", e?.message) }
          });
        });
      });

      const content = await page.content();
      return content;
    } catch (error) {
      console.warn(`Playwright fetch failed for ${config.documentationUrl}:`, error?.message);
      return null;
    } finally {
       if (page) await page.close();
       if (browserContext) await browserContext.close();
    }
  }

  async tryFetch(config: ApiInput): Promise<string | null> {
    // Only fetch if it's an HTTP URL and content hasn't been fetched yet
    const content = await this.fetchPageContentWithPlaywright(config);
    if(!content) return null;
    return content;
  }
}

class OpenApiStrategy implements ProcessingStrategy {
  private extractOpenApiUrl(html: string): string | null {
    try {
      // First try to match based on swagger settings
      const settingsMatch = html.match(/<script[^>]*id=["']swagger-settings["'][^>]*>([\s\S]*?)<\/script>/i);
      if (settingsMatch && settingsMatch[1]) {
        const settingsContent = settingsMatch[1].trim();
        try {
          const settings = JSON.parse(settingsContent);
          if (settings.url && typeof settings.url === 'string') {
            return settings.url;
          }
        } catch (e) {
           console.warn('Failed to parse swagger settings JSON:', e?.message);
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
      console.warn('Failed to extract OpenAPI URL:', error?.message);
      return null;
    }
  }
  private async fetchOpenApiFromUrl(openApiUrl: string, config: ApiInput): Promise<string | null> {
    try {
      if(openApiUrl.startsWith("/")) {
        const baseUrl = config.documentationUrl ? new URL(config.documentationUrl).host : config.urlHost;
        openApiUrl = composeUrl(baseUrl, openApiUrl);
      }
      const openApiResponse = await axios.get(openApiUrl, { headers: config.headers });
      const openApiData = openApiResponse.data;

      if (!openApiData) return null;

      if (typeof openApiData === 'object' && openApiData !== null) {
        if (openApiData.openapi || openApiData.swagger) {
          return JSON.stringify(openApiData);
        } else {
          console.warn(`Fetched object from ${openApiUrl} but doesn't look like OpenAPI/Swagger.`);
          return JSON.stringify(openApiData);
        }
      } else if (typeof openApiData === 'string') {
         try {
           const parsed = JSON.parse(openApiData);
           if (parsed && (parsed.openapi || parsed.swagger)) {
             return openApiData; // Valid JSON spec
           }
         } catch (e) { /* ignore */ }
         const trimmedData = openApiData.trim();
         if (trimmedData.startsWith('openapi:') || trimmedData.startsWith('swagger:')) {
            return openApiData; // Likely YAML spec
         }
         console.warn(`Content from ${openApiUrl} is a string but not identifiable as JSON or YAML OpenAPI/Swagger.`);
         return openApiData; // Return raw string as fallback
      }

      console.warn(`Unexpected data type received from ${openApiUrl}: ${typeof openApiData}`);
      return null;

    } catch (error) {
      console.warn(`Failed to fetch or process OpenAPI spec from ${openApiUrl}:`, error?.message);
      return null;
    }
  }

  async tryProcess(content: string, config: ApiConfig): Promise<string | null> {
    // Needs page content fetched by PlaywrightFetchingStrategy (or null if fetch failed)
    if (content === undefined || content === null) {
      return null;
    }
    const trimmedContent = content.trim();
    const isJson = trimmedContent.startsWith('{') && trimmedContent.endsWith('}');
    const isYaml = trimmedContent.startsWith('openapi:') || trimmedContent.startsWith('swagger:');
    const isHtml = trimmedContent.slice(0, 500).toLowerCase().includes("<html");
    if (isJson) {
       try {
          const parsed = JSON.parse(trimmedContent);
          if (parsed && (parsed.openapi || parsed.swagger)) {
             return trimmedContent; // Content is a valid JSON spec
          }
       } catch(e) { /* ignore parse error */ }
    } 
    if (isYaml) {
       // Basic check is enough for YAML start
       return trimmedContent; // Content is likely a YAML spec
    }
    if(isHtml) {
      const openApiUrl = this.extractOpenApiUrl(content);
      if(!openApiUrl) return null;

      const openApiSpec = await this.fetchOpenApiFromUrl(openApiUrl, config);
      if(!openApiSpec) return null;

      const markdownContent = await new HtmlMarkdownStrategy().tryProcess(content, config);
      return `${openApiSpec}\n\n${markdownContent === null ? content : markdownContent}`;
    }
    return null;
  }
}

class HtmlMarkdownStrategy implements ProcessingStrategy {
  async tryProcess(content: string, config: ApiConfig): Promise<string | null> {
     // Needs page content fetched by PlaywrightFetchingStrategy
     if (content === undefined || content === null) {
       return null;
     }
     // Only apply if content looks like HTML
     if (!content.slice(0, 500).toLowerCase().includes("<html")) {
        return null;
     }

     try {
       // Use NodeHtmlMarkdown, assuming it handles potential errors
       return NodeHtmlMarkdown.translate(content);
     } catch (translateError) {
       console.warn("Failed to translate HTML to Markdown:", translateError?.message);
       return null; // Failed translation, let RawPageContentStrategy handle it
     }
  }
}

class RawPageContentStrategy implements ProcessingStrategy {
  async tryProcess(content: string, config: ApiConfig): Promise<string | null> {
    // This is the final fallback if content was fetched but not processed by other strategies
    if (content) {
      return content;
    }
    return null; // No content was fetched or available
  }
}