/**
 * Documentation Retrieval and Relevance Scoring
 * 
 * This module handles extracting relevant sections from documentation based on search queries.
 * It uses keyword matching and scoring algorithms to identify the most relevant content.
 */

import { server_defaults } from '../default.js';
import { LanguageModel } from '../llm/llm.js';

export class DocumentationRetrieval {
  /**
   * Extracts the most relevant sections from documentation based on a search query.
   * 
   * Uses keyword matching and scoring to identify relevant sections:
   * - Splits documentation into chunks of configurable size
   * - Scores each chunk based on keyword matches (exact matches weighted higher)
   * - Returns top-scoring sections in their original order
   * 
   * @param documentation - The full documentation text to search through
   * @param searchQuery - Search terms to find relevant content (space-separated)
   * @param maxSections - Maximum number of sections to return (default: 5)
   * @param sectionSize - Size of each section in characters (default: 2000)
   * @returns Concatenated relevant sections, or empty string if no matches found
   */
  public extractRelevantSections(
    documentation: string,
    searchQuery: string,
    maxSections: number = 5,
    sectionSize: number = 2000
  ): string {
    if (!documentation || documentation.length === 0) {
      return '';
    }

    sectionSize = Math.max(200, Math.min(sectionSize, 50000));
    maxSections = Math.max(1, Math.min(maxSections, LanguageModel.contextLength / sectionSize));

    if (documentation.length <= sectionSize) {
      return documentation;
    }

    const MIN_SEARCH_TERM_LENGTH = server_defaults.DOCUMENTATION.MIN_SEARCH_TERM_LENGTH || 3;

    const searchTerms = searchQuery?.toLowerCase()?.split(/[^a-z0-9/]/)
      .map(term => term.trim())
      .filter(term => term.length >= MIN_SEARCH_TERM_LENGTH) || [];

    if (searchTerms.length === 0) {
      return '';
    }

    const sections: Array<{ content: string; searchableContent: string; index: number; sectionIndex: number }> = [];

    for (let i = 0; i < documentation.length; i += sectionSize) {
      const content = documentation.slice(i, Math.min(i + sectionSize, documentation.length));
      sections.push({
        content,
        searchableContent: content.toLowerCase(),
        index: i,
        sectionIndex: sections.length
      });
    }

    const sectionScores: Map<number, number> = new Map();

    for (const term of searchTerms) {
      sections.forEach((section, idx) => {
        let score = 0;
        const content = section.searchableContent;

        const wordBoundaryRegex = new RegExp(`\\b${term}\\b`, 'g');
        const exactMatches = (content.match(wordBoundaryRegex) || []).length;
        score += exactMatches * 3 * term.length;

        if (exactMatches === 0 && content.includes(term)) {
          score += term.length;
        }

        if (score > 0) {
          const currentScore = sectionScores.get(idx) || 0;
          sectionScores.set(idx, currentScore + score);
        }
      });
    }

    const scoredSections = sections.map((section, idx) => ({
      ...section,
      score: sectionScores.get(idx) || 0
    }));

    const topSections = scoredSections
      .sort((a, b) => b.score - a.score)
      .slice(0, maxSections)
      .filter(section => section.score > 0);

    if (topSections.length === 0) {
      return '';
    }

    topSections.sort((a, b) => a.index - b.index);

    const result = topSections.map(section => section.content).join('\n\n');

    const maxExpectedLength = maxSections * sectionSize;
    return result.length > maxExpectedLength
      ? result.slice(0, maxExpectedLength)
      : result;
  }
}
