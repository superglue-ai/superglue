import { DataStore } from '../../../datastore/types.js';
import { logMessage } from '../../../utils/logs.js';
import { Documentation } from '../../../utils/documentation.js';
import { LanguageModel } from '../../../llm/llm.js';
import { DocumentationSite } from './documentation-fetcher.js';
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
  ragScore?: number;
  relevanceScore?: number;
  completenessScore?: number;
  accuracyScore?: number;
  error?: string;
}

export interface EvaluationSummary {
  totalSites: number;
  totalQuestions: number;
  questionsAnswered: number;
  totalTime: number;
  averageScore: number;
  averageRagScore: number;
  averageRelevanceScore: number;
  averageCompletenessScore: number;
  averageAccuracyScore: number;
}

/**
 * Handles evaluation of documentation retrieval against test questions
 */
export class DocumentationEvaluator {
  private metadata = { orgId: 'documentation-eval', userId: 'system' };
  private csvLogPath: string;

  constructor(private datastore: DataStore, private orgId: string) {
    this.metadata = { orgId, userId: 'system' };
    
    // Create CSV log file with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.csvLogPath = path.join(process.cwd(), `evaluation-debug-${timestamp}.csv`);
    
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
      'ragScore',
      'relevanceScore',
      'completenessScore',
      'accuracyScore',
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
      result.ragScore || 0,
      result.relevanceScore || 0,
      result.completenessScore || 0,
      result.accuracyScore || 0,
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
      
      // Calculate average RAG score for this site
      const siteRagResults = result.details.filter(d => d.success && d.ragScore !== undefined);
      const avgRagScore = siteRagResults.length > 0 
        ? (siteRagResults.reduce((sum, r) => sum + (r.ragScore || 0), 0) / siteRagResults.length).toFixed(1)
        : '0.0';
      
      logMessage('info', `📝 ${site.name}: ${result.questionsAnswered}/${result.totalQuestions} questions (${score}%) - Avg RAG: ${avgRagScore}%`, this.metadata);
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

      if (!integration || !integration.documentation) {
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
          const result = await this.evaluateQuestion(question, integration.documentation);
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
  private async evaluateQuestion(question: string, documentation: string): Promise<QuestionResult> {
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

      const searchQueryResponse = await LanguageModel.generateText([{ role: 'user', content: searchQueryPrompt }], 1.0);
      const searchQuery = searchQueryResponse.response;
      
      // Step 2: Use Documentation.extractRelevantSections for targeted search
      const searchResults = Documentation.extractRelevantSections(
        documentation,
        searchQuery,
        5,
        2000
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

      // Step 3: Evaluate the search results using RAG metrics
      const evaluationPrompt = `You are an expert at evaluating RAG (Retrieval-Augmented Generation) systems for API documentation.

USER QUESTION: "${question}"
SEARCH QUERY USED: "${searchQuery}"
RETRIEVED DOCUMENTATION:
${searchResults}

Evaluate how well the retrieved documentation can answer the user's question using these RAG metrics (score 0-100):

1. RELEVANCE: How relevant is the retrieved content to the user's question?
2. COMPLETENESS: Does the retrieved content contain sufficient information to fully answer the question?
3. ACCURACY: Is the information in the retrieved content accurate and reliable?
4. OVERALL RAG SCORE: Combined assessment of retrieval quality

Provide your evaluation in this exact JSON format:
{
  "relevanceScore": <0-100>,
  "completenessScore": <0-100>, 
  "accuracyScore": <0-100>,
  "ragScore": <0-100>,
  "reasoning": "Brief explanation of scores"
}`;

      const evaluationResponseObj = await LanguageModel.generateText([{ role: 'user', content: evaluationPrompt }], 1.0);
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
          ragScore: 50,
          relevanceScore: 50,
          completenessScore: 50,
          accuracyScore: 50
        };
      }

      return {
        question,
        success: true,
        searchQuery,
        retrievedContent: searchResults,
        retrievedContentSize,
        ragScore: evaluationScores.ragScore || 0,
        relevanceScore: evaluationScores.relevanceScore || 0,
        completenessScore: evaluationScores.completenessScore || 0,
        accuracyScore: evaluationScores.accuracyScore || 0
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

    // Calculate RAG metrics from all successful evaluations
    const allQuestionResults = results.flatMap(r => r.details.filter(d => d.success && d.ragScore !== undefined));
    
    const averageRagScore = allQuestionResults.length > 0 
      ? allQuestionResults.reduce((sum, r) => sum + (r.ragScore || 0), 0) / allQuestionResults.length 
      : 0;
    
    const averageRelevanceScore = allQuestionResults.length > 0 
      ? allQuestionResults.reduce((sum, r) => sum + (r.relevanceScore || 0), 0) / allQuestionResults.length 
      : 0;
    
    const averageCompletenessScore = allQuestionResults.length > 0 
      ? allQuestionResults.reduce((sum, r) => sum + (r.completenessScore || 0), 0) / allQuestionResults.length 
      : 0;
    
    const averageAccuracyScore = allQuestionResults.length > 0 
      ? allQuestionResults.reduce((sum, r) => sum + (r.accuracyScore || 0), 0) / allQuestionResults.length 
      : 0;

    return {
      totalSites: results.length,
      totalQuestions,
      questionsAnswered,
      totalTime,
      averageScore,
      averageRagScore,
      averageRelevanceScore,
      averageCompletenessScore,
      averageAccuracyScore
    };
  }

  /**
   * Log evaluation summary with RAG metrics
   */
  private logSummary(summary: EvaluationSummary): void {
    const score = summary.averageScore.toFixed(1);
    const ragScore = summary.averageRagScore.toFixed(1);
    const relevanceScore = summary.averageRelevanceScore.toFixed(1);
    const completenessScore = summary.averageCompletenessScore.toFixed(1);
    const accuracyScore = summary.averageAccuracyScore.toFixed(1);
    const totalTimeSec = (summary.totalTime / 1000).toFixed(1);

    logMessage('info', `📊 Evaluation Summary: ${summary.questionsAnswered}/${summary.totalQuestions} questions answered (${score}%)`, this.metadata);
    logMessage('info', `🎯 RAG Scores - Overall: ${ragScore}%, Relevance: ${relevanceScore}%, Completeness: ${completenessScore}%, Accuracy: ${accuracyScore}%`, this.metadata);
    logMessage('info', `⏱️  Total time: ${totalTimeSec}s`, this.metadata);
  }
}
