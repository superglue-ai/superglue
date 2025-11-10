import axios from "axios";
import { chromium } from "playwright";
import { Metadata } from "@superglue/shared";
import { logMessage } from "../../utils/logs.js";
import { OpenApiFetchingStrategy } from "../types.js";
import { fetchMultipleOpenApiSpecs } from "../documentation-utils.js";

/**
 * Strategy for extracting OpenAPI spec URLs from SwaggerUI pages
 *
 * This strategy:
 * 1. Checks if the provided URL is a SwaggerUI page
 * 2. Uses multiple methods to find the actual OpenAPI spec URL:
 *    - Parses JavaScript configuration files (swagger-initializer.js)
 *    - Checks swagger-config endpoints
 *    - Checks config.json files
 *    - Uses Playwright to find links in the rendered page
 * 3. Returns the discovered OpenAPI spec URLs
 */
export class SwaggerUIStrategy implements OpenApiFetchingStrategy {
  async tryFetch(
    data: any,
    sourceUrl: string,
    metadata: Metadata,
  ): Promise<string | null> {
    try {
      // Check if this is a SwaggerUI page
      const html = typeof data === "string" ? data : JSON.stringify(data);
      if (!this.isSwaggerUI(html)) {
        return null;
      }

      logMessage("info", `Detected SwaggerUI page at ${sourceUrl}`, metadata);

      // Try static fetch first (faster)
      const staticUrls = await this.findByStaticFetch(sourceUrl);
      if (staticUrls.length > 0) {
        logMessage(
          "info",
          `Found ${staticUrls.length} OpenAPI spec URL(s) via static analysis`,
          metadata,
        );
        const specs = await fetchMultipleOpenApiSpecs(staticUrls, metadata);
        if (specs) {
          return specs;
        }
      }

      // Fall back to Playwright (slower but more thorough)
      const playwrightUrls = await this.findByPlaywright(sourceUrl);
      if (playwrightUrls.length > 0) {
        logMessage(
          "info",
          `Found ${playwrightUrls.length} OpenAPI spec URL(s) via Playwright`,
          metadata,
        );
        const specs = await fetchMultipleOpenApiSpecs(playwrightUrls, metadata);
        if (specs) {
          return specs;
        }
      }

      logMessage(
        "warn",
        `SwaggerUI page detected but no OpenAPI spec URLs found`,
        metadata,
      );
      return null;
    } catch (error) {
      logMessage(
        "warn",
        `SwaggerUIStrategy failed: ${error?.message}`,
        metadata,
      );
      return null;
    }
  }

  private isSwaggerUI(html: string): boolean {
    if (!html) return false;

    const swaggerIndicators = [
      /id=["']swagger-ui["']/i,
      /class=["'][^"']*swagger-ui[^"']*["']/i,
      /swagger-ui-bundle\.js/i,
      /swagger-ui-standalone-preset\.js/i,
      /swagger-initializer\.js/i,
      /swagger-ui\.css/i,
      /SwaggerUIBundle/i,
      /SwaggerUIStandalonePreset/i,
      /<div[^>]*id=["']swagger-ui["'][^>]*>/i,
      /<title[^>]*>.*swagger.*ui.*<\/title>/i,
    ];

    return swaggerIndicators.some((indicator) => indicator.test(html));
  }

  private async extractSpecUrls(base: string, text: string): Promise<string[]> {
    const results = new Set<string>();
    if (!text) return [];

    const patterns = [
      /SwaggerUIBundle\([^)]*url\s*:\s*['"]([^'"]+)['"]/gi,
      /url\s*:\s*['"]([^'"]+)['"]/gi,
      /['"`]([^'"`]*\/swagger\/docs\/[^'"`]+)['"`]/gi,
      /['"`]([^'"`]*\/swagger-docs)['"`]/gi,
      /['"`]([^'"`]*\/swagger-config)['"`]/gi,
      /configUrl\s*:\s*['"]([^'"]+)['"]/gi,
      /['"`]([^'"`]*\/config\.json)['"`]/gi,
      /['"`]([^'"`]*\/api\/[^'"`]*docs?[^'"`]*)['"`]/gi,
      /['"`]([^'"`]*\/[^'"`]*\.(?:json|ya?ml))['"`]/gi,
    ];

    for (const p of patterns) {
      let m;
      while ((m = p.exec(text)) !== null) {
        // Skip template variables
        if (m[1].includes("${") || m[1].includes("{{")) {
          continue;
        }

        // Skip obviously invalid matches
        if (
          m[1].includes(",We.createElement(") ||
          m[1].includes(",s,i,") ||
          m[1] === "/" ||
          m[1] === "mailto:" ||
          m[1].includes(",u.createElement(") ||
          m[1].includes(",O.createElement(") ||
          m[1].includes(",e,t,") ||
          m[1].includes("createElement") ||
          (m[1].includes(",") && !m[1].includes("/"))
        ) {
          continue;
        }

        try {
          const resolved = new URL(m[1], base).href;

          // Skip default Swagger Petstore example
          if (resolved.includes("petstore.swagger.io")) {
            continue;
          }

          // Additional validation - must look like a spec URL
          if (
            resolved.includes("/swagger/docs/") ||
            resolved.includes("/swagger-docs") ||
            resolved.includes("/api/") ||
            resolved.endsWith(".json") ||
            resolved.endsWith(".yaml") ||
            resolved.endsWith(".yml")
          ) {
            results.add(resolved);
          }

          // Handle swagger-config URLs
          if (resolved.includes("/swagger-config")) {
            try {
              const { data: config } = await axios.get(resolved, {
                timeout: 10000,
              });
              if (config.urls && Array.isArray(config.urls)) {
                for (const item of config.urls) {
                  if (item.url) {
                    const specUrl = new URL(item.url, resolved).href;
                    if (!specUrl.includes("petstore.swagger.io")) {
                      results.add(specUrl);
                    }
                  }
                }
              }
            } catch {
              // ignore config fetch errors
            }
          }

          // Handle config.json URLs (Crossref style)
          if (resolved.includes("/config.json")) {
            try {
              const { data: config } = await axios.get(resolved, {
                timeout: 10000,
              });
              if (config.url) {
                const specUrl = new URL(config.url, resolved).href;
                if (!specUrl.includes("petstore.swagger.io")) {
                  results.add(specUrl);
                }
              }
            } catch {
              // ignore config fetch errors
            }
          }
        } catch {
          // ignore invalid
        }
      }
    }

    return Array.from(results);
  }

  private async findByStaticFetch(pageUrl: string): Promise<string[]> {
    const found = new Set<string>();
    const { data: html } = await axios.get(pageUrl, { timeout: 10000 });
    const urls = await this.extractSpecUrls(pageUrl, html);
    urls.forEach((u) => found.add(u));

    // Extract script src attributes using regex
    const scriptSrcPattern = /<script[^>]*\ssrc=["']([^"']+)["']/gi;
    let scriptMatch;
    while ((scriptMatch = scriptSrcPattern.exec(html)) !== null) {
      try {
        const scriptUrl = new URL(scriptMatch[1], pageUrl).href;
        const { data: js } = await axios.get(scriptUrl, { timeout: 10000 });
        const urls = await this.extractSpecUrls(scriptUrl, js);
        urls.forEach((u) => found.add(u));
      } catch {
        // ignore failed script fetches
      }
    }

    // Extract inline scripts using regex
    const inlineScriptPattern =
      /<script[^>]*>([^<]*(?:(?!<\/script>)<[^<]*)*)<\/script>/gi;
    let inlineMatch;
    while ((inlineMatch = inlineScriptPattern.exec(html)) !== null) {
      const urls = await this.extractSpecUrls(pageUrl, inlineMatch[1]);
      urls.forEach((u) => found.add(u));
    }

    return Array.from(found);
  }

  private looksLikeOpenApi(body: string): boolean {
    if (!body) return false;
    try {
      const obj = JSON.parse(body);
      return !!(obj && (obj.openapi || obj.swagger || obj.paths));
    } catch {
      // yaml heuristics
      return /^(openapi|swagger):/im.test(body) || /paths:/im.test(body);
    }
  }

  private async findByPlaywright(pageUrl: string): Promise<string[]> {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const found = new Set<string>();

    page.on("response", async (res) => {
      try {
        const url = res.url();
        // quick check by extension
        if (/\.(json|ya?ml)$/i.test(url)) {
          const text = await res.text();
          if (this.looksLikeOpenApi(text)) found.add(url);
        } else {
          const contentType = res.headers()["content-type"] || "";
          if (contentType.includes("application/json")) {
            const text = await res.text();
            if (this.looksLikeOpenApi(text)) found.add(url);
          }
        }
      } catch {
        // ignore
      }
    });

    await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 30000 });

    // Wait a bit more for dynamic content to load
    await page.waitForTimeout(2000);

    // Look for SwaggerUI spec links in the rendered page
    try {
      const specLinks = await page.evaluate(() => {
        const selectors = [
          'a[href*="/api-docs"]',
          'a[href*="/swagger/docs"]',
          'a[href*="/docs"]',
          'a[href*="/openapi.json"]',
          'a[href*="/swagger.json"]',
          ".information-container a[href]",
          ".info a[href]",
          "hgroup a[href]",
          ".url",
          'a[target="_blank"]',
          "span.url",
        ];

        const allLinks = new Set();

        for (const selector of selectors) {
          const elements = document.querySelectorAll(selector);

          for (const element of Array.from(elements)) {
            const href =
              element.getAttribute("href") || element.textContent?.trim();

            if (
              href &&
              (href.includes("/api-docs") ||
                href.includes("/swagger/docs") ||
                href.includes("/docs") ||
                href.includes(".json") ||
                href.includes(".yaml"))
            ) {
              allLinks.add(href);
            }
          }
        }

        return Array.from(allLinks);
      });

      for (const href of specLinks) {
        try {
          const resolved = new URL(href as string, pageUrl).href;
          found.add(resolved);
        } catch {
          // ignore invalid URLs
        }
      }
    } catch {
      // ignore evaluation errors
    }

    await page.waitForTimeout(800);
    await browser.close();
    return Array.from(found);
  }
}
