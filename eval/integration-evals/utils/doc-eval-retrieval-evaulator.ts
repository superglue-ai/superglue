import { DataStore } from '../../../packages/core/datastore/types.js';
import { logMessage } from '../../../packages/core/utils/logs.js';
import { DocumentationSearch } from '../../../packages/core/documentation/documentation-search.js';
import { LanguageModel } from '../../../packages/core/llm/language-model.js';
import { DocumentationSite } from './doc-eval-fetcher.js';
import * as fs from 'fs';
import * as path from 'path';

export interface EvaluationResult {
  siteId: string;
  siteName: string;
  questionsAnswered: number;
  totalQuestions: number;
  evaluationTime: number;
  details: QuestionResult[];
}

export interface QuestionResult {
  question: string;
  success: boolean;
  retrievedContent?: string;
  retrievedContentSize?: number;
  searchQuery?: string;
  retrievalScore?: number;
  endpointScore?: number;
  completenessScore?: number;
  reasoning?: string;
  error?: string;
}

export interface EvaluationSummary {
  totalSites: number;
  totalQuestions: number;
  questionsAnswered: number;
  totalTime: number;
  averageScore: number;
  averageRetrievalScore: number;
  averageEndpointScore: number;
  averageCompletenessScore: number;
}

/**
 * Handles evaluation of documentation retrieval against test questions
 */
export class DocumentationEvaluator {
  private metadata = { orgId: 'documentation-eval', userId: 'system' };
  private csvLogPath: string;

  getCsvPath(): string {
    return this.csvLogPath;
  }

  constructor(private datastore: DataStore, private orgId: string) {
    this.metadata = { orgId, userId: 'system' };
    
    // Create CSV log file with timestamp in results folder
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const isCompiledDist = import.meta.url.includes('/dist/');
    const scriptDir = path.dirname(new URL(import.meta.url).pathname);
    const resultsDir = isCompiledDist 
      ? path.join(scriptDir, '../../../../eval/documentation-crawl-and-fetch/results')
      : path.join(scriptDir, '../results');
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }
    this.csvLogPath = path.join(resultsDir, `evaluation-debug-${timestamp}.csv`);
    
    // Initialize CSV with headers
    this.initializeCsvLog();
  }

  /**
   * Initialize CSV log file with headers
   */
  private initializeCsvLog(): void {
    const headers = [
      'timestamp',
      'siteId',
      'siteName',
      'question',
      'searchQuery',
      'searchResultsSizeKB',
      'searchResultsPreview',
      'success',
      'retrievalScore',
      'endpointScore',
      'completenessScore',
      'reasoning',
      'error'
    ].join(',');
    
    fs.writeFileSync(this.csvLogPath, headers + '\n');
    logMessage('info', `📄 Debug CSV log initialized: ${this.csvLogPath}`, this.metadata);
  }

  /**
   * Log evaluation result to CSV file
   */
  private logToCsv(siteId: string, siteName: string, result: QuestionResult): void {
    const timestamp = new Date().toISOString();
    const searchResultsSizeKB = result.retrievedContentSize ? Math.round(result.retrievedContentSize / 1024) : 0;
    const searchResultsPreview = result.retrievedContent 
      ? result.retrievedContent.substring(0, 2000).replace(/[\r\n]/g, ' ').replace(/,/g, ';') 
      : '';
    
    const row = [
      timestamp,
      siteId,
      `"${siteName}"`,
      `"${result.question.replace(/"/g, '""')}"`,
      `"${result.searchQuery?.replace(/"/g, '""') || ''}"`,
      searchResultsSizeKB,
      `"${searchResultsPreview}"`,
      result.success ? 'true' : 'false',
      result.retrievalScore || 0,
      result.endpointScore || 0,
      result.completenessScore || 0,
      `"${result.reasoning?.replace(/"/g, '""') || ''}"`,
      `"${result.error?.replace(/"/g, '""') || ''}"`
    ].join(',');
    
    fs.appendFileSync(this.csvLogPath, row + '\n');
  }

  /**
   * Evaluate documentation retrieval for all sites
   */
  async evaluateAllSites(sites: DocumentationSite[]): Promise<EvaluationSummary> {
    const startTime = Date.now();
    const results: EvaluationResult[] = [];

    logMessage('info', `🔍 Starting evaluation for ${sites.length} sites`, this.metadata);

    for (const site of sites) {
      const result = await this.evaluateSite(site);
      results.push(result);
      
      const score = (result.questionsAnswered / result.totalQuestions * 100).toFixed(1);
      
      // Calculate average retrieval score for this site
      const siteResults = result.details.filter(d => d.success && d.retrievalScore !== undefined);
      const avgRetrievalScore = siteResults.length > 0 
        ? (siteResults.reduce((sum, r) => sum + (r.retrievalScore || 0), 0) / siteResults.length).toFixed(1)
        : '0.0';
      
      logMessage('info', `📝 ${site.name}: ${result.questionsAnswered}/${result.totalQuestions} questions (${score}%) - Avg Retrieval: ${avgRetrievalScore}%`, this.metadata);
    }

    const summary = this.generateSummary(results, Date.now() - startTime);
    this.logSummary(summary);
    
    // Log CSV file location
    logMessage('info', `📄 Detailed evaluation results saved to: ${this.csvLogPath}`, this.metadata);

    return summary;
  }

  /**
   * Evaluate documentation retrieval for a single site
   */
  private async evaluateSite(site: DocumentationSite): Promise<EvaluationResult> {
    const evaluationStartTime = Date.now();
    const details: QuestionResult[] = [];

    try {
      // Get stored documentation for this site
      const integrationId = `doc-eval-${site.id}`;
      const integration = await this.datastore.getIntegration({ 
        id: integrationId, 
        includeDocs: true, 
        orgId: this.orgId 
      });

      if (!integration || (!integration.documentation && !integration.openApiSchema)) {
        // No documentation found - mark all questions as failed
        for (const question of site.testQuestions) {
          const result = {
            question,
            success: false,
            error: 'No documentation found'
          };
          details.push(result);
          
          // Log to CSV for debugging
          this.logToCsv(site.id, site.name, result);
        }
      } else {
        // Evaluate each question
        for (const question of site.testQuestions) {
          const result = await this.evaluateQuestion(question, integration.documentation, integration.openApiSchema);
          details.push(result);
          
          // Log to CSV for debugging
          this.logToCsv(site.id, site.name, result);
        }
      }

      const questionsAnswered = details.filter(d => d.success).length;

      return {
        siteId: site.id,
        siteName: site.name,
        questionsAnswered,
        totalQuestions: site.testQuestions.length,
        evaluationTime: Date.now() - evaluationStartTime,
        details
      };

    } catch (error) {
      // Error evaluating site - mark all questions as failed
      for (const question of site.testQuestions) {
        details.push({
          question,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }

      return {
        siteId: site.id,
        siteName: site.name,
        questionsAnswered: 0,
        totalQuestions: site.testQuestions.length,
        evaluationTime: Date.now() - evaluationStartTime,
        details
      };
    }
  }

  /**
   * Evaluate a single question against documentation using RAG evaluation
   */
  private async evaluateQuestion(question: string, documentation: string, openApiSchema: string): Promise<QuestionResult> {
    try {
      // Use LanguageModel as a static object

      // Step 1: Generate search query using OpenAI
      const searchQueryPrompt = `Given this user question about API documentation: "${question}"

Generate a concise search query that would help find relevant API documentation sections to answer this question. Focus on:
- API endpoint names
- Key technical terms
- Specific functionality mentioned
- Data structures or parameters

Return only the search query, no additional text.`;

      const searchQueryResponse = await LanguageModel.generateText([{ role: 'user', content: searchQueryPrompt }], 0);
      const searchQuery = searchQueryResponse.response;
      
      // Step 2: Use DocumentationSearch for targeted search
      const documentationSearch = new DocumentationSearch({ orgId: this.orgId });
      const searchResults = documentationSearch.extractRelevantSections(
        documentation,
        searchQuery,
        5,
        2000,
        openApiSchema
      );

      const retrievedContentSize = Buffer.byteLength(searchResults, 'utf8');
      logMessage('debug', `Retrieved ${Math.round(retrievedContentSize / 1024)}KB of content for query: "${searchQuery}"`, this.metadata);

      if (!searchResults || searchResults.trim().length === 0) {
        return {
          question,
          success: false,
          searchQuery,
          retrievedContentSize: 0,
          error: 'No relevant content found'
        };
      }

      // Step 3: Evaluate the search results using focused API documentation metrics
      const evaluationPrompt = `You are an expert at evaluating API documentation retrieval systems. Focus specifically on what developers need to successfully make API calls.

USER QUESTION: "${question}"
SEARCH QUERY USED: "${searchQuery}"
RETRIEVED DOCUMENTATION:
${searchResults}

Evaluate how well the retrieved documentation helps answer the user's question using these focused metrics (score 0-100):

1. RETRIEVAL SCORE: Overall quality of the retrieved content for answering the question. Higher if the right content is found, even with some extra information. Lower if completely wrong or missing key content.
   - Example low score (<20): Completely wrong content retrieved (e.g., user asks about payment refunds, but only subscription management docs are returned)
   - Example high score (>80): Correct endpoint and relevant information is present, possibly with some extra context

2. ENDPOINT SCORE: Does the documentation clearly identify which API endpoint to use? Higher if the correct endpoint is mentioned (e.g., POST /v1/customers). Lower if endpoint is unclear or wrong.
   - Example low score (<20): No endpoint mentioned, or only tangentially related endpoints shown
   - Example high score (>80): Correct endpoint clearly shown (e.g., "POST /v1/customers" for customer creation)

3. COMPLETENESS SCORE: Does the documentation provide sufficient detail to make the API call? Higher if it includes required/optional parameters, examples, or clear usage instructions. Lower if it's just high-level descriptions.
   - Example low score (<20): Only mentions endpoint exists but no parameters or usage details
   - Example high score (>80): Shows required/optional parameters, types, and ideally includes an example

Note: It's OK if there's additional information about other endpoints - focus on whether the RIGHT information is present and useful.

Provide your evaluation in this exact JSON format:
{
  "retrievalScore": <0-100>,
  "endpointScore": <0-100>, 
  "completenessScore": <0-100>,
  "reasoning": "Brief explanation focusing on endpoint identification and parameter details"
}`;

      const evaluationResponseObj = await LanguageModel.generateText([{ role: 'user', content: evaluationPrompt }], 0);
      const evaluationResponse = evaluationResponseObj.response;
      
      // Parse the structured response
      let evaluationScores;
      try {
        evaluationScores = JSON.parse(evaluationResponse);
      } catch (parseError) {
        logMessage('warn', `Failed to parse evaluation response: ${evaluationResponse}`, this.metadata);
        // Fallback to basic success/failure
        return {
          question,
          success: true,
          searchQuery,
          retrievedContent: searchResults,
          retrievedContentSize,
          retrievalScore: 50,
          endpointScore: 50,
          completenessScore: 50,
          reasoning: 'Failed to parse LLM response - using fallback scores'
        };
      }

      return {
        question,
        success: true,
        searchQuery,
        retrievedContent: searchResults,
        retrievedContentSize,
        retrievalScore: evaluationScores.retrievalScore || 0,
        endpointScore: evaluationScores.endpointScore || 0,
        completenessScore: evaluationScores.completenessScore || 0,
        reasoning: evaluationScores.reasoning || ''
      };

    } catch (error) {
      return {
        question,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Generate evaluation summary with RAG metrics
   */
  private generateSummary(results: EvaluationResult[], totalTime: number): EvaluationSummary {
    const totalQuestions = results.reduce((sum, r) => sum + r.totalQuestions, 0);
    const questionsAnswered = results.reduce((sum, r) => sum + r.questionsAnswered, 0);
    const averageScore = totalQuestions > 0 ? (questionsAnswered / totalQuestions) * 100 : 0;

    // Calculate focused API documentation metrics from all successful evaluations
    const allQuestionResults = results.flatMap(r => r.details.filter(d => d.success && d.retrievalScore !== undefined));
    
    const averageRetrievalScore = allQuestionResults.length > 0 
      ? allQuestionResults.reduce((sum, r) => sum + (r.retrievalScore || 0), 0) / allQuestionResults.length 
      : 0;
    
    const averageEndpointScore = allQuestionResults.length > 0 
      ? allQuestionResults.reduce((sum, r) => sum + (r.endpointScore || 0), 0) / allQuestionResults.length 
      : 0;
    
    const averageCompletenessScore = allQuestionResults.length > 0 
      ? allQuestionResults.reduce((sum, r) => sum + (r.completenessScore || 0), 0) / allQuestionResults.length 
      : 0;

    return {
      totalSites: results.length,
      totalQuestions,
      questionsAnswered,
      totalTime,
      averageScore,
      averageRetrievalScore,
      averageEndpointScore,
      averageCompletenessScore
    };
  }

  /**
   * Log evaluation summary with focused API documentation metrics
   */
  private logSummary(summary: EvaluationSummary): void {
    const score = summary.averageScore.toFixed(1);
    const retrievalScore = summary.averageRetrievalScore.toFixed(1);
    const endpointScore = summary.averageEndpointScore.toFixed(1);
    const completenessScore = summary.averageCompletenessScore.toFixed(1);
    const totalTimeSec = (summary.totalTime / 1000).toFixed(1);

    logMessage('info', `📊 Evaluation Summary: ${summary.questionsAnswered}/${summary.totalQuestions} questions answered (${score}%)`, this.metadata);
    logMessage('info', `🎯 API Doc Scores - Retrieval: ${retrievalScore}%, Endpoint: ${endpointScore}%, Completeness: ${completenessScore}%`, this.metadata);
    logMessage('info', `⏱️  Total time: ${totalTimeSec}s`, this.metadata);
  }
}
