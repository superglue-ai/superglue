/**
 * Utility functions for documentation processing
 */

import { ServiceMetadata } from "@superglue/shared";
import axios from "axios";
import * as yaml from "js-yaml";
import { server_defaults } from "../default.js";
import { parseJSON } from "../files/index.js";
import { logMessage } from "../utils/logs.js";

export const DOCUMENTATION_EXCLUDED_LINK_KEYWORDS = [
  "signup",
  "login",
  "pricing",
  "contact",
  "support",
  "cookie",
  "privacy",
  "terms",
  "legal",
  "policy",
  "status",
  "help",
  "blog",
  "careers",
  "about",
  "press",
  "news",
  "events",
  "partners",
  "changelog",
  "release-notes",
  "updates",
  "upgrade",
  "register",
  "cli",
  "signin",
  "sign-in",
  "sign-up",
  "trial",
  "demo",
  "sales",
  "widget",
  "webhooks",
  "/de/",
  "/it/",
  "/fr/",
  "/nl/",
  "/es/",
  "/pt/",
  "/pl/",
  "/ru/",
  "/ja/",
  "/zh/",
  "/ko/",
  "/zh-CN/",
  "/zh-TW/",
  "/id/",
];

export function getDefaultDocumentationKeywords(): Array<{ keyword: string; weight: number }> {
  return [
    // High priority: Getting started & overview content (weight: 5)
    { keyword: "getting started", weight: 5 },
    { keyword: "quickstart", weight: 5 },
    { keyword: "overview", weight: 5 },
    { keyword: "introduction", weight: 5 },
    { keyword: "api", weight: 5 },

    // Core concepts: Authentication & API fundamentals (weight: 4)
    { keyword: "authentication", weight: 4 },
    { keyword: "authorization", weight: 4 },
    { keyword: "rest", weight: 4 },
    { keyword: "endpoints", weight: 4 },

    // Important concepts (weight: 3)
    { keyword: "guides", weight: 3 },
    { keyword: "tutorial", weight: 3 },
    { keyword: "reference", weight: 3 },
    { keyword: "api-reference", weight: 3 },
    { keyword: "open api", weight: 3 },
    { keyword: "swagger", weight: 3 },
    { keyword: "bearer", weight: 3 },
    { keyword: "token", weight: 3 },
    { keyword: "pagination", weight: 3 },
    { keyword: "schema", weight: 3 },

    // Moderate importance: Data concepts (weight: 2)
    { keyword: "objects", weight: 2 },
    { keyword: "data-objects", weight: 2 },
    { keyword: "properties", weight: 2 },
    { keyword: "values", weight: 2 },
    { keyword: "fields", weight: 2 },
    { keyword: "attributes", weight: 2 },
    { keyword: "parameters", weight: 2 },
    { keyword: "slugs", weight: 2 },
    { keyword: "lists", weight: 2 },
    { keyword: "query", weight: 2 },
    { keyword: "methods", weight: 2 },
    { keyword: "response", weight: 2 },
    { keyword: "filtering", weight: 2 },
    { keyword: "sorting", weight: 2 },
    { keyword: "searching", weight: 2 },
    { keyword: "filter", weight: 2 },
    { keyword: "sort", weight: 2 },
    { keyword: "search", weight: 2 },

    // Lower priority: Specific HTTP methods (weight: 1)
    { keyword: "get", weight: 1 },
    { keyword: "post", weight: 1 },
    { keyword: "put", weight: 1 },
    { keyword: "delete", weight: 1 },
    { keyword: "patch", weight: 1 },
  ];
}

export function getMergedDocumentationKeywords(
  inputKeywords?: string[] | null,
): Array<{ keyword: string; weight: number }> {
  const defaultKeywords = getDefaultDocumentationKeywords();

  if (!inputKeywords || inputKeywords.length === 0) {
    return defaultKeywords;
  }

  // User-provided keywords get high weight (4)
  const userKeywords = inputKeywords.map((keyword) => ({ keyword, weight: 4 }));

  // Merge, preferring user-provided weights for duplicates
  const keywordMap = new Map<string, number>();
  for (const { keyword, weight } of [...userKeywords, ...defaultKeywords]) {
    const key = keyword.toLowerCase();
    if (!keywordMap.has(key)) {
      keywordMap.set(key, weight);
    }
  }

  return Array.from(keywordMap.entries()).map(([keyword, weight]) => ({ keyword, weight }));
}

export function rankDocumentationItems(
  items: string[] | { linkText: string; href: string }[],
  keywords: string[] | Array<{ keyword: string; weight: number }>,
  excludedKeywords: string[] = DOCUMENTATION_EXCLUDED_LINK_KEYWORDS,
  fetchedLinks?: Set<string>,
): any[] {
  const normalizedItems = items.map((item, index) => {
    const isString = typeof item === "string";
    const url = isString ? new URL(item).pathname : new URL(item.href).pathname;
    const text = isString ? "" : item.linkText;
    const searchableContent = `${url} ${text}`.toLowerCase();

    return {
      url,
      original: item,
      searchableContent,
      index,
    };
  });

  let itemsToRank = fetchedLinks
    ? normalizedItems.filter((item) => {
        const href = typeof item.original === "string" ? item.original : item.original.href;
        return !fetchedLinks.has(href);
      })
    : normalizedItems;

  const itemsToRankFiltered = itemsToRank.filter((item) => {
    try {
      for (const excludedKeyword of excludedKeywords) {
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
    return itemsToRank.map((item) => item.original);
  }

  // Normalize keywords to weighted format
  const weightedKeywords: Array<{ keyword: string; weight: number }> =
    typeof keywords[0] === "string"
      ? (keywords as string[]).map((k) => ({ keyword: k, weight: 1 }))
      : (keywords as Array<{ keyword: string; weight: number }>);

  const scored = itemsToRank.map((item) => {
    let matchScore = 0;
    const content = item.searchableContent;

    for (const { keyword, weight } of weightedKeywords) {
      const keywordLower = keyword.toLowerCase();
      const escaped = keywordLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const wordBoundaryRegex = new RegExp(`\\b${escaped}\\b`, "g");
      const exactMatches = (content.match(wordBoundaryRegex) || []).length;

      // Weighted scoring: exact matches get 3x base, partial matches get 1x base
      matchScore += exactMatches * 3 * weight;

      if (exactMatches === 0 && content.includes(keywordLower)) {
        matchScore += 1 * weight;
      }
    }

    // Smarter length penalty: use log scale with a cap to prevent over-penalizing long URLs
    const MIN_LENGTH = 10;
    const urlLength = Math.max(item.url.length, MIN_LENGTH);
    const lengthPenalty = Math.log10(urlLength);
    const score = matchScore / lengthPenalty;

    return {
      item: item.original,
      score,
      hasMatch: matchScore > 0,
    };
  });

  return scored
    .sort((a, b) => {
      if (a.hasMatch !== b.hasMatch) {
        return a.hasMatch ? -1 : 1;
      }
      return b.score - a.score;
    })
    .map((s) => s.item);
}

export function sanitizeExtractedUrl(url: string): string {
  let cleaned = url.trim();
  // Strip common trailing punctuation from markdown list items and parentheses.
  while (/[)\],.;:]$/.test(cleaned)) {
    cleaned = cleaned.slice(0, -1);
  }
  // Strip leading punctuation if present.
  cleaned = cleaned.replace(/^[\[(]+/, "");
  return cleaned;
}

/**
 * Validates if an object is a valid OpenAPI 3.x, Swagger 2.0, or Google API Discovery Document specification.
 */
export function isValidOpenApiSpec(obj: any): boolean {
  if (!obj || typeof obj !== "object") {
    return false;
  }

  const isOpenApi3 = obj.openapi && typeof obj.openapi === "string" && obj.openapi.startsWith("3.");
  const isSwagger2 = obj.swagger && obj.swagger === "2.0";
  const isGoogleDiscovery =
    obj.kind &&
    obj.kind === "discovery#restDescription" &&
    obj.resources &&
    typeof obj.resources === "object";

  if (!isOpenApi3 && !isSwagger2 && !isGoogleDiscovery) {
    return false;
  }

  if (isGoogleDiscovery) {
    return true;
  }

  if (!obj.info || typeof obj.info !== "object" || !obj.info.title || !obj.info.version) {
    return false;
  }

  if (!obj.paths || typeof obj.paths !== "object") {
    return false;
  }

  return true;
}

/**
 * Fetches multiple OpenAPI specifications concurrently with limits.
 * Returns either null if no valid specs are fetched, or a json string of a single spec, or a json string of all specs with metadata.
 */
export async function fetchMultipleOpenApiSpecs(
  urls: string[],
  metadata: ServiceMetadata,
): Promise<string> {
  let filteredUrls = urls.filter(
    (url) =>
      !url.includes(".png") &&
      !url.includes(".jpg") &&
      !url.includes(".jpeg") &&
      !url.includes(".gif") &&
      !url.includes(".svg") &&
      !url.includes(".webp") &&
      !url.includes(".ico") &&
      !url.includes(".woff") &&
      !url.includes(".woff2") &&
      !url.includes(".ttf") &&
      !url.includes(".eot") &&
      !url.includes(".otf") &&
      !url.includes(".pdf"),
  );

  filteredUrls = removeOldVersionFromUrls(filteredUrls);

  let specs: any[] = [];
  const MAX_CONCURRENT_FETCHES = server_defaults.DOCUMENTATION.MAX_CONCURRENT_OPENAPI_FETCHES;
  const MAX_SPECS_TO_FETCH = server_defaults.DOCUMENTATION.MAX_OPENAPI_SPECS_TO_FETCH;

  const urlsToFetch = filteredUrls.slice(0, MAX_SPECS_TO_FETCH);
  if (urls.length > MAX_SPECS_TO_FETCH) {
    logMessage(
      "warn",
      `Found ${urls.length} OpenAPI specs but limiting to ${MAX_SPECS_TO_FETCH}`,
      metadata,
    );
  }

  for (let i = 0; i < urlsToFetch.length; i += MAX_CONCURRENT_FETCHES) {
    const batch = urlsToFetch.slice(i, i + MAX_CONCURRENT_FETCHES);
    const batchPromises = batch.map(async (url) => {
      try {
        const response = await axios.get(url, {
          timeout: server_defaults.DOCUMENTATION.TIMEOUTS.AXIOS,
        });
        let specData = response.data;

        if (typeof specData === "string") {
          try {
            specData = parseJSON(specData);
          } catch {
            try {
              specData = yaml.load(specData) as any;
            } catch {}
          }
        }

        if (!isValidOpenApiSpec(specData)) {
          logMessage("warn", `Fetched data from ${url} is not a valid OpenAPI spec`, metadata);
          return "";
        }

        logMessage("info", `Fetched valid OpenAPI spec from ${url}`, metadata);
        return {
          url,
          spec: specData,
        };
      } catch (error) {
        logMessage("warn", `Failed to fetch OpenAPI spec from ${url}: ${error?.message}`, metadata);
        return null;
      }
    });

    const batchResults = await Promise.all(batchPromises);
    specs.push(...batchResults.filter((result) => result !== null));
  }

  // filter out empty strings
  specs = specs.filter((spec) => spec !== null && spec !== undefined && spec !== "");

  if (specs.length === 0) {
    return null;
  } else if (specs.length === 1) {
    return JSON.stringify(specs[0].spec, null, 2);
  } else {
    return JSON.stringify(
      {
        _meta: {
          fetchedAt: new Date().toISOString(),
          totalSpecs: specs.length,
        },
        specifications: specs,
      },
      null,
      2,
    );
  }
}

/**
 * Filters URLs to remove non-documentation pages and old API versions.
 */
export function filterDocumentationUrls(urls: string[], excludedKeywords: string[]): string[] {
  let filteredUrls = urls.filter((url) => {
    try {
      const urlLower = new URL(url).pathname.toLowerCase();
      for (const excludedKeyword of excludedKeywords) {
        if (urlLower.includes(excludedKeyword)) {
          return false;
        }
      }
      return true;
    } catch {
      return false;
    }
  });

  filteredUrls = removeOldVersionFromUrls(filteredUrls);

  if (filteredUrls.length > 0) {
    return filteredUrls;
  }
  return urls;
}

/**
 * Removes older API versions from a list of URLs, keeping only the highest version for each base URL.
 * For example, given ["/api/v1/users", "/api/v2/users"], only "/api/v2/users" is kept.
 */
export function removeOldVersionFromUrls(urls: string[]): string[] {
  const versionRegex = /v(\d+)/;

  const groups = new Map<string, { url: string; version: number }[]>();

  for (const url of urls) {
    const match = url.match(versionRegex);
    const version = match ? parseInt(match[1]) : 0;
    const base = url.replace(versionRegex, "");

    if (!groups.has(base)) groups.set(base, []);
    groups.get(base)!.push({ url, version });
  }

  const result: string[] = [];
  for (const [, entries] of groups) {
    entries.sort((a, b) => b.version - a.version);
    result.push(entries[0].url);
  }

  return result;
}

/**
 * Recursively extracts OpenAPI specification URLs from an object.
 * Looks for keys containing 'openapi' or 'spec' with HTTP URL values.
 */
export function extractOpenApiUrlsFromObject(data: any): string[] {
  const urls: string[] = [];

  const findOpenApiUrls = (obj: any) => {
    if (!obj || typeof obj !== "object") return;

    for (const key in obj) {
      if (!obj.hasOwnProperty(key)) continue;
      const value = obj[key];

      if (
        (key.toLowerCase().includes("openapi") || key.toLowerCase().includes("spec")) &&
        typeof value === "string" &&
        value.startsWith("http")
      ) {
        urls.push(value);
      }

      if (Array.isArray(value)) {
        value.forEach((item) => findOpenApiUrls(item));
      } else if (typeof value === "object") {
        findOpenApiUrls(value);
      }
    }
  };

  findOpenApiUrls(data);
  return [...new Set(urls)];
}

/**
 * Extracts OpenAPI URL from HTML content (looks in script tags and common patterns).
 */
export function extractOpenApiUrlFromHtml(html: string): string | null {
  try {
    const settingsMatch = html.match(
      /<script[^>]*id=["']swagger-settings["'][^>]*>([\s\S]*?)<\/script>/i,
    );
    if (settingsMatch && settingsMatch[1]) {
      const settingsContent = settingsMatch[1].trim();
      try {
        const settings = parseJSON(settingsContent);
        if (settings.url && typeof settings.url === "string") {
          return settings.url;
        }
      } catch (e) {}
    }

    const jsonMatch = html.match(
      /{\s*"url"\s*:\s*"([^"]*(?:openapi|swagger|spec)\.(?:json|yaml|yml))"/i,
    );
    if (jsonMatch && jsonMatch[1]) {
      return jsonMatch[1];
    }

    const jsonMatch2 = html.match(/url:\s*"([^"]*(?:openapi|swagger|spec)\.(?:json|yaml|yml))"/i);
    if (jsonMatch2 && jsonMatch2[1]) {
      return jsonMatch2[1];
    }

    const directUrlMatch = html.match(
      /["']((?:https?:\/\/|\/)[^"']*(?:openapi|swagger)\.(?:json|yaml|yml))["']/i,
    );
    if (directUrlMatch && directUrlMatch[1]) {
      return directUrlMatch[1];
    }

    const scriptVarMatch = html.match(
      /url\s*=\s*["']([^"']*(?:openapi|swagger)\.(?:json|yaml|yml))["']/i,
    );
    if (scriptVarMatch && scriptVarMatch[1]) {
      return scriptVarMatch[1];
    }

    return null;
  } catch (error) {
    return null;
  }
}
