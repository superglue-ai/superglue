import * as fs from 'fs';
import * as path from 'path';
import { logMessage } from '../../../utils/logs.js';

interface BenchmarkFetchResult {
  siteName: string;
  pages: number;
  docSizeMB: number;
  hasOpenAPI: boolean;
  openApiSizeKB: number;
  docFetchSPerPage: number;
  openApiFetchS: number;
}

interface BenchmarkEvalResult {
  siteName: string;
  retrievalScore: number;
  endpointScore: number;
  completenessScore: number;
}

const SIGNIFICANT_CHANGE_THRESHOLD = 10;

export class BenchmarkComparer {
  private metadata = { orgId: 'documentation-eval', userId: 'system' };
  
  constructor(private benchmarkDir: string) {}

  compareFetchResults(currentCsvPath: string): void {
    const benchmarkPath = path.join(this.benchmarkDir, 'fetch-results-baseline.csv');
    
    if (!fs.existsSync(benchmarkPath)) {
      logMessage('info', '⚠️  No fetch benchmark found - skipping comparison', this.metadata);
      return;
    }

    const benchmark = this.parseFetchCsv(benchmarkPath);
    const current = this.parseFetchCsv(currentCsvPath);

    // Only compare sites that exist in both
    const commonSites = Object.keys(current).filter(site => benchmark[site]);
    const newSites = Object.keys(current).filter(site => !benchmark[site]);
    
    if (commonSites.length === 0) {
      logMessage('info', '⚠️  No common sites between current run and benchmark - skipping comparison', this.metadata);
      if (newSites.length > 0) {
        logMessage('info', `ℹ️  New sites not in benchmark: ${newSites.join(', ')}`, this.metadata);
      }
      return;
    }

    if (newSites.length > 0) {
      logMessage('info', `ℹ️  New sites not in benchmark (skipping): ${newSites.join(', ')}`, this.metadata);
    }

    logMessage('info', 'Fetch Performance vs Benchmark:', this.metadata);
    logMessage('info', '═════════════════════════════════════════════════════════════════', this.metadata);

    let significantChanges = 0;
    const changes: string[] = [];

    for (const siteName of commonSites) {
      const b = benchmark[siteName];
      const c = current[siteName];

      const docSizeChange = ((c.docSizeMB - b.docSizeMB) / b.docSizeMB) * 100;

      if (Math.abs(docSizeChange) > SIGNIFICANT_CHANGE_THRESHOLD) {
        const emoji = docSizeChange > 0 ? '📈' : '📉';
        changes.push(`${emoji} ${siteName}: Doc size ${docSizeChange > 0 ? '+' : ''}${docSizeChange.toFixed(1)}%`);
        significantChanges++;
      }
    }

    if (significantChanges === 0) {
      logMessage('info', `✅ No significant changes from benchmark (compared ${commonSites.length} sites)`, this.metadata);
    } else {
      for (const change of changes) {
        logMessage('info', change, this.metadata);
      }
    }
    logMessage('info', '═════════════════════════════════════════════════════════════════\n', this.metadata);
  }

  compareEvalResults(currentCsvPath: string): void {
    const benchmarkPath = path.join(this.benchmarkDir, 'evaluation-debug-baseline.csv');
    
    if (!fs.existsSync(benchmarkPath)) {
      logMessage('info', '⚠️  No eval benchmark found - skipping comparison', this.metadata);
      return;
    }

    const benchmark = this.parseEvalCsv(benchmarkPath);
    const current = this.parseEvalCsv(currentCsvPath);

    // Only compare sites that exist in both
    const commonSites = Object.keys(current).filter(site => benchmark[site]);
    const newSites = Object.keys(current).filter(site => !benchmark[site]);
    
    if (commonSites.length === 0) {
      logMessage('info', '⚠️  No common sites between current run and benchmark - skipping comparison', this.metadata);
      if (newSites.length > 0) {
        logMessage('info', `ℹ️  New sites not in benchmark: ${newSites.join(', ')}`, this.metadata);
      }
      return;
    }

    if (newSites.length > 0) {
      logMessage('info', `ℹ️  New sites not in benchmark (skipping): ${newSites.join(', ')}`, this.metadata);
    }

    logMessage('info', 'Eval Quality vs Benchmark:', this.metadata);
    logMessage('info', '═════════════════════════════════════════════════════════════════', this.metadata);

    let significantChanges = 0;
    const changes: { site: string; metric: string; change: number; emoji: string }[] = [];

    for (const siteName of commonSites) {
      const b = benchmark[siteName];
      const c = current[siteName];

      const retrievalChange = c.retrievalScore - b.retrievalScore;
      const endpointChange = c.endpointScore - b.endpointScore;
      const completenessChange = c.completenessScore - b.completenessScore;

      if (Math.abs(retrievalChange) > SIGNIFICANT_CHANGE_THRESHOLD) {
        const emoji = retrievalChange > 0 ? '📈' : '📉';
        changes.push({ site: siteName, metric: 'Retrieval', change: retrievalChange, emoji });
        significantChanges++;
      }

      if (Math.abs(endpointChange) > SIGNIFICANT_CHANGE_THRESHOLD) {
        const emoji = endpointChange > 0 ? '📈' : '📉';
        changes.push({ site: siteName, metric: 'Endpoint', change: endpointChange, emoji });
        significantChanges++;
      }

      if (Math.abs(completenessChange) > SIGNIFICANT_CHANGE_THRESHOLD) {
        const emoji = completenessChange > 0 ? '📈' : '📉';
        changes.push({ site: siteName, metric: 'Completeness', change: completenessChange, emoji });
        significantChanges++;
      }
    }

    if (significantChanges === 0) {
      logMessage('info', `✅ No significant changes from benchmark (compared ${commonSites.length} sites)`, this.metadata);
    } else {
      // Group by site and show all changes
      const bySite = new Map<string, typeof changes>();
      for (const change of changes) {
        if (!bySite.has(change.site)) {
          bySite.set(change.site, []);
        }
        bySite.get(change.site)!.push(change);
      }

      // Sort by total absolute change
      const sortedSites = Array.from(bySite.entries())
        .map(([site, siteChanges]) => ({
          site,
          changes: siteChanges,
          totalChange: siteChanges.reduce((sum, c) => sum + Math.abs(c.change), 0)
        }))
        .sort((a, b) => b.totalChange - a.totalChange);

      for (const { site, changes: siteChanges } of sortedSites) {
        const changeStr = siteChanges
          .map(c => `${c.metric} ${c.change > 0 ? '+' : ''}${c.change.toFixed(0)}`)
          .join(', ');
        logMessage('info', `${siteChanges[0].emoji} ${site}: ${changeStr}`, this.metadata);
      }
    }
    logMessage('info', '═════════════════════════════════════════════════════════════════\n', this.metadata);
  }

  private parseFetchCsv(csvPath: string): Record<string, BenchmarkFetchResult> {
    const content = fs.readFileSync(csvPath, 'utf-8');
    const lines = content.split('\n').slice(1); // Skip header
    const results: Record<string, BenchmarkFetchResult> = {};

    for (const line of lines) {
      if (!line.trim() || line.includes('AVERAGE')) continue;

      const parts = line.match(/(?:[^,"]+|"[^"]*")+/g);
      if (!parts || parts.length < 7) continue;

      const siteName = parts[0].replace(/^"|"$/g, '');
      results[siteName] = {
        siteName,
        pages: parseFloat(parts[1]),
        docSizeMB: parseFloat(parts[2]),
        hasOpenAPI: parts[3] === 'Yes',
        openApiSizeKB: parseFloat(parts[4]),
        docFetchSPerPage: parseFloat(parts[5]),
        openApiFetchS: parseFloat(parts[6])
      };
    }

    return results;
  }

  private parseEvalCsv(csvPath: string): Record<string, BenchmarkEvalResult> {
    const content = fs.readFileSync(csvPath, 'utf-8');
    const lines = content.split('\n').slice(1); // Skip header
    const results: Record<string, { scores: number[]; counts: number[] }> = {};

    for (const line of lines) {
      if (!line.trim()) continue;

      const parts = line.match(/(?:[^,]+|"[^"]*")+/g);
      if (!parts || parts.length < 11) continue;

      const siteName = parts[2].replace(/^"|"$/g, '');
      const retrievalScore = parseFloat(parts[8]);
      const endpointScore = parseFloat(parts[9]);
      const completenessScore = parseFloat(parts[10]);

      if (!results[siteName]) {
        results[siteName] = { scores: [0, 0, 0], counts: [0, 0, 0] };
      }

      if (!isNaN(retrievalScore)) {
        results[siteName].scores[0] += retrievalScore;
        results[siteName].counts[0]++;
      }
      if (!isNaN(endpointScore)) {
        results[siteName].scores[1] += endpointScore;
        results[siteName].counts[1]++;
      }
      if (!isNaN(completenessScore)) {
        results[siteName].scores[2] += completenessScore;
        results[siteName].counts[2]++;
      }
    }

    const averaged: Record<string, BenchmarkEvalResult> = {};
    for (const [siteName, data] of Object.entries(results)) {
      averaged[siteName] = {
        siteName,
        retrievalScore: data.counts[0] > 0 ? data.scores[0] / data.counts[0] : 0,
        endpointScore: data.counts[1] > 0 ? data.scores[1] / data.counts[1] : 0,
        completenessScore: data.counts[2] > 0 ? data.scores[2] / data.counts[2] : 0
      };
    }

    return averaged;
  }
}

