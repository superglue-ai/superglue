import axios from "axios";
import { getIntrospectionQuery } from "graphql";
import { NodeHtmlMarkdown } from "node-html-markdown";
import playwright from '@playwright/test';
import { composeUrl } from "./tools.js";
import { LanguageModel } from "../llm/llm.js";
import { ApiConfig, Metadata } from "@superglue/shared";
import { logMessage } from "./logs.js";

// Strategy Interface
interface FetchingStrategy {
  tryFetch(config: DocumentationConfig, metadata: Metadata): Promise<string | null>;
}
interface ProcessingStrategy {
  tryProcess(rawResult: string, config: DocumentationConfig, metadata: Metadata): Promise<string | null>;
}

export interface DocumentationConfig {
  urlHost: string;
  instruction?: string;
  documentationUrl?: string;
  urlPath?: string;
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
}

export class Documentation {
  private static MAX_LENGTH = Math.min(LanguageModel.contextLength - 50000, 200000);

  // Configuration stored per instance
  public config: DocumentationConfig;
  private readonly metadata: Metadata;

  private lastResult: string | null = null;

  constructor(config: DocumentationConfig, metadata: Metadata) {
    this.config = config;
    this.metadata = metadata;
  }

  // --- Post Processing ---

  private postProcess(documentation: string, instruction: string): string {
    // (Renamed from postProcessLargeDoc - same logic)
    if (documentation.length <= Documentation.MAX_LENGTH) {
      return documentation;
    }
    const CONTEXT_SEPARATOR = "\n\n";
    const MIN_SEARCH_TERM_LENGTH = 4;

    const docLower = documentation.toLowerCase();
    const positions: number[] = [];

    let searchTerms = instruction?.toLowerCase()?.split(/[^a-z0-9]/)
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
  async fetch(instruction: string = ""): Promise<string> {
    if (this.lastResult) {
      return this.postProcess(this.lastResult, instruction);
    }

    const fetchingStrategies: FetchingStrategy[] = [
      new RawContentStrategy(),
      new GraphQLStrategy(),
      new PlaywrightFetchingStrategy(),
      new AxiosFetchingStrategy()
    ];

    const processingStrategies: ProcessingStrategy[] = [
      new OpenApiStrategy(),
      new HtmlMarkdownStrategy(),
      new RawPageContentStrategy()
    ];

    let rawResult: string | null = null;

    for (const strategy of fetchingStrategies) {
      const result = await strategy.tryFetch(this.config, this.metadata);
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
      const result = await strategy.tryProcess(rawResult, this.config, this.metadata);
      if (result == null || result.length === 0) {
        continue;
      }
      this.lastResult = this.postProcess(result, instruction);
      return this.lastResult;
    }

    logMessage('warn', "No processing strategy could handle the fetched documentation.", this.metadata);
    return "";
  }
}

// --- Concrete Strategy Implementations ---

class RawContentStrategy implements FetchingStrategy {
  async tryFetch(config: ApiConfig, metadata: Metadata): Promise<string | null> {
    if (!config.documentationUrl?.startsWith("http")) {
      // It's raw content passed directly in the URL field
      if(config.documentationUrl && config.documentationUrl.length > 0) {
        logMessage('info', "Using raw content provided directly as documentation.", metadata);
        return config.documentationUrl;
      }
      return null;
    }
    return null; // Not applicable
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
        { headers: config.headers, params: config.queryParams }
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
    if(!url) return false;
    return url?.includes('graphql') ||
           Object.values({...config.queryParams, ...config.headers})
           .some(val => typeof val === 'string' && val.includes('IntrospectionQuery'));
  }
  async tryFetch(config: ApiConfig, metadata: Metadata): Promise<string | null> {
    if (!config.urlHost.startsWith("http")) return null; // Needs a valid HTTP URL
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
  async tryFetch(config: ApiConfig, metadata: Metadata): Promise<string | null> {
    if (!config.documentationUrl?.startsWith("http")) return null;

    try {
      const url = new URL(config.documentationUrl);
      if (config.queryParams) {
        Object.entries(config.queryParams).forEach(([key, value]) => {
          url.searchParams.append(key, value);
        });
      }
      
      const response = await axios.get(url.toString(), { headers: config.headers });
      logMessage('info', `Successfully fetched content with axios for ${config.documentationUrl}`, metadata);
      return response.data;
    } catch (error) {
      logMessage('warn', `Axios fetch failed for ${config.documentationUrl}: ${error?.message}`, metadata);
      return null;
    }
  }
}
// Special strategy solely responsible for fetching page content if needed
export class PlaywrightFetchingStrategy implements FetchingStrategy {
    // --- Static Helpers (accessible by strategies) ---
    private static browserInstance: playwright.Browser | null = null;

    private static async getBrowser(): Promise<playwright.Browser> {
      if (!PlaywrightFetchingStrategy.browserInstance) {
        // Consider adding metadata if logging launch errors becomes necessary
        PlaywrightFetchingStrategy.browserInstance = await playwright.chromium.launch();
      }
      return PlaywrightFetchingStrategy.browserInstance;
    }
  
    static async closeBrowser(): Promise<void> {
      if (PlaywrightFetchingStrategy.browserInstance) {
        const closedInstance = PlaywrightFetchingStrategy.browserInstance;
        PlaywrightFetchingStrategy.browserInstance = null;
        // Consider adding metadata if logging close errors becomes necessary
        await closedInstance.close();
      }
    }
  private async fetchPageContentWithPlaywright(urlString: string, config: ApiConfig, metadata: Metadata): Promise<{ content: string; links: Record<string, string> } | null> {

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
          url.searchParams.append(key, value);
        });
      }

      page = await browserContext.newPage();
      await page.goto(url.toString());
      // Wait for network idle might be better for SPAs, but has risks of timeout
      // Let's stick with domcontentloaded + short timeout
      await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
      await page.waitForTimeout(1000); // Allow JS execution

      const links: Record<string, string> = await page.evaluate(() => {
        const links = {};
        const allLinks = document.querySelectorAll('a');
        allLinks.forEach(link => {
          const key = link.textContent?.toLowerCase().trim().replace(/[^a-z0-9]/g, ' ');
          links[key] = link.href;
        });
        return links;
      });

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
             catch(e) {
               // Cannot use logMessage directly here as it's inside page.evaluate
               console.warn("Failed to remove element:", e?.message);
             }
          });
        });
      });

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

  async tryFetch(config: ApiConfig, metadata: Metadata): Promise<string | null> {
    // Only fetch if it's an HTTP URL and content hasn't been fetched yet
    // Pass metadata
    const docResult = await this.fetchPageContentWithPlaywright(config?.documentationUrl, config, metadata);
    let fetchedLinks = new Set<string>();
    if(!config.instruction && docResult?.content) {
      return docResult?.content;
    }
    const instructions = ["auth", "authentication", "introduction", "authorization", "started"];
    instructions.push(...(config.instruction?.toLowerCase().split(/[^a-z0-9]/g).filter(i => i.length > 3) || []));

    if(!docResult || !docResult.links) return null;

    const rankedLinks: { linkText: string, href: string, matchCount: number }[] = [];

    for(const [linkText, href] of Object.entries(docResult.links)) {
      const keywords = linkText.split(" ").filter(i => i.length > 3);
      const matchCount = keywords.filter(k => instructions.some(instr => k.includes(instr) || instr.includes(k))).length;
      rankedLinks.push({ linkText, href, matchCount });
    }

    // Sort links by match count in descending order
    rankedLinks.sort((a, b) => b.matchCount - a.matchCount);

    for(const rankedLink of rankedLinks) {
      if(fetchedLinks.size > 5) break;
      if(fetchedLinks.has(rankedLink.href)) continue;
      const linkResult = await this.fetchPageContentWithPlaywright(rankedLink.href, config, metadata);
      if(linkResult && linkResult.content) { // Ensure content exists
        docResult.content += `\n\n${linkResult.content}`;
        fetchedLinks.add(rankedLink.href);
      }
    }
    return docResult.content;
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
          const settings = JSON.parse(settingsContent);
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
      if(openApiUrl.startsWith("/")) {
        const baseUrl = config.documentationUrl ? new URL(config.documentationUrl).origin : config.urlHost;
        absoluteOpenApiUrl = composeUrl(baseUrl, openApiUrl);
      }
      const openApiResponse = await axios.get(absoluteOpenApiUrl, { headers: config.headers });
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
           const parsed = JSON.parse(openApiData);
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
    const trimmedContent = content.trim();
    const isJson = trimmedContent.startsWith('{') && trimmedContent.endsWith('}');
    const isYaml = trimmedContent.startsWith('openapi:') || trimmedContent.startsWith('swagger:');
    const isHtml = trimmedContent.slice(0, 500).toLowerCase().includes("<html");
    if (isJson) {
       try {
          const parsed = JSON.parse(trimmedContent);
          if (parsed && (parsed.openapi || parsed.swagger)) {
             logMessage('info', "Provided content is already a valid OpenAPI/Swagger JSON spec.", metadata);
             return trimmedContent; // Content is a valid JSON spec
          }
       } catch(e) { /* ignore parse error */ }
    } 
    if (isYaml) {
       logMessage('info', "Provided content appears to be an OpenAPI/Swagger YAML spec.", metadata);
       // Basic check is enough for YAML start
       return trimmedContent; // Content is likely a YAML spec
    }
    if(isHtml) {
      const openApiUrl = this.extractOpenApiUrl(content, metadata);
      if(!openApiUrl) {
        return null;
      }

      const openApiSpec = await this.fetchOpenApiFromUrl(openApiUrl, config, metadata);
      if(!openApiSpec) {
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
     // Only apply if content looks like HTML
     if (!content.slice(0, 500).toLowerCase().includes("<html")) {
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
      return content;
    }
    return null; // No content was fetched or available
  }
}