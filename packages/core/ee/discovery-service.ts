import {
  DiscoveryRun,
  ServiceMetadata,
  DiscoveryResult,
  System,
  ExtendedSystem,
} from "@superglue/shared";
import { getFileService } from "./file-service.js";
import { logMessage } from "../utils/logs.js";
import type { DataStore } from "../datastore/types.js";
import z from "zod";
import { LanguageModel } from "../llm/llm-base-model.js";

type FileCategory = "code" | "config" | "architecture" | "openapi" | "other" | "unimportant";

interface FileAnalysis {
  fileId: string;
  fileName: string;
  category: FileCategory;
  summary: string;
  systems: Array<{
    id: string;
    name: string;
    type?: string;
    urlHost?: string;
    urlPath?: string;
    documentationUrl?: string;
    evidence: string;
    confidence: "high" | "medium" | "low";
    systemDetails?: string;
    capabilities?: string[];
    usageContext?: string;
    dataFlowRole?: "source" | "destination" | "bidirectional" | "processing";
    potentialConnections?: string[];
  }>;
}

const fileAnalysisSchema = z.object({
  category: z
    .enum(["code", "config", "architecture", "openapi", "other", "unimportant"])
    .describe(
      "Category of the file: 'code' for source code, 'config' for configuration files, 'architecture' for system/architecture docs, 'openapi' for API specs, 'other' for relevant files that don't fit other categories, 'unimportant' for irrelevant files",
    ),
  summary: z
    .string()
    .max(5000)
    .describe(
      "Comprehensive summary of the file's contents, focusing on systems and technical details. Max 5000 characters.",
    ),
  systems: z
    .array(
      z.object({
        id: z
          .string()
          .describe("Unique kebab-case identifier (e.g., 'stripe-payments', 'postgresql-db')"),
        name: z.string().describe("Human-readable name (3-4 words max)"),
        type: z
          .string()
          .optional()
          .describe("Category: 'Payment Gateway', 'Database', 'CRM', etc."),
        urlHost: z.string().optional().describe("Base URL host if found"),
        urlPath: z.string().optional().describe("Base URL path if found"),
        documentationUrl: z.string().optional().describe("Documentation URL if found"),
        evidence: z
          .string()
          .describe(
            "How this was detected: include the file name, where in the file (function/class/section), and what specifically indicated this system",
          ),
        confidence: z.enum(["high", "medium", "low"]).describe("Detection confidence"),
        systemDetails: z
          .string()
          .max(3000)
          .optional()
          .describe(
            "COMPREHENSIVE technical details - be thorough! Include: (1) API endpoints with full paths, HTTP methods, and request/response formats; (2) Authentication details: auth type, header names, token formats, OAuth scopes; (3) Relevant code snippets showing how the system is called; (4) Connection strings, hostnames, ports; (5) Data formats (JSON, XML, CSV, etc.) and schemas; (6) Rate limits, pagination, batch sizes if mentioned; (7) Error handling patterns; (8) Which other systems this one interacts with and HOW (e.g., 'Receives CSV files from SFTP server at /inbound/, transforms records, pushes to Salesforce via REST API using bulk upsert'). The more technical detail, the better - this will be used to build integrations.",
          ),
        usageContext: z
          .string()
          .optional()
          .describe(
            "HOW this system is used in context: what data flows through it, what operations are performed, what business process it supports (e.g., 'Downloads daily CSV reports containing customer orders, parses them, and triggers downstream ETL')",
          ),
        dataFlowRole: z
          .enum(["source", "destination", "bidirectional", "processing"])
          .optional()
          .describe(
            "Role in data flow: 'source' = data is read FROM this system, 'destination' = data is written TO this system, 'bidirectional' = both read and write, 'processing' = transforms/processes data",
          ),
        capabilities: z
          .array(z.string())
          .max(8)
          .optional()
          .describe(
            "Useful, specific operations - what's read, written, or done. Examples: 'Stores account and program data', 'Synchronizes contact profiles', 'Reads customer orders', 'Sends progress notifications', 'Handles OAuth2 client credentials auth'. Avoid vague phrases like 'manages data'.",
          ),
        potentialConnections: z
          .array(z.string())
          .max(10)
          .optional()
          .describe(
            "Observed or implied connections to OTHER systems that could inform future tool building. Examples: 'Pushes order data to SFTP server for ERP pickup', 'Receives webhook events from Stripe payments', 'Exports CSV reports consumed by BI dashboards', 'Triggers Slack notifications on order completion', 'Syncs customer data to marketing automation platform'. Focus on data flows, file transfers, API calls, webhooks, or scheduled syncs between THIS system and other systems.",
          ),
      }),
    )
    .describe("Systems identified in this file"),
});

const synthesisSchema = z.object({
  title: z.string().describe("Concise title summarizing the discovery (3-4 words max)"),
  description: z
    .string()
    .describe(
      "5-6 sentence overview of the system landscape, describing the data flow and how systems interact",
    ),
  systems: z
    .array(
      z.object({
        id: z
          .string()
          .describe(
            "Unique identifier for the system (use lowercase kebab-case, e.g., 'stripe-payments', 'postgresql-db')",
          ),
        name: z
          .string()
          .optional()
          .describe("Name of the system/service (keep to 3-4 words maximum)"),
        type: z
          .string()
          .optional()
          .describe("Type/category (e.g., 'Payment Gateway', 'CRM', 'Database', 'ETL Platform')"),
        urlHost: z.string().optional().describe("Base URL host if mentioned"),
        urlPath: z.string().optional().describe("Base URL path if applicable"),
        documentationUrl: z.string().optional().describe("URL to documentation if mentioned"),
        icon: z
          .object({
            name: z
              .string()
              .describe("Icon name (e.g., 'salesforce' for Simple Icons, 'database' for Lucide)"),
            source: z
              .enum(["simpleicons", "lucide"])
              .describe(
                "Icon source: 'simpleicons' for well-known companies/brands, 'lucide' for generic categories",
              ),
          })
          .optional()
          .describe("Icon to display for this system"),
        sources: z
          .array(z.string())
          .describe(
            "File names where this system was mentioned - MUST include all relevant file names",
          ),
        capabilities: z
          .array(z.string())
          .max(8)
          .describe(
            "Useful operations - what's read, written, done. Good: 'Stores account and program data', 'Reads customer orders and balances', 'Synchronizes contact profiles', 'Schedules data update jobs'. Bad: 'manages data', 'handles operations'.",
          ),
        confidence: z.enum(["high", "medium", "low"]).describe("Confidence level of detection"),
        evidence: z
          .string()
          .describe(
            "How this was detected: include file names, where in each file, and what specifically indicated this system",
          ),
        systemDetails: z
          .string()
          .max(5000)
          .optional()
          .describe(
            "COMPREHENSIVE merged technical details - be thorough! Include: API endpoints with full paths and HTTP methods, authentication details (auth type, headers, OAuth scopes), code snippets, connection strings, data formats and schemas, rate limits, pagination, error handling patterns. Also document interactions with other systems (e.g., 'Receives CSV files from SFTP at /inbound/, transforms using field mapping, bulk upserts to Salesforce Contact object via REST API').",
          ),
        potentialConnections: z
          .array(z.string())
          .max(15)
          .optional()
          .describe(
            "Merged list of observed or implied connections to OTHER systems - valuable for predicting future tool building. Examples: 'Pushes order data to SFTP for ERP pickup', 'Receives webhook events from Stripe', 'Exports CSV reports for BI dashboards', 'Syncs customer data to marketing automation', 'Triggers Slack notifications on order completion'. Focus on data flows, file transfers, API calls, webhooks, scheduled syncs.",
          ),
      }),
    )
    .describe(
      "Systems/systems identified in the files - MERGE systems that are clearly the same even if named differently",
    ),
});

const matchingSchema = z.object({
  matches: z
    .array(
      z.object({
        discoveredSystemId: z
          .string()
          .describe("The ID of the discovered system from the discovery results"),
        existingSystemId: z.string().describe("The ID of the matching existing system"),
      }),
    )
    .describe("List of matches between discovered systems and existing systems"),
});

/** Uses 80% of model context length (~3 chars/token) to leave room for prompt and response. */
function getMaxChunkSize(): number {
  const contextLength = LanguageModel.contextLength;
  return Math.floor(contextLength * 3 * 0.8);
}

/** Splits content at paragraph boundaries (double newline), falls back to line breaks. Searches last 30% of chunk for clean break points. */
function chunkContent(content: string, maxChunkSize: number): string[] {
  if (content.length <= maxChunkSize) {
    return [content];
  }

  const chunks: string[] = [];
  let remaining = content;

  while (remaining.length > 0) {
    if (remaining.length <= maxChunkSize) {
      chunks.push(remaining);
      break;
    }

    let breakPoint = maxChunkSize;
    const searchWindow = remaining.slice(Math.floor(maxChunkSize * 0.7), maxChunkSize);

    const paragraphBreak = searchWindow.lastIndexOf("\n\n");
    if (paragraphBreak > 0) {
      breakPoint = Math.floor(maxChunkSize * 0.7) + paragraphBreak + 2;
    } else {
      const lineBreak = searchWindow.lastIndexOf("\n");
      if (lineBreak > 0) {
        breakPoint = Math.floor(maxChunkSize * 0.7) + lineBreak + 1;
      }
    }

    chunks.push(remaining.slice(0, breakPoint));
    remaining = remaining.slice(breakPoint);
  }

  return chunks;
}

/** Builds the LLM prompt for analyzing a single file/chunk. Instructs to extract systems, endpoints, auth, and categorize the file. */
function buildFileAnalysisContext(
  fileName: string,
  content: string,
  chunkIndex: number,
  totalChunks: number,
  userInstruction?: string,
): string {
  const chunkInfo = totalChunks > 1 ? ` (chunk ${chunkIndex + 1}/${totalChunks})` : "";

  let context = `You are an expert in software architecture analysis and system management. You excel at reading source code, scripts, configuration files, and documentation to identify external systems, APIs, and dependencies. You can trace data flows, recognize authentication patterns, and piece together how different systems communicate.

Analyze the following file${chunkInfo} and identify all systems and services mentioned or used.

File: ${fileName}${chunkInfo}

<content>
${content}
</content>

For each system you identify, extract as much detail as possible.

**CRITICAL: What qualifies as a SYSTEM?**
A system is an external service, API, database, or infrastructure component that:
- Has its OWN endpoint, server, or connection string
- Is typically owned/operated by a different team or organization
- Has its own authentication mechanism
- Uses its own technology stack/framework

**NOT systems (do NOT list these as separate systems):**
- Data transformations, mappings, or filters (these are PROCESSES that run ON systems)
- Internal functions or utility code
- Configuration parsing or validation logic
- Different capabilities or features of the SAME underlying system
- ETL steps that don't involve external systems

**EXCLUDE these as systems (they are NOT part of the data architecture):**
- Communication/collaboration tools used only for human coordination: Microsoft Teams, Zoom, Loom, WhatsApp, Slack (unless Slack is used for automated notifications/webhooks as part of the data flow)
- Office productivity tools: Microsoft Word, Excel, PowerPoint, Google Docs (unless they are explicitly used as data sources/destinations in an automated pipeline)
- Email clients: Outlook, Gmail (unless email is an automated trigger/destination in the system)
- The key test: Is this tool involved in AUTOMATED data processing, or is it just used by humans to communicate ABOUT the system? If it's just for human communication, EXCLUDE it.

If you identify a transformation or process but can't identify which system it runs on, leave it out. We want SYSTEMS, not processes.

**What makes two systems DIFFERENT (not the same)?**
Two things are different systems ONLY if they have:
- Different endpoints/hostnames/connection strings
- Different authentication credentials or mechanisms
- Different owners/teams/organizations
- Different underlying technology (e.g., PostgreSQL vs MySQL are different, but two PostgreSQL queries to the same DB are ONE system)

Do NOT split one real-world system into multiple systems just because it has different capabilities, endpoints, or API resources. Stripe's /charges and /customers endpoints are ONE system (Stripe), not two.

**In source code and scripts, look for:**
- Import statements, library usage, SDK calls
- API endpoint URLs, base URLs, connection strings
- Authentication: API keys, OAuth flows, headers like Authorization, X-API-Key
- HTTP methods and request/response patterns
- Database queries, connection configurations
- Exact code snippets showing how the system is called

**In architecture and documentation files, look for:**
- System names and their relationships
- Data flow descriptions between systems
- Which systems communicate with each other
- System patterns (sync/async, webhooks, polling)
- Technical specifications and constraints

**In configuration files, look for:**
- Environment variables referencing external services
- Connection strings, hostnames, ports
- Credentials placeholders, secret references
- Feature flags related to systems

**Fields to populate:**
- id: Unique kebab-case identifier (e.g., 'stripe-api', 'postgres-main'). Use DESCRIPTIVE identifiers that help identify this specific instance (e.g., 'ucla-sftp-server', 'orders-postgres-db')
- name: Human-readable name (3-4 words max)
- type: Category like 'Payment Gateway', 'Database', 'CRM', 'Message Queue', 'ETL Platform', 'SFTP Server', 'REST API'
- urlHost/urlPath: Base URLs if found (CRITICAL for deduplication - extract any hostnames, IPs, or connection strings)
- documentationUrl: Links to docs if mentioned
- evidence: How you detected this - include the file name, where in the file (function/class/section), and what specifically indicated this system
- confidence: 'high' if explicitly mentioned with clear evidence (API calls, connection strings, imports), 'medium' if inferred from context but with actual connections to other systems (inbound/outbound data flows), 'low' if uncertain or speculative. Be conservative - only use 'medium' if you can identify actual connections, not just potential ones.
- systemDetails: COMPREHENSIVE technical details - BE THOROUGH! Include ALL of the following if present:
  * API endpoints with full paths, HTTP methods, request/response formats
  * Authentication: auth type, header names, token formats, OAuth scopes, credential patterns
  * Relevant code snippets showing exactly how the system is called
  * Connection strings, hostnames, ports, database names
  * Data formats (JSON, XML, CSV) and field mappings/schemas if visible
  * Rate limits, pagination patterns, batch sizes
  * Error handling patterns
  * Retry logic, timeout configurations
  * Which OTHER systems this one interacts with and exactly HOW
  The more technical detail you extract, the more useful this will be for building integrations!
- usageContext: CRITICAL - Describe HOW this system is used: what data flows through it, what triggers interactions, what business process it supports. Example: "Downloads daily CSV exports from /outbound/orders/ directory, parses order records, used as the primary data source for the ETL pipeline"
- dataFlowRole: Is this system a 'source' (data is read FROM it), 'destination' (data is written TO it), 'bidirectional' (both), or 'processing' (transforms data)?
- capabilities: USEFUL, SPECIFIC OPERATIONS that help understand what this system does (max 8).
- potentialConnections: IMPORTANT - Document any observed or implied connections to OTHER systems that could inform future tool building:
  * Data flows TO other systems (e.g., "Pushes transformed orders to ERP via SFTP")
  * Data flows FROM other systems (e.g., "Receives webhook events from Stripe")
  * File-based integrations (e.g., "Exports CSV reports for BI tool consumption")
  * Scheduled syncs (e.g., "Nightly sync of customer records to marketing platform")
  * API-to-API connections (e.g., "Calls Salesforce API to update contact records")
  * Webhook triggers (e.g., "Triggers Slack notification on order completion")
  These connections are valuable for predicting what tools users will want to build!

  GOOD capabilities (describe what's read/written/done):
  - "Stores account and program data"
  - "Synchronizes contact profiles"
  - "Reads customer orders and account balances"
  - "Updates employment and job information"
  - "Schedules data update jobs"
  - "Sends progress notifications via webhook"
  - "Handles OAuth2 authentication with client credentials"
  - "Downloads CSV reports from /outbound/ directory"
  - "Writes transformed records to staging tables"
  
  BAD capabilities (too vague to be useful):
  - "manages data" ❌
  - "handles operations" ❌
  - "processes records" ❌
  - "augments data" ❌
  - "runs operations" ❌
  
  For APIs: describe WHAT resources are read/written (accounts, orders, contacts), not full endpoint paths
  For scripts/jobs: can be more specific about sources and destinations

**File categories:**
- "code": Source code, scripts, implementations
- "config": Configuration files (env, yaml, json, xml configs)
- "architecture": System documentation, diagrams, landscape overviews
- "openapi": OpenAPI/Swagger specifications
- "other": Relevant files that don't fit above
- "unimportant": Files with no system information (logs, assets, etc.)`;

  if (userInstruction) {
    context += `\n\nUser's specific instruction: ${userInstruction}`;
  }

  return context;
}

const FILE_ANALYSIS_SYSTEM_PROMPT = `You are a senior software architect with deep expertise in systems, API design, and enterprise architecture. You can analyze any file type - from source code and scripts to architecture diagrams and technical documentation - and extract detailed information about external systems, services, and systems. You understand authentication patterns, data flows, and how modern distributed systems communicate.`;

/** Calls LLM to analyze a single chunk, returns structured FileAnalysis schema. */
async function analyzeFileChunk(
  fileName: string,
  content: string,
  chunkIndex: number,
  totalChunks: number,
  userInstruction?: string,
  serviceMetadata?: ServiceMetadata,
): Promise<z.infer<typeof fileAnalysisSchema>> {
  const context = buildFileAnalysisContext(
    fileName,
    content,
    chunkIndex,
    totalChunks,
    userInstruction,
  );

  const messages = [
    { role: "system" as const, content: FILE_ANALYSIS_SYSTEM_PROMPT },
    { role: "user" as const, content: context },
  ];

  const result = await LanguageModel.generateObject<z.infer<typeof fileAnalysisSchema>>({
    messages,
    schema: z.toJSONSchema(fileAnalysisSchema),
    temperature: 0.2,
    metadata: serviceMetadata,
  });

  if (!result.success) {
    throw new Error(`File analysis failed for ${fileName}: ${result.response}`);
  }

  return result.response;
}

/** Merges chunk results into single FileAnalysis. Uses priority order for category (openapi > architecture > config > code > other > unimportant). Deduplicates systems by ID, combining evidence and capabilities. */
function aggregateChunkAnalyses(
  fileId: string,
  fileName: string,
  chunkResults: Array<z.infer<typeof fileAnalysisSchema>>,
): FileAnalysis {
  const categoryPriority: FileCategory[] = [
    "openapi",
    "architecture",
    "config",
    "code",
    "other",
    "unimportant",
  ];
  const categories = chunkResults.map((r) => r.category);
  const category = categoryPriority.find((c) => categories.includes(c)) || "unimportant";

  const summary = chunkResults
    .map((r, i) => (chunkResults.length > 1 ? `[Part ${i + 1}] ${r.summary}` : r.summary))
    .join("\n\n")
    .slice(0, 5000);

  const systemsMap = new Map<string, FileAnalysis["systems"][0]>();
  for (const result of chunkResults) {
    for (const system of result.systems) {
      const existing = systemsMap.get(system.id);
      if (existing) {
        existing.evidence = `${existing.evidence}; ${system.evidence}`;
        if (system.systemDetails) {
          existing.systemDetails = existing.systemDetails
            ? `${existing.systemDetails}\n${system.systemDetails}`
            : system.systemDetails;
        }
        if (system.capabilities) {
          existing.capabilities = [
            ...new Set([...(existing.capabilities || []), ...system.capabilities]),
          ];
        }
        if (system.potentialConnections) {
          existing.potentialConnections = [
            ...new Set([...(existing.potentialConnections || []), ...system.potentialConnections]),
          ];
        }
        if (system.usageContext && !existing.usageContext) {
          existing.usageContext = system.usageContext;
        } else if (system.usageContext && existing.usageContext) {
          existing.usageContext = `${existing.usageContext}; ${system.usageContext}`;
        }
        if (system.dataFlowRole && !existing.dataFlowRole) {
          existing.dataFlowRole = system.dataFlowRole;
        }
      } else {
        systemsMap.set(system.id, { ...system } as FileAnalysis["systems"][0]);
      }
    }
  }

  return { fileId, fileName, category, summary, systems: Array.from(systemsMap.values()) };
}

/** Analyzes a file by chunking if needed (based on context length), running LLM on each chunk in parallel, then aggregating results. */
async function analyzeFile(
  fileId: string,
  fileName: string,
  content: string,
  userInstruction?: string,
  serviceMetadata?: ServiceMetadata,
): Promise<FileAnalysis> {
  const maxChunkSize = getMaxChunkSize();
  const chunks = chunkContent(content, maxChunkSize);

  logMessage(
    "info",
    `DiscoveryService: Analyzing file="${fileName}" chunks=${chunks.length}`,
    serviceMetadata,
  );

  const chunkResults = await Promise.all(
    chunks.map((chunk, index) =>
      analyzeFileChunk(fileName, chunk, index, chunks.length, userInstruction, serviceMetadata),
    ),
  );

  return aggregateChunkAnalyses(fileId, fileName, chunkResults);
}

/** Builds synthesis prompt from all file analyses. Includes icon mapping guidance and instructions to merge duplicate systems. */
function buildSynthesisContext(analyses: FileAnalysis[], userInstruction?: string): string {
  let context = `You are a senior enterprise architect with expertise in system, data pipelines, and distributed architectures. You excel at synthesizing information from multiple sources - code, documentation, and configurations - to create comprehensive system landscape views. You are exceptionally good at recognizing when the same system is mentioned differently across files.

Below are the analysis results from multiple files in a software system. Your task is to create a unified view of all systems and systems.

**CRITICAL: INTELLIGENT SYSTEM MERGING**

You MUST aggressively merge systems that represent the same underlying service. Be GENEROUS with merging - it's better to merge two things that might be separate than to list duplicates.

**Merge systems when ANY of these are true:**
1. Same or very similar urlHost (e.g., 'sftp.example.com' and 'example.com/sftp' are likely the same)
2. Similar names with qualifiers removed (e.g., 'SFTP Server' and 'UCLA SFTP Server' and 'Main SFTP' are likely the same SFTP server)
3. Same type + similar usageContext (e.g., two PostgreSQL databases both used for "storing order data" are likely the same)
4. Same type + same dataFlowRole in a logical architecture (if the system reads from ONE SFTP and writes to TWO databases, there's probably only 1 SFTP)
5. Same well-known service (Salesforce mentioned in different files = 1 Salesforce, not multiple)

**Architecture-aware merging:**
- Consider the OVERALL DATA FLOW. A typical ETL has: 1-2 sources → transformation → 1-3 destinations
- If you see "sftp-server" and "ucla-sftp" both as sources with similar capabilities, they're probably the SAME system
- If you see "orders-db" and "customer-db" both as destinations with DIFFERENT tables/purposes, they might be DIFFERENT systems
- Use usageContext to understand if systems serve the same or different purposes

**DO NOT merge systems when:**
- They have clearly different hostnames/connection strings that aren't variations
- They're explicitly different instances (e.g., "production-db" vs "staging-db" if both are mentioned)
- They serve completely different business purposes even if same type

**CRITICAL: What is NOT a system (EXCLUDE these):**
- Data transformations, mappings, ETL logic, or filters - these are PROCESSES, not systems
- Internal utility functions or helper code
- Different capabilities/endpoints of the SAME underlying system (Stripe /charges and /customers = ONE Stripe system)
- Configuration or validation logic

**FILTER OUT non-data systems (EXCLUDE these from final output):**
These tools are NOT part of the data architecture and should be EXCLUDED unless they are explicitly used for AUTOMATED data processing:
- Communication/collaboration tools used only for human coordination: Microsoft Teams, Zoom, Loom, WhatsApp, Discord, Slack (UNLESS Slack is used for automated notifications/webhooks as part of the data pipeline)
- Office productivity tools: Microsoft Word, Excel, PowerPoint, Google Docs, Google Sheets (UNLESS they are explicitly automated data sources/destinations - e.g., Google Sheets API being called, not just humans sharing spreadsheets)
- Email clients: Outlook, Gmail (UNLESS email is an automated trigger/destination)
- Video/screen recording tools: Loom, Camtasia
- Project management tools: Jira, Asana, Trello (UNLESS integrated via API into the data flow)

**The key test:** Is this system involved in AUTOMATED data processing with clear API/file/database connections? Or is it just used by humans to communicate ABOUT the system? If it's just for human communication or manual processes, EXCLUDE it from the systems list.

Only include actual external systems, services, APIs, databases, or infrastructure that are part of the automated data flow. If something looks like a transformation or process but you can't identify which system it runs on, leave it out entirely.

**What makes two systems TRULY DIFFERENT:**
Systems are different only if they have different endpoints/servers, different authentication, different owners/teams, or different underlying technology. Do NOT split one real-world system into multiple entries just because it has multiple features or API endpoints.

**Capabilities - USEFUL & SPECIFIC:**
Describe what's read, written, or done - useful to someone understanding the system:
- GOOD: "Reads customer orders and account balances", "Stores account and program data", "Synchronizes contact profiles", "Sends progress notifications", "Downloads CSV reports from /outbound/"
- BAD: "manages data", "handles operations", "processes records" (too vague to be useful)

**CRITICAL: Confidence Level Filtering**
- **EXCLUDE all systems with 'low' confidence** - do not include them in the final output at all
- **For 'medium' confidence systems**: Only include them if they have ACTUAL inbound or outbound connections documented (in potentialConnections, usageContext, or systemDetails showing data flows TO/FROM other systems). Do NOT include medium confidence systems if you only see potential or speculative connections - require evidence of actual data flows, API calls, file transfers, or webhooks
- **'high' confidence systems**: Include these as they have clear evidence

**Other instructions:**
1. Create a cohesive title (3-4 words) and description (5-6 sentences) of the overall system landscape, describing the data flow
2. For merged systems, combine their evidence, systemDetails, capabilities, and potentialConnections into comprehensive entries
3. Pick the highest confidence level when merging
4. IMPORTANT - Populate 'sources' with ALL file names where each system was mentioned
5. **systemDetails should be COMPREHENSIVE** - include ALL technical details: API endpoints, HTTP methods, auth patterns, code snippets, connection strings, data formats, schemas, rate limits, pagination, error handling. More detail = better for building integrations!
6. **potentialConnections is CRITICAL for future tool building** - merge and deduplicate connections from file analyses. These describe how systems interact with EACH OTHER and help predict what tools users will want to build. Examples:
   - "Pushes order data to SFTP server for ERP consumption"
   - "Receives webhook events from Stripe on payment completion"  
   - "Exports daily CSV reports to /reports/ directory for BI tools"
   - "Syncs customer profiles to marketing automation platform nightly"
   - "Triggers Slack notification via webhook on job failure"
7. Select an icon for systems:
   - 'simpleicons' for well-known brands: salesforce, jitterbit, postgresql, stripe, slack, github, twilio, hubspot, ibm, aws, azure, google, oracle, sap, workday, servicenow, snowflake, databricks, kafka, redis, mongodb, elasticsearch, grafana, datadog, pagerduty, zendesk, intercom, segment, amplitude, mixpanel, braze, sendgrid, mailchimp, auth0, okta
   - 'lucide' for generic categories:
     * 'file-code' - scripts, custom code
     * 'file' - file transfers, FTP, SFTP
     * 'users' - CRMs, user management
     * 'webhook' - webhooks, triggers, callbacks
     * 'database' - generic databases
     * 'landmark' - financial/payment providers
     * 'brain' - AI/ML services
     * 'bell' - notifications
     * 'mail' - email, messaging
     * 'workflow' - ETL, orchestration, automation
     * 'scroll-text' - logging
     * 'cloud' - cloud services
     * 'calendar' - schedulers
     * 'table' - staging tables, data storage
     * 'server' - generic servers, APIs

`;

  if (userInstruction) {
    context += `User's specific instruction: ${userInstruction}\n\n`;
  }

  context += `<file_analyses>\n`;

  for (const analysis of analyses) {
    // Include all fields especially usageContext, dataFlowRole, and potentialConnections for merging decisions
    const systemsWithContext = analysis.systems.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      urlHost: s.urlHost,
      urlPath: s.urlPath,
      evidence: s.evidence,
      confidence: s.confidence,
      systemDetails: s.systemDetails,
      usageContext: s.usageContext,
      dataFlowRole: s.dataFlowRole,
      capabilities: s.capabilities,
      potentialConnections: s.potentialConnections,
    }));

    context += `<file name="${analysis.fileName}" category="${analysis.category}">
<summary>
${analysis.summary}
</summary>
<systems>
${JSON.stringify(systemsWithContext, null, 2)}
</systems>
</file>\n\n`;
  }

  context += `</file_analyses>`;

  return context;
}

const SYNTHESIS_SYSTEM_PROMPT = `You are a senior enterprise architect specializing in system and technical documentation. You have deep experience analyzing complex software landscapes, identifying system patterns, and creating clear architectural overviews. You can recognize when the same system is mentioned differently across files and merge information intelligently.`;

/** Runs synthesis LLM call on all non-unimportant file analyses. Returns final DiscoveryResult with deduplicated systems. */
async function synthesizeResults(
  analyses: FileAnalysis[],
  userInstruction?: string,
  serviceMetadata?: ServiceMetadata,
): Promise<DiscoveryResult> {
  const relevantAnalyses = analyses.filter((a) => a.category !== "unimportant");

  if (relevantAnalyses.length === 0) {
    return {
      title: "No Systems Found",
      description: "The analyzed files did not contain any relevant system information.",
      systems: [],
    };
  }

  const context = buildSynthesisContext(relevantAnalyses, userInstruction);

  const messages = [
    { role: "system" as const, content: SYNTHESIS_SYSTEM_PROMPT },
    { role: "user" as const, content: context },
  ];

  const result = await LanguageModel.generateObject<DiscoveryResult>({
    messages,
    schema: z.toJSONSchema(synthesisSchema),
    temperature: 0.2,
    metadata: serviceMetadata,
  });

  if (!result.success) {
    throw new Error(`Synthesis failed: ${result.response}`);
  }

  // Post-process: filter out low confidence systems (LLM handles medium confidence filtering via prompt)
  const filteredSystems = result.response.systems.filter((system) => {
    return system.confidence !== "low";
  });

  return {
    ...result.response,
    systems: filteredSystems,
  };
}

const MATCHING_SYSTEM_PROMPT = `You are an expert at identifying when two system/system descriptions refer to the same underlying service. You compare systems by their names, URLs, capabilities, and purposes to determine if they are the same system.`;

/** Builds the prompt for matching discovered systems against existing systems. */
function buildMatchingContext(
  discoveredSystems: ExtendedSystem[],
  existingSystems: System[],
): string {
  return `You are comparing discovered systems from a codebase analysis against a user's existing systems to find matches.

**Task:** Identify which discovered systems match existing systems. Two systems match if they represent the SAME external service or API.

**Matching criteria (in order of importance):**
1. Same urlHost (e.g., both use api.stripe.com)
2. Same or very similar name (e.g., "Stripe Payments" matches "stripe-api")
3. Same type/category AND overlapping capabilities
4. Same well-known service (e.g., Salesforce, HubSpot, PostgreSQL)

**Important:**
- Only report matches you are confident about
- Do NOT match generic types (e.g., don't match two different "Database" systems just because they're both databases)
- A discovered system can match at most ONE existing system

<discovered_systems>
${JSON.stringify(
  discoveredSystems.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
    urlHost: s.urlHost,
    capabilities: s.capabilities,
  })),
  null,
  2,
)}
</discovered_systems>

<existing_systems>
${JSON.stringify(
  existingSystems.map((i) => ({
    id: i.id,
    name: i.name,
    type: i.type,
    urlHost: i.urlHost,
  })),
  null,
  2,
)}
</existing_systems>

Return matches where a discovered system is the same as an existing system.`;
}

/** Matches discovered systems against existing systems using LLM. Returns the discovery result with matchedSystemId populated. */
async function matchWithExistingSystems(
  discoveryResult: DiscoveryResult,
  existingSystems: System[],
  serviceMetadata?: ServiceMetadata,
): Promise<DiscoveryResult> {
  // Skip if no existing systems or no discovered systems
  if (existingSystems.length === 0 || discoveryResult.systems.length === 0) {
    return discoveryResult;
  }

  const context = buildMatchingContext(discoveryResult.systems, existingSystems);

  const messages = [
    { role: "system" as const, content: MATCHING_SYSTEM_PROMPT },
    { role: "user" as const, content: context },
  ];

  const result = await LanguageModel.generateObject<z.infer<typeof matchingSchema>>({
    messages,
    schema: z.toJSONSchema(matchingSchema),
    temperature: 0.1,
    metadata: serviceMetadata,
  });

  if (!result.success) {
    logMessage("warn", `System matching failed: ${result.response}`, serviceMetadata);
    return discoveryResult;
  }

  // Create a map of discovered system ID -> existing system ID
  const matchMap = new Map<string, string>();
  for (const match of result.response.matches) {
    matchMap.set(match.discoveredSystemId, match.existingSystemId);
  }

  // Annotate systems with matchedSystemId
  const annotatedSystems = discoveryResult.systems.map((system) => {
    const existingSystemId = matchMap.get(system.id);
    if (existingSystemId) {
      return {
        ...system,
        matchedSystemId: existingSystemId,
      };
    }
    return system;
  });

  return {
    ...discoveryResult,
    systems: annotatedSystems,
  };
}

export interface ProcessDiscoveryOptions {
  userInstruction?: string;
}

export class DiscoveryService {
  /**
   * Two-phase discovery: (1) analyze each file in parallel with chunking support,
   * (2) synthesize all analyses into deduplicated DiscoveryResult.
   */
  static async processDiscoveryRun(
    run: DiscoveryRun,
    datastore: DataStore,
    orgId: string,
    serviceMetadata: ServiceMetadata,
    options?: ProcessDiscoveryOptions,
  ): Promise<DiscoveryResult> {
    const fileSources = run.sources.filter((s) => s.type === "file");
    logMessage(
      "info",
      `DiscoveryService: Starting discovery id=${run.id} with ${fileSources.length} files`,
      serviceMetadata,
    );

    const files: Array<{ id: string; name: string; content: string }> = [];

    for (const source of fileSources) {
      try {
        const fileRef = await datastore.getFileReference({ id: source.id, orgId });

        if (!fileRef) {
          logMessage(
            "warn",
            `DiscoveryService: File not found fileId=${source.id}`,
            serviceMetadata,
          );
          files.push({
            id: source.id,
            name: source.id,
            content: "[Error: File reference not found]",
          });
          continue;
        }

        if (!fileRef.processedStorageUri) {
          logMessage(
            "warn",
            `DiscoveryService: File not processed fileId=${source.id}`,
            serviceMetadata,
          );
          files.push({
            id: source.id,
            name: fileRef.metadata?.originalFileName || source.id,
            content: "[Error: File has not been processed yet]",
          });
          continue;
        }

        const contentBuffer = await getFileService().downloadFile(
          fileRef.processedStorageUri,
          serviceMetadata,
        );
        files.push({
          id: source.id,
          name: fileRef.metadata?.originalFileName || source.id,
          content: contentBuffer.toString("utf-8"),
        });
      } catch (error) {
        logMessage(
          "error",
          `DiscoveryService: Failed to load fileId=${source.id}: ${error}`,
          serviceMetadata,
        );
        files.push({ id: source.id, name: source.id, content: `[Error: ${String(error)}]` });
      }
    }

    logMessage(
      "info",
      `DiscoveryService: Loaded ${files.length} files, starting parallel analysis`,
      serviceMetadata,
    );

    const fileAnalyses = await Promise.all(
      files.map((file) =>
        analyzeFile(
          file.id,
          file.name,
          file.content,
          options?.userInstruction,
          serviceMetadata,
        ).catch((error) => {
          logMessage(
            "error",
            `DiscoveryService: Analysis failed file="${file.name}": ${error}`,
            serviceMetadata,
          );
          return {
            fileId: file.id,
            fileName: file.name,
            category: "unimportant" as FileCategory,
            summary: `Error analyzing file: ${String(error)}`,
            systems: [],
          } satisfies FileAnalysis;
        }),
      ),
    );

    const totalSystems = fileAnalyses.reduce((sum, a) => sum + a.systems.length, 0);
    logMessage(
      "info",
      `DiscoveryService: Analysis complete. ${fileAnalyses.length} files, ${totalSystems} preliminary systems found`,
      serviceMetadata,
    );

    let result = await synthesizeResults(fileAnalyses, options?.userInstruction, serviceMetadata);

    // Match discovered systems against existing systems
    try {
      const existingSystems = await datastore.listSystems({
        limit: 1000,
        includeDocs: false,
        orgId,
      });
      if (existingSystems.items.length > 0) {
        logMessage(
          "info",
          `DiscoveryService: Matching against ${existingSystems.items.length} existing systems`,
          serviceMetadata,
        );
        result = await matchWithExistingSystems(result, existingSystems.items, serviceMetadata);
        const matchedCount = result.systems.filter((s) => s.matchedSystemId).length;
        logMessage(
          "info",
          `DiscoveryService: Found ${matchedCount} matches with existing systems`,
          serviceMetadata,
        );
      }
    } catch (error) {
      logMessage(
        "warn",
        `DiscoveryService: System matching skipped due to error: ${error}`,
        serviceMetadata,
      );
    }

    logMessage(
      "info",
      `DiscoveryService: Discovery complete id=${run.id}, ${result.systems.length} final systems`,
      serviceMetadata,
    );

    return result;
  }

  /** Analyze a single file - exposed for potential future use (e.g., storing summaries in DB). */
  static async analyzeFile(
    fileId: string,
    fileName: string,
    content: string,
    userInstruction?: string,
    serviceMetadata?: ServiceMetadata,
  ): Promise<FileAnalysis> {
    return analyzeFile(fileId, fileName, content, userInstruction, serviceMetadata);
  }
}

export type { FileAnalysis };
