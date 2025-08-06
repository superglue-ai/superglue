#!/usr/bin/env node
import { integrations } from '@superglue/shared';
import fs from 'fs/promises';
import path from 'path';
import { Documentation } from '../utils/documentation.js';
import { ConfigLoader } from './utils/config-loader.js';
import { SetupManager } from './utils/setup-manager.js';

interface RankingTestResult {
    integrationId: string;
    integrationName: string;
    documentationUrl: string;
    keywords: string[];
    fetchedUrls: string[];
    rankedUrls: string[];
    documentationLength: number;
    debugLogs: string[];
    fuseOptions?: any;
}

// Hook into log messages to capture fetched URLs
class LogCapture {
    private urlsPerIntegration: Map<string, Set<string>> = new Map();
    private debugLogsPerIntegration: Map<string, string[]> = new Map();
    private currentIntegration: string = '';

    startCapture(integrationId: string) {
        this.currentIntegration = integrationId;
        if (!this.urlsPerIntegration.has(integrationId)) {
            this.urlsPerIntegration.set(integrationId, new Set());
        }
        if (!this.debugLogsPerIntegration.has(integrationId)) {
            this.debugLogsPerIntegration.set(integrationId, []);
        }
    }

    captureUrl(url: string) {
        if (this.currentIntegration) {
            const urls = this.urlsPerIntegration.get(this.currentIntegration);
            if (urls) {
                urls.add(url);
            }
        }
    }

    captureDebugLog(message: string) {
        if (this.currentIntegration) {
            const logs = this.debugLogsPerIntegration.get(this.currentIntegration);
            if (logs) {
                logs.push(message);
            }
        }
    }

    getUrls(integrationId: string): string[] {
        return Array.from(this.urlsPerIntegration.get(integrationId) || []);
    }

    getDebugLogs(integrationId: string): string[] {
        return this.debugLogsPerIntegration.get(integrationId) || [];
    }

    clear() {
        this.urlsPerIntegration.clear();
        this.debugLogsPerIntegration.clear();
        this.currentIntegration = '';
    }
}

const logCapture = new LogCapture();

// Import log emitter to intercept logs
import { LogEntry } from '@superglue/shared';
import { logEmitter } from '../utils/logs.js';

// Set up log listener
logEmitter.on('log', (logEntry: LogEntry) => {
    // Capture URLs from log messages
    if ((logCapture as any).currentIntegration) {
        const message = logEntry.message;
        const level = logEntry.level;

        // Only capture from "Successfully fetched content for" messages
        if (level === 'info' && message.includes('Successfully fetched content for')) {
            const urlMatch = message.match(/Successfully fetched content for (.+)$/);
            if (urlMatch && urlMatch[1].startsWith('http')) {
                logCapture.captureUrl(urlMatch[1].trim());
            }
        }

        // Capture debug logs about sitemaps and URL discovery
        if (level === 'debug' || level === 'info') {
            if (message.includes('sitemap') ||
                message.includes('URLs from sitemap') ||
                message.includes('URLs under') ||
                message.includes('Found') && message.includes('URLs') ||
                message.includes('Collected') && message.includes('URLs')) {
                logCapture.captureDebugLog(`[${level.toUpperCase()}] ${message}`);
            }
        }

        // Capture warnings about sitemap timeouts or failures
        if (level === 'warn' && (message.includes('sitemap') || message.includes('Sitemap'))) {
            logCapture.captureDebugLog(`[WARN] ${message}`);
        }
    }
});

async function testRealUrlRanking(fuseOptions?: any) {
    const configLoader = new ConfigLoader();
    const config = await configLoader.loadIntegrationTestConfig();
    const setupManager = new SetupManager('./.test-url-ranking-data', 'test-url-ranking-org', 'system');

    const results: RankingTestResult[] = [];
    const metadata = { orgId: 'test-url-ranking-org', userId: 'system' };

    try {
        // Get enabled integrations
        const enabledIntegrations = configLoader.getEnabledIntegrations(config);

        console.log(`\n🚀 Testing URL ranking for ${enabledIntegrations.length} integrations\n`);
        console.log(`Fuse options being tested:`, fuseOptions || 'default');
        console.log('='.repeat(80));

        // Process each integration individually to capture URLs
        for (const integrationConfig of enabledIntegrations) {
            // Get keywords from template
            const template = integrations[integrationConfig.id.toLowerCase()];
            const keywords = template?.keywords || [];

            if (!integrationConfig.documentationUrl || keywords.length === 0) {
                console.log(`\n⏭️  Skipping ${integrationConfig.name} - no doc URL or keywords`);
                continue;
            }

            console.log(`\n📚 Processing ${integrationConfig.name}...`);
            console.log(`   Doc URL: ${integrationConfig.documentationUrl}`);
            console.log(`   Keywords: ${keywords.slice(0, 5).join(', ')}${keywords.length > 5 ? '...' : ''}`);

            // Start capturing URLs for this integration
            logCapture.startCapture(integrationConfig.id);

            try {
                // Create Documentation instance with custom Fuse options if provided
                const docFetcher = new Documentation(
                    {
                        urlHost: integrationConfig.urlHost,
                        urlPath: integrationConfig.urlPath,
                        documentationUrl: integrationConfig.documentationUrl,
                        keywords: keywords
                    },
                    integrationConfig.credentials || {},
                    metadata
                );

                // If custom Fuse options provided, we'd need to modify Documentation class
                // For now, we'll fetch and process normally
                const startTime = Date.now();
                const docString = await docFetcher.fetchAndProcess();
                const fetchTime = Date.now() - startTime;

                // Stop capturing for this integration

                // Get captured URLs and debug logs
                const fetchedUrls = logCapture.getUrls(integrationConfig.id);
                const debugLogs = logCapture.getDebugLogs(integrationConfig.id);

                console.log(`   ✅ Fetched ${fetchedUrls.length} URLs in ${fetchTime}ms`);
                console.log(`   📄 Documentation length: ${docString?.length || 0} characters`);

                // Show relevant debug info
                const sitemapLogs = debugLogs.filter(log =>
                    log.includes('Found') || log.includes('Collected') || log.includes('sitemap'));
                if (sitemapLogs.length > 0) {
                    console.log(`   📋 Sitemap info:`);
                    sitemapLogs.slice(0, 3).forEach(log => {
                        console.log(`      ${log.substring(0, 100)}${log.length > 100 ? '...' : ''}`);
                    });
                }

                // Now test ranking with the fetched URLs
                if (fetchedUrls.length > 0) {
                    // Create a simple ranking test
                    const rankedUrls = rankUrlsWithFuse(fetchedUrls, keywords, fuseOptions);

                    results.push({
                        integrationId: integrationConfig.id,
                        integrationName: integrationConfig.name,
                        documentationUrl: integrationConfig.documentationUrl,
                        keywords: keywords,
                        fetchedUrls: fetchedUrls,
                        rankedUrls: rankedUrls,
                        documentationLength: docString?.length || 0,
                        debugLogs: debugLogs,
                        fuseOptions: fuseOptions
                    });

                    // Show top ranked URLs
                    console.log(`   🎯 Top 5 ranked URLs:`);
                    rankedUrls.slice(0, 5).forEach((url, idx) => {
                        console.log(`      ${idx + 1}. ${url}`);
                    });
                } else {
                    // Still save results even if no URLs fetched
                    results.push({
                        integrationId: integrationConfig.id,
                        integrationName: integrationConfig.name,
                        documentationUrl: integrationConfig.documentationUrl,
                        keywords: keywords,
                        fetchedUrls: [],
                        rankedUrls: [],
                        documentationLength: docString?.length || 0,
                        debugLogs: debugLogs,
                        fuseOptions: fuseOptions
                    });
                }

            } catch (error) {
                console.log(`   ❌ Error: ${error}`);
                const debugLogs = logCapture.getDebugLogs(integrationConfig.id);
                results.push({
                    integrationId: integrationConfig.id,
                    integrationName: integrationConfig.name,
                    documentationUrl: integrationConfig.documentationUrl,
                    keywords: keywords,
                    fetchedUrls: [],
                    rankedUrls: [],
                    documentationLength: 0,
                    debugLogs: debugLogs,
                    fuseOptions: fuseOptions
                });
            }
        }

        // Generate report
        await generateReport(results, fuseOptions);

    } finally {
        // Cleanup
        await setupManager.cleanup();
        logCapture.clear();
    }
}

function rankUrlsWithFuse(urls: string[], keywords: string[], customOptions?: any): string[] {
    // Import Fuse
    const Fuse = require('fuse.js');

    const defaultOptions = {
        includeScore: true,
        threshold: 0.4,
        location: 0,
        distance: 100,
        minMatchCharLength: 3,
        shouldSort: true,
        ignoreLocation: false,
        useExtendedSearch: false,
        ...customOptions
    };

    const NEGATIVE_KEYWORDS = [
        'signup', 'login', 'pricing', 'contact', 'support', 'cookie', 'webhook', 'webhooks',
        'privacy', 'terms', 'legal', 'policy', 'status', 'help', 'blog',
        'careers', 'about', 'press', 'news', 'events', 'partners', 'changelog',
        'changelogs', 'release notes', 'releases', 'updates', 'upgrade', 'upgrade notes',
    ];

    const scored = urls.map(url => {
        const urlLower = url.toLowerCase();
        let positiveScore = 0;
        let negativeScore = 0;

        for (const keyword of keywords) {
            const keywordLower = keyword.toLowerCase();
            if (urlLower.includes(keywordLower)) {
                const lengthPenalty = 50 / Math.max(url.length, 50);
                positiveScore += lengthPenalty;
            } else {
                // Fuzzy match with single-item Fuse
                const fuse = new Fuse([{ url, urlLower }], {
                    keys: ['urlLower'],
                    ...defaultOptions,
                    threshold: customOptions?.threshold || 0.4,
                    ignoreLocation: true
                });
                const results = fuse.search(keywordLower);
                if (results.length > 0) {
                    const lengthPenalty = 50 / Math.max(url.length, 50);
                    positiveScore += (1 - (results[0].score || 0)) * lengthPenalty * 0.5;
                }
            }
        }

        for (const negKeyword of NEGATIVE_KEYWORDS) {
            if (urlLower.includes(negKeyword)) {
                negativeScore += 2;
            }
        }

        return { url, score: positiveScore - negativeScore };
    });

    return scored
        .sort((a, b) => b.score - a.score)
        .map(item => item.url);
}

async function generateReport(results: RankingTestResult[], fuseOptions?: any) {
    const timestamp = new Date().toISOString();
    const reportDir = path.join(process.cwd(), 'test-reports');
    await fs.mkdir(reportDir, { recursive: true });

    // Generate JSON report
    const jsonReport = {
        timestamp,
        fuseOptions: fuseOptions || 'default',
        totalIntegrations: results.length,
        totalUrlsFetched: results.reduce((sum, r) => sum + r.fetchedUrls.length, 0),
        results: results.map(r => ({
            ...r,
            fetchedUrls: r.fetchedUrls.slice(0, 20), // Limit for readability
            rankedUrls: r.rankedUrls.slice(0, 10)
        }))
    };

    const jsonPath = path.join(reportDir, `real-url-ranking-${Date.now()}.json`);
    await fs.writeFile(jsonPath, JSON.stringify(jsonReport, null, 2));

    // Generate Markdown report
    let markdown = `# Real URL Ranking Test Report\n\n`;
    markdown += `**Generated:** ${timestamp}\n\n`;
    markdown += `**Fuse Options:** ${JSON.stringify(fuseOptions || 'default', null, 2)}\n\n`;
    markdown += `**Total Integrations:** ${results.length}\n`;
    markdown += `**Total URLs Fetched:** ${results.reduce((sum, r) => sum + r.fetchedUrls.length, 0)}\n\n`;

    for (const result of results) {
        markdown += `## ${result.integrationName} (${result.integrationId})\n\n`;
        markdown += `**Documentation URL:** ${result.documentationUrl}\n\n`;
        markdown += `**Keywords:** ${result.keywords.slice(0, 10).join(', ')}${result.keywords.length > 10 ? '...' : ''}\n\n`;
        markdown += `**URLs Fetched:** ${result.fetchedUrls.length}\n`;
        markdown += `**Documentation Size:** ${result.documentationLength} characters\n\n`;

        // Add debug logs section
        if (result.debugLogs && result.debugLogs.length > 0) {
            markdown += `### Debug Logs (Sitemap/URL Discovery):\n\n`;
            result.debugLogs.forEach(log => {
                markdown += `- ${log}\n`;
            });
            markdown += '\n';
        }

        if (result.fetchedUrls.length > 0) {
            markdown += `### All Fetched URLs (${result.fetchedUrls.length} total):\n\n`;
            result.fetchedUrls.forEach((url, idx) => {
                markdown += `${idx + 1}. \`${url}\`\n`;
            });
            markdown += '\n';

            markdown += `### Top 10 Ranked URLs (after re-ranking):\n\n`;
            result.rankedUrls.slice(0, 10).forEach((url, idx) => {
                markdown += `${idx + 1}. \`${url}\`\n`;
            });
        } else {
            markdown += `*No URLs fetched*\n`;
        }

        markdown += '\n---\n\n';
    }

    const mdPath = path.join(reportDir, `real-url-ranking-${Date.now()}.md`);
    await fs.writeFile(mdPath, markdown);

    console.log(`\n📊 Reports saved to:`);
    console.log(`   - ${jsonPath}`);
    console.log(`   - ${mdPath}`);
}

// Parse command line arguments for custom Fuse options
function parseArgs(): any {
    const args = process.argv.slice(2);
    if (args.length === 0) return undefined;

    const options: any = {};

    for (let i = 0; i < args.length; i += 2) {
        const key = args[i].replace('--', '');
        const value = args[i + 1];

        // Parse boolean and numeric values
        if (value === 'true') options[key] = true;
        else if (value === 'false') options[key] = false;
        else if (!isNaN(Number(value))) options[key] = Number(value);
        else options[key] = value;
    }

    return Object.keys(options).length > 0 ? options : undefined;
}

// Main execution
const fuseOptions = parseArgs();
testRealUrlRanking(fuseOptions).catch(console.error);