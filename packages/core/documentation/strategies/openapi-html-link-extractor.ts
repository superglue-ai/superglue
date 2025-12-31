import { ServiceMetadata } from "@superglue/shared";
import { OpenApiFetchingStrategy } from "../types.js";
import { logMessage } from "../../utils/logs.js";
import { extractOpenApiUrlFromHtml, fetchMultipleOpenApiSpecs } from "../documentation-utils.js";

/**
 * Strategy for extracting OpenAPI spec URLs from HTML content
 *
 * This strategy analyzes raw HTML content (from previous fetching strategies)
 * to find potential OpenAPI specification URLs that may not have been detected
 * by other methods.
 */
export class HtmlLinkExtractorStrategy implements OpenApiFetchingStrategy {
  private rawHtmlContent: string | null;

  constructor(rawHtmlContent: string | null = null) {
    this.rawHtmlContent = rawHtmlContent;
  }

  async tryFetch(data: any, sourceUrl: string, metadata: ServiceMetadata): Promise<string | null> {
    const content = this.rawHtmlContent;

    if (!content) {
      logMessage("debug", "HtmlLinkExtractorStrategy: No raw HTML content provided", metadata);
      return null;
    }

    // Convert to string if needed
    const contentString = typeof content === "string" ? content : JSON.stringify(content);
    const trimmedContent = contentString.trim();

    // Check if content is HTML
    const isHtml = trimmedContent.slice(0, 500).toLowerCase().includes("<html");
    if (!isHtml) {
      return null;
    }

    logMessage(
      "debug",
      "HtmlLinkExtractorStrategy: Detected HTML content, searching for OpenAPI links",
      metadata,
    );

    // Extract OpenAPI URL from HTML
    const openApiUrl = extractOpenApiUrlFromHtml(contentString);
    if (!openApiUrl) {
      logMessage(
        "debug",
        "HtmlLinkExtractorStrategy: No OpenAPI URL found in HTML content",
        metadata,
      );
      return null;
    }

    logMessage(
      "info",
      `HtmlLinkExtractorStrategy: Found OpenAPI URL in HTML: ${openApiUrl}`,
      metadata,
    );

    // Convert relative URL to absolute if needed
    let absoluteOpenApiUrl = openApiUrl;
    if (openApiUrl.startsWith("/")) {
      try {
        const baseUrl = new URL(sourceUrl).origin;
        absoluteOpenApiUrl = new URL(openApiUrl, baseUrl).href;
      } catch (error) {
        logMessage(
          "warn",
          `HtmlLinkExtractorStrategy: Failed to resolve relative URL ${openApiUrl}: ${error?.message}`,
          metadata,
        );
        return null;
      }
    }

    // Use the utility function to fetch and validate the OpenAPI spec
    const specs = await fetchMultipleOpenApiSpecs([absoluteOpenApiUrl], metadata);

    if (specs) {
      logMessage(
        "info",
        `HtmlLinkExtractorStrategy: Successfully fetched and validated OpenAPI spec from ${absoluteOpenApiUrl}`,
        metadata,
      );
      return specs;
    }

    logMessage(
      "debug",
      `HtmlLinkExtractorStrategy: Failed to fetch valid OpenAPI spec from ${absoluteOpenApiUrl}`,
      metadata,
    );
    return null;
  }
}
