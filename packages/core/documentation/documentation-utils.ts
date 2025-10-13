/**
 * Utility functions for documentation processing
 */

import axios from "axios";
import * as yaml from 'js-yaml';
import { server_defaults } from '../default.js';
import { parseJSON } from '../utils/json-parser.js';
import { logMessage } from '../utils/logs.js';
import { Metadata } from "@superglue/shared";

/**
 * Validates if an object is a valid OpenAPI 3.x, Swagger 2.0, or Google API Discovery Document specification.
 */
export function isValidOpenApiSpec(obj: any): boolean {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const isOpenApi3 = obj.openapi && typeof obj.openapi === 'string' && obj.openapi.startsWith('3.');
  const isSwagger2 = obj.swagger && obj.swagger === '2.0';
  const isGoogleDiscovery = obj.kind && obj.kind === 'discovery#restDescription' && obj.resources && typeof obj.resources === 'object';

  if (!isOpenApi3 && !isSwagger2 && !isGoogleDiscovery) {
    return false;
  }

  if (isGoogleDiscovery) {
    return true;
  }

  if (!obj.info || typeof obj.info !== 'object' || !obj.info.title || !obj.info.version) {
    return false;
  }

  if (!obj.paths || typeof obj.paths !== 'object') {
    return false;
  }

  return true;
}

/**
 * Fetches multiple OpenAPI specifications concurrently with limits.
 * Returns either null if no valid specs are fetched, or a json string of a single spec, or a json string of all specs with metadata.
 */
export async function fetchMultipleOpenApiSpecs(urls: string[], metadata: Metadata): Promise<string> {
  let filteredUrls = urls.filter(url => 
    !url.includes('.png') && !url.includes('.jpg') && !url.includes('.jpeg') && 
    !url.includes('.gif') && !url.includes('.svg') && !url.includes('.webp') && 
    !url.includes('.ico') && !url.includes('.woff') && !url.includes('.woff2') && 
    !url.includes('.ttf') && !url.includes('.eot') && !url.includes('.otf') && 
    !url.includes('.pdf')
  );

  filteredUrls = removeOldVersionFromUrls(filteredUrls);
  
  let specs: any[] = [];
  const MAX_CONCURRENT_FETCHES = server_defaults.DOCUMENTATION.MAX_CONCURRENT_OPENAPI_FETCHES;
  const MAX_SPECS_TO_FETCH = server_defaults.DOCUMENTATION.MAX_OPENAPI_SPECS_TO_FETCH;

  const urlsToFetch = filteredUrls.slice(0, MAX_SPECS_TO_FETCH);
  if (urls.length > MAX_SPECS_TO_FETCH) {
    logMessage('warn', `Found ${urls.length} OpenAPI specs but limiting to ${MAX_SPECS_TO_FETCH}`, metadata);
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

        if (!isValidOpenApiSpec(specData)) {
          logMessage('warn', `Fetched data from ${url} is not a valid OpenAPI spec`, metadata);
          return "";
        }

        logMessage('info', `Fetched valid OpenAPI spec from ${url}`, metadata);
        return {
          url,
          spec: specData
        };
      } catch (error) {
        logMessage('warn', `Failed to fetch OpenAPI spec from ${url}: ${error?.message}`, metadata);
        return null;
      }
    });

    const batchResults = await Promise.all(batchPromises);
    specs.push(...batchResults.filter(result => result !== null));
  }

  // filter out empty strings
  specs = specs.filter(spec => spec !== null && spec !== undefined && spec !== "");

  if (specs.length === 0) {
    return null;
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

/**
 * Filters URLs to remove non-documentation pages and old API versions.
 */
export function filterDocumentationUrls(urls: string[], excludedKeywords: string[]): string[] {
  let filteredUrls = urls.filter(url => {
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
  return [...new Set(urls)];
}

/**
 * Extracts OpenAPI URL from HTML content (looks in script tags and common patterns).
 */
export function extractOpenApiUrlFromHtml(html: string): string | null {
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

    const jsonMatch = html.match(/{\s*"url"\s*:\s*"([^"]*(?:openapi|swagger|spec)\.(?:json|yaml|yml))"/i);
    if (jsonMatch && jsonMatch[1]) {
      return jsonMatch[1];
    }

    const jsonMatch2 = html.match(/url:\s*"([^"]*(?:openapi|swagger|spec)\.(?:json|yaml|yml))"/i);
    if (jsonMatch2 && jsonMatch2[1]) {
      return jsonMatch2[1];
    }

    const directUrlMatch = html.match(/["']((?:https?:\/\/|\/)[^"']*(?:openapi|swagger)\.(?:json|yaml|yml))["']/i);
    if (directUrlMatch && directUrlMatch[1]) {
      return directUrlMatch[1];
    }

    const scriptVarMatch = html.match(/url\s*=\s*["']([^"']*(?:openapi|swagger)\.(?:json|yaml|yml))["']/i);
    if (scriptVarMatch && scriptVarMatch[1]) {
      return scriptVarMatch[1];
    }

    return null;
  } catch (error) {
    return null;
  }
}

