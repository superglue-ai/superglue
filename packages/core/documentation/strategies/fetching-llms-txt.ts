/**
 * LLMS.txt Fetching Strategy
 *
 * Looks for llms-full.txt (preferred) and llms.txt. When llms.txt is an index
 * of links, fetches those pages and combines the content.
 */

import { ServiceMetadata } from "@superglue/shared";
import axios from "axios";
import { server_defaults } from "../../default.js";
import { logMessage } from "../../utils/logs.js";
import { DocumentationConfig, DocumentationFetchingStrategy } from "../types.js";
import {
  DOCUMENTATION_EXCLUDED_LINK_KEYWORDS,
  getMergedDocumentationKeywords,
  rankDocumentationItems,
  sanitizeExtractedUrl,
} from "../documentation-utils.js";

type LlmsParseResult =
  | { kind: "full"; content: string; urls: string[] }
  | { kind: "index"; content: string; urls: string[] }
  | { kind: "unknown"; content: string; urls: string[] };

const LLMS_FULL_FILENAMES = ["llms-full.txt", "llms-full.md"];
const LLMS_INDEX_FILENAMES = ["llms.txt", "llms.md"];

function normalizeUrl(url: string): string {
  try {
    return new URL(url).href;
  } catch {
    return url;
  }
}

function extractUrlsFromLine(line: string): string[] {
  const urls: string[] = [];
  const markdownMatch = line.match(/\[[^\]]+\]\((https?:\/\/[^)\s]+)\)/i);
  if (markdownMatch?.[1]) {
    urls.push(markdownMatch[1]);
  }

  const urlMatch = line.match(/https?:\/\/[\w\-._~:/?#[\]@!$&'()*+,;=%]+/i);
  if (urlMatch?.[0]) {
    urls.push(urlMatch[0]);
  }

  return urls.map(sanitizeExtractedUrl).filter(Boolean);
}

function parseLlmsContent(content: string, sourceUrl: string): LlmsParseResult {
  const lines = content.split(/\r?\n/);
  const nonEmptyLines = lines.map((line) => line.trim()).filter((line) => line.length > 0);

  const urls: string[] = [];
  let urlLineCount = 0;

  for (const rawLine of nonEmptyLines) {
    const line = rawLine.replace(/^[-*\u2022]\s+/, "");
    if (line.startsWith("#") || line.startsWith("//")) {
      continue;
    }
    const extracted = extractUrlsFromLine(line);
    if (extracted.length > 0) {
      urlLineCount++;
      urls.push(...extracted.map(normalizeUrl));
    }
  }

  const uniqueUrls = Array.from(new Set(urls));
  const urlRatio = nonEmptyLines.length > 0 ? urlLineCount / nonEmptyLines.length : 0;
  const hasMarkdownStructure = /(^|\n)#+\s|```/m.test(content);
  const looksLikeFull =
    sourceUrl.toLowerCase().includes("llms-full") ||
    (content.length > 500 && (hasMarkdownStructure || urlRatio < 0.3));
  const looksLikeIndex = uniqueUrls.length > 0 && urlRatio >= 0.3;

  if (looksLikeFull) {
    return { kind: "full", content, urls: uniqueUrls };
  }

  if (looksLikeIndex) {
    return { kind: "index", content, urls: uniqueUrls };
  }

  return { kind: "unknown", content, urls: uniqueUrls };
}

function buildLlmsCandidates(
  documentationUrl: string,
  filenames: string[],
  includeWellKnown: boolean,
): string[] {
  const candidates: string[] = [];
  let url: URL;
  try {
    url = new URL(documentationUrl);
  } catch {
    return [];
  }

  const origin = url.origin;
  const pathParts = url.pathname.split("/").filter((p) => p);
  const basePaths = new Set<string>();

  basePaths.add("/");
  if (pathParts.length > 0) {
    basePaths.add("/" + pathParts[0]);
  }

  if (includeWellKnown) {
    candidates.push(`${origin}/.well-known/llms.txt`);
  }

  for (const basePath of basePaths) {
    const normalizedBase = basePath.endsWith("/") ? basePath : `${basePath}/`;
    for (const filename of filenames) {
      candidates.push(`${origin}${normalizedBase}${filename}`);
    }
  }

  return Array.from(new Set(candidates));
}

function wrapHtml(content: string, sourceUrl: string): string {
  const trimmed = content.trim();
  const hasHtmlIndicators =
    trimmed.includes("<html") ||
    trimmed.includes("<!doctype") ||
    trimmed.includes("<body") ||
    trimmed.includes("<div") ||
    trimmed.includes("<main") ||
    trimmed.includes("<article");
  if (hasHtmlIndicators) {
    return `<!-- Source: ${sourceUrl} -->\n${content}`;
  }
  return `<!-- Source: ${sourceUrl} -->\n<html><body>${content}</body></html>`;
}

async function fetchFirstText(
  urls: string[],
  config: DocumentationConfig,
): Promise<{ url: string; content: string } | null> {
  for (const candidate of urls) {
    try {
      const response = await axios.get(candidate, {
        headers: config.headers,
        timeout: server_defaults.DOCUMENTATION.TIMEOUTS.AXIOS,
        validateStatus: (status) => status === 200,
      });

      if (typeof response.data !== "string") {
        continue;
      }

      const trimmed = response.data.trim();
      if (!trimmed) {
        continue;
      }

      return { url: candidate, content: trimmed };
    } catch {}
  }
  return null;
}

export class LlmsTxtFetchingStrategy implements DocumentationFetchingStrategy {
  async tryFetch(config: DocumentationConfig, metadata: ServiceMetadata): Promise<string | null> {
    if (!config.documentationUrl?.startsWith("http")) return null;

    const fullCandidates = buildLlmsCandidates(config.documentationUrl, LLMS_FULL_FILENAMES, false);
    const indexCandidates = buildLlmsCandidates(
      config.documentationUrl,
      LLMS_INDEX_FILENAMES,
      true,
    );

    const fullResult = await fetchFirstText(fullCandidates, config);
    if (fullResult) {
      logMessage("info", `LLMs-full.txt detected at ${fullResult.url}`, metadata);
      return fullResult.content;
    }

    const indexResult = await fetchFirstText(indexCandidates, config);
    if (!indexResult) {
      return null;
    }

    const parsed = parseLlmsContent(indexResult.content, indexResult.url);
    if (parsed.urls.length === 0) {
      return parsed.content;
    }

    const rankedUrls = rankDocumentationItems(
      parsed.urls,
      getMergedDocumentationKeywords(config.keywords),
      DOCUMENTATION_EXCLUDED_LINK_KEYWORDS,
    ) as string[];
    const urlsToFetch = rankedUrls.slice(0, server_defaults.DOCUMENTATION.MAX_FETCHED_LINKS);
    logMessage(
      "info",
      `LLMs.txt detected at ${indexResult.url}, fetching ${urlsToFetch.length} pages`,
      metadata,
    );

    const MAX_TOTAL_SIZE = server_defaults.DOCUMENTATION.MAX_TOTAL_CONTENT_SIZE;
    let combinedContent = "";
    let totalSize = 0;

    for (const url of urlsToFetch) {
      try {
        const response = await axios.get(url, {
          headers: config.headers,
          timeout: server_defaults.DOCUMENTATION.TIMEOUTS.AXIOS,
        });

        if (typeof response.data !== "string") {
          continue;
        }

        const pageHtml = wrapHtml(response.data, url);
        const pageSize = Buffer.byteLength(pageHtml, "utf8");
        if (totalSize + pageSize > MAX_TOTAL_SIZE) {
          logMessage("debug", `LLMs.txt content reached size budget, stopping at ${url}`, metadata);
          break;
        }

        combinedContent += combinedContent ? `\n\n${pageHtml}` : pageHtml;
        totalSize += pageSize;
        logMessage("debug", `LLMs.txt fetched content from ${url}`, metadata);
      } catch (error) {
        logMessage("debug", `LLMs.txt fetch failed for ${url}: ${error?.message}`, metadata);
      }
    }

    return combinedContent || parsed.content;
  }
}
