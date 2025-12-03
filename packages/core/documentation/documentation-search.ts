/**
 * Documentation Search and Relevance Scoring
 * 
 * This module handles searching and extracting relevant sections from documentation based on search queries.
 * It uses keyword matching and scoring algorithms to identify the most relevant content.
 */

import { ServiceMetadata } from '@superglue/shared';
import { server_defaults } from '../default.js';
import { LanguageModel } from '../llm/llm-base-model.js';
import { sanitizeUnpairedSurrogates } from '../utils/helpers.js';
import { logMessage } from '../utils/logs.js';

export class DocumentationSearch {
  private readonly metadata: ServiceMetadata;

  constructor(metadata: ServiceMetadata) {
    this.metadata = metadata;
  }


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
   * @param openApiSchema - OpenAPI specification as JSON string (defaults to empty string)
   * @returns Concatenated relevant sections, or empty string if no matches found
   */
  public extractRelevantSections(
    documentation: string,
    searchQuery: string,
    maxSections: number = 5,
    sectionSize: number = 2000,
    openApiSchema: string = ''
  ): string {
    if ((!documentation || documentation.length === 0) && !openApiSchema) {
      logMessage('debug', 'Cannot extract relevant sections: No documentation or openApiSchema provided', this.metadata);
      return '';
    }

    sectionSize = Math.max(200, Math.min(sectionSize, 50000));
    maxSections = Math.max(1, Math.min(maxSections, LanguageModel.contextLength / sectionSize));

    if (documentation && documentation.length <= sectionSize && !openApiSchema) {
      return documentation;
    }

    const MIN_SEARCH_TERM_LENGTH = server_defaults.DOCUMENTATION.MIN_SEARCH_TERM_LENGTH || 3;

    const searchTerms = searchQuery?.toLowerCase()?.split(/[^a-z0-9/]/)
      .map(term => term.trim())
      .filter(term => term.length >= MIN_SEARCH_TERM_LENGTH) || [];

    if (searchTerms.length === 0) {
      return '';
    }

    let openApiOperationsText = '';
    let securityInfoText = '';
    let remainingSections = maxSections;
    
    if (openApiSchema) {
      const SECURITY_KEYWORDS = ['authorization', 'authentication', 'oauth', 'apikey', 'api-key', 'auth', 'token'];
      const hasSecurityKeyword = searchTerms.some(term => 
        SECURITY_KEYWORDS.some(keyword => term.includes(keyword) || keyword.includes(term))
      );
      
      if (hasSecurityKeyword) {
        securityInfoText = this.extractSecurityInfo(openApiSchema, sectionSize);
        if (securityInfoText) {
          remainingSections = Math.max(1, remainingSections - 1);
        }
      }
      
      const isDocumentationShort = !documentation || documentation.length <= sectionSize;
      const maxOperationSections = isDocumentationShort 
        ? remainingSections 
        : Math.ceil(remainingSections / 2);
      
      const openApiSearchIndex = this.buildOperationSearchIndex(openApiSchema, sectionSize);
      const topOperations = this.scoreAndRankOperations(openApiSearchIndex, searchTerms, maxOperationSections);
      
      if (topOperations.length > 0) {
        openApiOperationsText = topOperations
          .map(op => `[${op.method} ${op.path}]\n${op.operation}`)
          .join('\n\n---\n\n');
        remainingSections = remainingSections - topOperations.length;
      }
    }

    const sections: Array<{ content: string; searchableContent: string; index: number; sectionIndex: number }> = [];

    if (documentation && documentation.length > 0) {
      for (let i = 0; i < documentation.length; i += sectionSize) {
        const content = documentation.slice(i, Math.min(i + sectionSize, documentation.length));
        sections.push({
          content,
          searchableContent: content.toLowerCase(),
          index: i,
          sectionIndex: sections.length
        });
      }
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
      .slice(0, remainingSections)
      .filter(section => section.score > 0);

    if (topSections.length === 0 && !openApiOperationsText && !securityInfoText) {
      return '';
    }

    topSections.sort((a, b) => a.index - b.index);

    let result = topSections.map(section => section.content).join('\n\n');

    if (securityInfoText) {
      result = '\n\n=== SECURITY ===\n\n' + securityInfoText + (result ? '\n\n=== DOCUMENTATION ===\n\n' + result : '');
    }

    if (openApiOperationsText) {
      result = result + '\n\n=== OPENAPI OPERATIONS ===\n\n' + openApiOperationsText;
    }

    const maxExpectedLength = maxSections * sectionSize;
    const documentationResult = result.length > maxExpectedLength
      ? result.slice(0, maxExpectedLength)
      : result;
    logMessage('debug', `Found ${documentationResult.length} characters of documentation for query: "${searchQuery}"`, this.metadata);
    return sanitizeUnpairedSurrogates(documentationResult);
  }

  private extractSecurityInfo(openApiSchema: string, sectionSize: number): string {
    try {
      const spec = JSON.parse(openApiSchema);
      
      if (spec.resources) {
        return '';
      }
      
      let securityInfo: any = {};
      
      if (spec.components?.securitySchemes) {
        securityInfo.securitySchemes = spec.components.securitySchemes;
      }
      
      if (spec.securityDefinitions) {
        securityInfo.securityDefinitions = spec.securityDefinitions;
      }
      
      if (spec.security) {
        securityInfo.security = spec.security;
      }
      
      if (Object.keys(securityInfo).length === 0) {
        return '';
      }
      
      const securityJson = JSON.stringify(securityInfo, null, 2);
      return securityJson.length > sectionSize 
        ? securityJson.slice(0, sectionSize)
        : securityJson;
    } catch (error) {
      return '';
    }
  }

  private scoreAndRankOperations(
    operations: Array<{ searchText: string; operation: any; path: string; method: string }>,
    searchTerms: string[],
    maxOperations: number
  ): Array<{ searchText: string; operation: any; path: string; method: string; score: number }> {
    const operationScores = new Map<number, number>();
    
    for (const term of searchTerms) {
      operations.forEach((op, idx) => {
        let score = 0;
        const content = op.searchText;
        
        const wordBoundaryRegex = new RegExp(`\\b${term}\\b`, 'g');
        const exactMatches = (content.match(wordBoundaryRegex) || []).length;
        score += exactMatches * 3 * term.length;
        
        if (exactMatches === 0 && content.includes(term)) {
          score += term.length;
        }
        
        if (score > 0) {
          operationScores.set(idx, (operationScores.get(idx) || 0) + score);
        }
      });
    }
    
    return operations
      .map((op, idx) => ({ ...op, score: operationScores.get(idx) || 0 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, maxOperations)
      .filter(op => op.score > 0);
  }

  private buildOperationSearchIndex(openApiSchema: string, sectionSize: number = 2000): Array<{
    searchText: string;
    operation: any;
    path: string;
    method: string;
  }> {
    try {
      const spec = JSON.parse(openApiSchema);
      
      if (spec.resources) {
        // Google Discovery schema
        return this.buildGoogleDiscoveryIndex(spec.resources, sectionSize);
      }
      
      if (!spec.paths) {
        // not a valid OpenAPI spec
        return [];
      }

      // valid OpenAPI spec
      
      const operations: Array<{
        searchText: string;
        operation: any;
        path: string;
        method: string;
      }> = [];
      
      for (const [path, pathItem] of Object.entries<any>(spec.paths)) {
        if (!pathItem || typeof pathItem !== 'object') continue;
        
        for (const method of ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace']) {
          const operation = pathItem[method];
          if (!operation) continue;
          
          const searchParts: string[] = [
            `PATH:${path}`,
            `METHOD:${method}`,
          ];
          
          if (operation.operationId) {
            searchParts.push(`OPID:${operation.operationId}`);
          }
          
          if (operation.tags && Array.isArray(operation.tags)) {
            searchParts.push(`TAG:${operation.tags.join(' ')}`);
          }
          
          if (operation.summary) {
            searchParts.push(`SUMMARY:${operation.summary}`);
          }
          
          if (operation.description) {
            searchParts.push(`DESC:${operation.description}`);
          }
          
          if (operation.parameters && Array.isArray(operation.parameters)) {
            const paramNames = operation.parameters
              .map((p: any) => p.name || '')
              .filter((name: string) => name)
              .join(' ');
            if (paramNames) {
              searchParts.push(`PARAMS:${paramNames}`);
            }
          }
          
          const operationStr = JSON.stringify(operation);
          const truncatedOperation = operationStr.length > sectionSize 
            ? operationStr.slice(0, sectionSize)
            : operationStr;
          
          operations.push({
            searchText: searchParts.join(' ').toLowerCase(),
            operation: truncatedOperation,
            path,
            method: method.toUpperCase()
          });
        }
      }
      
      return operations;
    } catch (error) {
      return [];
    }
  }

  private buildGoogleDiscoveryIndex(resources: Record<string, any>, sectionSize: number = 2000): Array<{
    searchText: string;
    operation: any;
    path: string;
    method: string;
  }> {
    const operations: Array<{
      searchText: string;
      operation: any;
      path: string;
      method: string;
    }> = [];

    const processResource = (resource: any) => {
      if (resource.methods) {
        for (const [methodName, method] of Object.entries<any>(resource.methods)) {
          if (!method) continue;

          const searchParts: string[] = [];

          if (method.id) {
            searchParts.push(`ID:${method.id}`);
          }

          if (method.path) {
            searchParts.push(`PATH:${method.path}`);
          }

          if (method.httpMethod) {
            searchParts.push(`METHOD:${method.httpMethod.toLowerCase()}`);
          }

          if (method.description) {
            searchParts.push(`DESC:${method.description}`);
          }

          if (method.parameters) {
            const paramNames = Object.keys(method.parameters).join(' ');
            if (paramNames) {
              searchParts.push(`PARAMS:${paramNames}`);
            }
          }

          const operationStr = JSON.stringify(method);
          const truncatedOperation = operationStr.length > sectionSize 
            ? operationStr.slice(0, sectionSize)
            : operationStr;
          
          operations.push({
            searchText: searchParts.join(' ').toLowerCase(),
            operation: truncatedOperation,
            path: method.path || method.id || methodName,
            method: method.httpMethod || 'UNKNOWN'
          });
        }
      }

      if (resource.resources) {
        for (const nestedResource of Object.values<any>(resource.resources)) {
          processResource(nestedResource);
        }
      }
    };

    for (const resource of Object.values(resources)) {
      processResource(resource);
    }

    return operations;
  }
}
