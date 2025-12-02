/**
 * HTML to Markdown Strategy
 * 
 * Converts HTML content to Markdown using a shared pool.
 */

import { ApiConfig } from "@superglue/shared";
import { Metadata } from "@superglue/shared";
import { getSharedHtmlMarkdownPool } from '../../utils/html-markdown-pool.js';
import { logMessage } from "../../utils/logs.js";
import { DocumentationProcessingStrategy } from '../types.js';

export class HtmlMarkdownStrategy implements DocumentationProcessingStrategy {
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

    if (hasMarkdownIndicators && !hasHtmlIndicators) {
      return content;
    }

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

