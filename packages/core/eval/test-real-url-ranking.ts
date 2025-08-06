#!/usr/bin/env node
import { integrations } from '@superglue/shared';
import fs from 'fs/promises';
import path from 'path';
import { Documentation, PlaywrightFetchingStrategy } from '../utils/documentation.js';
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

// Import log emitter to intercept logs - same as integration testing framework
import { logEmitter } from '../utils/logs.js';

async function testRealUrlRanking() {
    const configLoader = new ConfigLoader();
    const config = await configLoader.loadIntegrationTestConfig();
    const setupManager = new SetupManager('./.test-url-ranking-data', 'test-url-ranking-org', 'system');

    const results: RankingTestResult[] = [];
    const metadata = { orgId: 'test-url-ranking-org', userId: 'system' };

    try {
        // Get enabled integrations
        const enabledIntegrations = configLoader.getEnabledIntegrations(config);

        console.log(`\n🚀 Testing URL ranking for ${enabledIntegrations.length} integrations\n`);
        console.log(`Using core documentation ranking logic (no fuzzy matching)`);
        console.log('='.repeat(80));

        // Process each integration individually to capture URLs
        for (const integrationConfig of enabledIntegrations) {
            // Get keywords from template
            const template = integrations[integrationConfig.id.toLowerCase()];
            const keywords = template?.keywords || [];

            // Debug logging for PostHog specifically
            if (integrationConfig.id.toLowerCase() === 'posthog') {
                console.log(`\n🔍 DEBUG PostHog:`);
                console.log(`   Integration ID: ${integrationConfig.id}`);
                console.log(`   Documentation URL: ${integrationConfig.documentationUrl}`);
                console.log(`   Template found: ${!!template}`);
                console.log(`   Keywords length: ${keywords.length}`);
                console.log(`   Keywords: ${keywords.slice(0, 3).join(', ')}`);
            }

            if (!integrationConfig.documentationUrl || keywords.length === 0) {
                console.log(`\n⏭️  Skipping ${integrationConfig.name} - no doc URL or keywords`);
                if (integrationConfig.id.toLowerCase() === 'posthog') {
                    console.log(`   PostHog skip reason: docUrl=${!!integrationConfig.documentationUrl}, keywords=${keywords.length}`);
                }
                continue;
            }

            console.log(`\n📚 Processing ${integrationConfig.name}...`);
            console.log(`   Doc URL: ${integrationConfig.documentationUrl}`);
            console.log(`   Keywords: ${keywords.slice(0, 5).join(', ')}${keywords.length > 5 ? '...' : ''}`);

            // Start capturing URLs for this integration
            logCapture.startCapture(integrationConfig.id);

            // Set up log collection similar to WorkflowRunner
            const collectedLogs: any[] = [];
            const logListener = (entry: any) => {
                // Capture all debug logs
                if (entry.level === 'DEBUG') {
                    logCapture.captureDebugLog(`[DEBUG] ${entry.message}`);
                }
                // Capture info logs with "Successfully fetched content for"
                if (entry.level === 'INFO' && entry.message?.includes('Successfully fetched content for')) {
                    const urlMatch = entry.message.match(/Successfully fetched content for (.+)$/);
                    if (urlMatch && urlMatch[1].startsWith('http')) {
                        logCapture.captureUrl(urlMatch[1].trim());
                    }
                }
                // Also capture sitemap-related info/warn logs for debug
                if ((entry.level === 'INFO' || entry.level === 'WARN') &&
                    (entry.message?.includes('sitemap') ||
                        entry.message?.includes('URLs from sitemap') ||
                        entry.message?.includes('URLs under') ||
                        entry.message?.includes('Found') && entry.message?.includes('URLs') ||
                        entry.message?.includes('Collected') && entry.message?.includes('URLs'))) {
                    logCapture.captureDebugLog(`[${entry.level.toUpperCase()}] ${entry.message}`);
                }
                collectedLogs.push(entry);
            };

            // Start listening to logs
            logEmitter.on('log', logListener);

            let docLength = 0;
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
                docLength = docString?.length || 0;

                console.log(`   ✅ Completed in ${fetchTime}ms`);
                console.log(`   📄 Documentation length: ${docLength} characters`);

            } catch (error) {
                console.log(`   ❌ Error: ${error}`);
            } finally {
                // Clean up log listener
                logEmitter.off('log', logListener);
            }

            // Get captured data after cleaning up listener
            const fetchedUrls = logCapture.getUrls(integrationConfig.id);
            const debugLogs = logCapture.getDebugLogs(integrationConfig.id);

            console.log(`   📊 Captured ${fetchedUrls.length} URLs from logs`);

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
            let rankedUrls: string[] = [];
            if (fetchedUrls.length > 0) {
                // Use the actual core ranking logic
                rankedUrls = rankUrlsUsingCoreLogic(fetchedUrls, keywords);

                // Show top ranked URLs
                console.log(`   🎯 Top 5 ranked URLs:`);
                rankedUrls.slice(0, 5).forEach((url, idx) => {
                    console.log(`      ${idx + 1}. ${url}`);
                });
            }

            // Save results
            results.push({
                integrationId: integrationConfig.id,
                integrationName: integrationConfig.name,
                documentationUrl: integrationConfig.documentationUrl,
                keywords: keywords,
                fetchedUrls: fetchedUrls,
                rankedUrls: rankedUrls,
                documentationLength: docLength,
                debugLogs: debugLogs
            });
        }

        // Generate report
        await generateReport(results);

    } finally {
        // Cleanup
        await setupManager.cleanup();
        logCapture.clear();
    }
}

function rankUrlsUsingCoreLogic(urls: string[], keywords: string[]): string[] {
    // Create an instance of PlaywrightFetchingStrategy to use its ranking method
    const strategy = new PlaywrightFetchingStrategy();

    // Use the actual getMergedKeywords method to combine with defaults
    const mergedKeywords = strategy.getMergedKeywords(keywords);

    // Use the actual rankItems method from the core implementation
    const rankedItems = strategy.rankItems(urls, mergedKeywords);

    // rankedItems returns the URLs in ranked order
    return rankedItems as string[];
}

async function generateReport(results: RankingTestResult[]) {
    const timestamp = new Date().toISOString();
    const reportDir = path.join(process.cwd(), 'test-reports');
    await fs.mkdir(reportDir, { recursive: true });

    // Generate JSON report
    const jsonReport = {
        timestamp,
        rankingMethod: 'Core documentation ranking (exact keyword matching)',
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
    markdown += `**Ranking Method:** Core documentation ranking (exact keyword matching)\n\n`;
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

// Main execution
testRealUrlRanking().catch(console.error);