import type { ApiConfig, ExtractConfig, RunResult, TransformConfig, Workflow, Integration } from "@superglue/client";
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { logMessage } from "../utils/logs.js";
import type { DataStore } from "./types.js";

export class FileStore implements DataStore {

  private storage: {
    apis: Map<string, ApiConfig>;
    extracts: Map<string, ExtractConfig>;
    transforms: Map<string, TransformConfig>;
    workflows: Map<string, Workflow>;
    integrations: Map<string, Integration>;
    tenant: {
      email: string | null;
      emailEntrySkipped: boolean;
    };
  };

  private filePath: string;
  private logsFilePath: string;

  constructor(storageDir = '/data') {
    this.storage = {
      apis: new Map(),
      extracts: new Map(),
      transforms: new Map(),
      workflows: new Map(),
      integrations: new Map(),
      tenant: {
        email: null,
        emailEntrySkipped: false
      }
    };

    // Check if /data exists synchronously
    if (storageDir === '/data' && !fs.existsSync('/data')) {
      logMessage('warn', 'File Datastore: "/data" directory not found, using local ".superglue" directory instead');
      storageDir = './.superglue';
    }

    this.filePath = path.join(storageDir, 'superglue_data.json');
    this.logsFilePath = path.join(storageDir, 'superglue_logs.jsonl');
    logMessage('info', `File Datastore: Using storage path: ${this.filePath}`);

    this.initializeStorage();
  }

  private async initializeStorage() {
    try {
      // Ensure the directory exists with proper permissions
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true, mode: 0o755 });
      logMessage('info', `File Datastore: Created/verified directory: ${path.dirname(this.filePath)}`);

      const data = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(data, (key, value) => {
        if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
          return new Date(value);
        }
        return value;
      });
      this.storage = {
        ...this.storage,
        apis: new Map(Object.entries(parsed.apis || {})),
        extracts: new Map(Object.entries(parsed.extracts || {})),
        transforms: new Map(Object.entries(parsed.transforms || {})),
        workflows: new Map(Object.entries(parsed.workflows || {})),
        integrations: new Map(Object.entries(parsed.integrations || {})),
        tenant: {
          email: parsed.tenant?.email || null,
          emailEntrySkipped: parsed.tenant?.emailEntrySkipped || false
        }
      };
      logMessage('info', 'File Datastore: Successfully loaded existing data');
    } catch (error) {
      logMessage('error', 'File Datastore: Error loading data: ' + error);
      if (!fs.existsSync(this.filePath)) {
        logMessage('info', 'File Datastore: No existing data found, starting with empty storage');
        await this.persist();
      }
      else {
        logMessage('error', 'COULD NOT LOAD FROM EXISTING FILE. EXITING. ' + error);
        process.exit(1);
      }
    }

    // Ensure logs file exists
    if (!fs.existsSync(this.logsFilePath)) {
      fs.writeFileSync(this.logsFilePath, '', { mode: 0o644 });
      logMessage('info', 'Logs Datastore: Created empty logs file');
    }
  }

  private async persist() {
    try {
      const serialized = {
        apis: Object.fromEntries(this.storage.apis),
        extracts: Object.fromEntries(this.storage.extracts),
        transforms: Object.fromEntries(this.storage.transforms),
        workflows: Object.fromEntries(this.storage.workflows),
        integrations: Object.fromEntries(this.storage.integrations),
        tenant: this.storage.tenant
      };
      const tempPath = `${this.filePath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(serialized, null, 2), { mode: 0o644 });
      fs.renameSync(tempPath, this.filePath);
    } catch (error) {
      logMessage('error', 'Failed to persist data: ' + error);
      throw error;
    }
  }

  private getKey(prefix: string, id: string, orgId?: string): string {
    return `${orgId ? `${orgId}:` : ''}${prefix}:${id}`;
  }

  private getOrgItems<T>(map: Map<string, T>, prefix: string, orgId?: string): T[] {
    return Array.from(map.entries())
      .filter(([key]) => key.startsWith(`${orgId ? `${orgId}:` : ''}${prefix}:`))
      .map(([key, value]) => ({ ...value, id: key.split(':').pop() })) as T[];
  }

  // Helper function to generate md5 hash
  private generateHash(data: any): string {
    return createHash('md5').update(JSON.stringify(data)).digest('hex');
  }

  // Helper function to read last N lines from file without reading entire file
  private readLastLines(filePath: string, lineCount: number): string[] {
    if (!fs.existsSync(filePath)) return [];

    const BUFFER_SIZE = 8192;
    const fd = fs.openSync(filePath, 'r');
    const stats = fs.statSync(filePath);
    let fileSize = stats.size;

    if (fileSize === 0) {
      fs.closeSync(fd);
      return [];
    }

    const lines: string[] = [];
    let buffer = Buffer.alloc(BUFFER_SIZE);
    let leftover = '';
    let position = fileSize;

    try {
      while (lines.length < lineCount && position > 0) {
        const chunkSize = Math.min(BUFFER_SIZE, position);
        position = Math.max(0, position - chunkSize);

        const bytesRead = fs.readSync(fd, buffer, 0, chunkSize, position);
        const chunk = buffer.subarray(0, bytesRead).toString('utf-8') + leftover;

        const chunkLines = chunk.split('\n');
        leftover = chunkLines.shift() || '';

        // Add lines from end to beginning
        for (let i = chunkLines.length - 1; i >= 0 && lines.length < lineCount; i--) {
          if (chunkLines[i].trim()) {
            lines.unshift(chunkLines[i]);
          }
        }
      }

      // Add leftover if we're at the start of file
      if (position === 0 && leftover.trim() && lines.length < lineCount) {
        lines.unshift(leftover);
      }

    } finally {
      fs.closeSync(fd);
    }

    return lines.slice(-lineCount);
  }

  // Helper function to read runs from logs file
  private readRunsFromLogs(orgId?: string, configId?: string, maxRuns?: number): RunResult[] {
    try {
      // Read more lines than needed to account for filtering
      const linesToRead = maxRuns ? maxRuns * 3 : 1000;
      const lines = this.readLastLines(this.logsFilePath, linesToRead);

      const runs: RunResult[] = [];

      for (const line of lines) {
        try {
          const run = JSON.parse(line, (key, value) => {
            if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
              return new Date(value);
            }
            return value;
          }) as RunResult & { orgId: string };

          // Filter by orgId and configId if specified
          if (orgId && run.orgId && run.orgId !== orgId) continue;
          if (configId && run.config?.id !== configId) continue;

          runs.push(run);

          // Stop early if we have enough
          if (maxRuns && runs.length >= maxRuns) break;
        } catch (parseError) {
          logMessage('warn', `Failed to parse log line: ${line}`);
        }
      }
      return runs.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    } catch (error) {
      logMessage('error', 'Failed to read runs from logs: ' + error);
      return [];
    }
  }

  // Helper function to write run to logs file
  private appendRunToLogs(run: RunResult, orgId: string): void {
    try {
      const runWithOrgId = { ...run, orgId };
      const logLine = JSON.stringify(runWithOrgId) + '\n';
      fs.appendFileSync(this.logsFilePath, logLine, { mode: 0o644 });
    } catch (error) {
      logMessage('error', 'Failed to append run to logs: ' + error);
      throw error;
    }
  }

  // Helper function to remove run from logs file
  private removeRunFromLogs(id: string, orgId?: string): boolean {
    try {
      if (!fs.existsSync(this.logsFilePath)) {
        return false;
      }

      const content = fs.readFileSync(this.logsFilePath, 'utf-8');
      if (!content.trim()) {
        return false;
      }

      const lines = content.trim().split('\n');
      const filteredLines: string[] = [];
      let found = false;

      for (const line of lines) {
        try {
          const run = JSON.parse(line) as RunResult & { orgId: string };
          if (run.id === id && (!orgId || run.orgId === orgId)) {
            found = true;
            continue; // Skip this line
          }
          filteredLines.push(line);
        } catch (parseError) {
          // Keep unparseable lines
          filteredLines.push(line);
        }
      }

      if (found) {
        const newContent = filteredLines.length > 0 ? filteredLines.join('\n') + '\n' : '';
        fs.writeFileSync(this.logsFilePath, newContent, { mode: 0o644 });
      }

      return found;
    } catch (error) {
      logMessage('error', 'Failed to remove run from logs: ' + error);
      return false;
    }
  }

  // API Config Methods
  async getApiConfig(id: string, orgId: string): Promise<ApiConfig | null> {
    if (!id) return null;
    const key = this.getKey('api', id, orgId);
    const config = this.storage.apis.get(key);
    return config ? { ...config, id } : null;
  }

  async listApiConfigs(limit = 10, offset = 0, orgId?: string): Promise<{ items: ApiConfig[], total: number }> {
    const orgItems = this.getOrgItems(this.storage.apis, 'api', orgId);
    const items = orgItems
      .slice(offset, offset + limit);
    const total = orgItems.length;
    return { items, total };
  }

  async upsertApiConfig(id: string, config: ApiConfig, orgId?: string): Promise<ApiConfig> {
    if (!id || !config) return null;
    const key = this.getKey('api', id, orgId);
    this.storage.apis.set(key, config);
    await this.persist();
    return { ...config, id };
  }

  async deleteApiConfig(id: string, orgId: string): Promise<boolean> {
    if (!id) return false;
    const key = this.getKey('api', id, orgId);
    const deleted = this.storage.apis.delete(key);
    await this.persist();
    return deleted;
  }

  // Extract Config Methods
  async getExtractConfig(id: string, orgId: string): Promise<ExtractConfig | null> {
    if (!id) return null;
    const key = this.getKey('extract', id, orgId);
    const config = this.storage.extracts.get(key);
    return config ? { ...config, id } : null;
  }

  async listExtractConfigs(limit = 10, offset = 0, orgId?: string): Promise<{ items: ExtractConfig[], total: number }> {
    const items = this.getOrgItems(this.storage.extracts, 'extract', orgId)
      .slice(offset, offset + limit);
    const total = this.getOrgItems(this.storage.extracts, 'extract', orgId).length;
    return { items, total };
  }

  async upsertExtractConfig(id: string, config: ExtractConfig, orgId: string): Promise<ExtractConfig> {
    if (!id || !config) return null;
    const key = this.getKey('extract', id, orgId);
    this.storage.extracts.set(key, config);
    await this.persist();
    return { ...config, id };
  }

  async deleteExtractConfig(id: string, orgId: string): Promise<boolean> {
    if (!id) return false;
    const key = this.getKey('extract', id, orgId);
    const deleted = this.storage.extracts.delete(key);
    await this.persist();
    return deleted;
  }

  // Transform Config Methods
  async getTransformConfig(id: string, orgId: string): Promise<TransformConfig | null> {
    if (!id) return null;
    const key = this.getKey('transform', id, orgId);
    const config = this.storage.transforms.get(key);
    return config ? { ...config, id } : null;
  }

  async listTransformConfigs(limit = 10, offset = 0, orgId?: string): Promise<{ items: TransformConfig[], total: number }> {
    const items = this.getOrgItems(this.storage.transforms, 'transform', orgId)
      .slice(offset, offset + limit);
    const total = this.getOrgItems(this.storage.transforms, 'transform', orgId).length;
    return { items, total };
  }

  async upsertTransformConfig(id: string, config: TransformConfig, orgId: string): Promise<TransformConfig> {
    if (!id || !config) return null;
    const key = this.getKey('transform', id, orgId);
    this.storage.transforms.set(key, config);
    await this.persist();
    return { ...config, id };
  }

  async deleteTransformConfig(id: string, orgId: string): Promise<boolean> {
    if (!id) return false;
    const key = this.getKey('transform', id, orgId);
    const deleted = this.storage.transforms.delete(key);
    await this.persist();
    return deleted;
  }

  // Run Result Methods
  async getRun(id: string, orgId: string): Promise<RunResult | null> {
    if (!id) return null;

    const runs = this.readRunsFromLogs(orgId);
    const run = runs.find(r => r.id === id);
    if (!run) return null;
    if ((run as any).orgId) delete (run as any).orgId;
    return run || null;
  }

  async createRun(run: RunResult, orgId: string): Promise<RunResult> {
    if (!run) return null;

    // Only log runs if disable_logs environment variable is not set
    if (String(process.env.DISABLE_LOGS).toLowerCase() !== 'true') {
      this.appendRunToLogs(run, orgId);
    }

    return run;
  }

  async listRuns(limit = 10, offset = 0, configId?: string, orgId?: string): Promise<{ items: RunResult[], total: number }> {
    const allRuns = this.readRunsFromLogs(orgId, configId);
    const items = allRuns.slice(offset, offset + limit).map(run => {
      if ((run as any).orgId) delete (run as any).orgId;
      return run;
    });
    return { items, total: allRuns.length };
  }

  async deleteRun(id: string, orgId: string): Promise<boolean> {
    if (!id) return false;
    return this.removeRunFromLogs(id, orgId);
  }

  async deleteAllRuns(orgId: string): Promise<boolean> {
    try {
      if (!fs.existsSync(this.logsFilePath)) {
        return true;
      }

      const content = fs.readFileSync(this.logsFilePath, 'utf-8');
      if (!content.trim()) {
        return true;
      }

      const lines = content.trim().split('\n');
      const filteredLines: string[] = [];

      for (const line of lines) {
        try {
          const run = JSON.parse(line) as RunResult & { orgId: string };
          if (run.orgId !== orgId) {
            filteredLines.push(line);
          }
        } catch (parseError) {
          // Keep unparseable lines
          filteredLines.push(line);
        }
      }

      const newContent = filteredLines.length > 0 ? filteredLines.join('\n') + '\n' : '';
      fs.writeFileSync(this.logsFilePath, newContent, { mode: 0o644 });
      return true;
    } catch (error) {
      logMessage('error', 'Failed to delete all runs: ' + error);
      return false;
    }
  }

  async clearAll(): Promise<void> {
    this.storage.apis.clear();
    this.storage.extracts.clear();
    this.storage.transforms.clear();
    this.storage.workflows.clear();
    this.storage.integrations.clear();
    await this.persist();

    // Clear logs file
    try {
      fs.writeFileSync(this.logsFilePath, '', { mode: 0o644 });
    } catch (error) {
      logMessage('error', 'Failed to clear logs file: ' + error);
    }
  }

  async disconnect(): Promise<void> {
    await this.persist();
  }

  async ping(): Promise<boolean> {
    return true;
  }

  async getTenantInfo(): Promise<{ email: string | null; emailEntrySkipped: boolean }> {
    return this.storage.tenant;
  }

  async setTenantInfo(email?: string, emailEntrySkipped?: boolean): Promise<void> {
    const currentInfo = this.storage.tenant;
    this.storage.tenant = {
      email: email !== undefined ? email : currentInfo.email,
      emailEntrySkipped: emailEntrySkipped !== undefined ? emailEntrySkipped : currentInfo.emailEntrySkipped
    };
    await this.persist();
  }

  // Workflow Methods
  async getWorkflow(id: string, orgId?: string): Promise<Workflow | null> {
    if (!id) return null;
    const key = this.getKey('workflow', id, orgId);
    const workflow = this.storage.workflows.get(key);
    return workflow ? { ...workflow, id } : null;
  }

  async listWorkflows(limit = 10, offset = 0, orgId?: string): Promise<{ items: Workflow[], total: number }> {
    const items = this.getOrgItems(this.storage.workflows, 'workflow', orgId)
      .slice(offset, offset + limit);
    const total = this.getOrgItems(this.storage.workflows, 'workflow', orgId).length;
    return { items, total };
  }

  async upsertWorkflow(id: string, workflow: Workflow, orgId?: string): Promise<Workflow> {
    if (!id || !workflow) return null;
    const key = this.getKey('workflow', id, orgId);
    this.storage.workflows.set(key, workflow);
    await this.persist();
    return { ...workflow, id };
  }

  async deleteWorkflow(id: string, orgId?: string): Promise<boolean> {
    if (!id) return false;
    const key = this.getKey('workflow', id, orgId);
    const deleted = this.storage.workflows.delete(key);
    await this.persist();
    return deleted;
  }

  // Integration Methods
  async getIntegration(id: string, orgId?: string): Promise<Integration | null> {
    if (!id) return null;
    const key = this.getKey('integration', id, orgId);
    const integration = this.storage.integrations.get(key);
    return integration ? { ...integration, id } : null;
  }

  async listIntegrations(limit = 10, offset = 0, orgId?: string): Promise<{ items: Integration[], total: number }> {
    const orgItems = this.getOrgItems(this.storage.integrations, 'integration', orgId);
    const items = orgItems.slice(offset, offset + limit);
    const total = orgItems.length;
    return { items, total };
  }

  async upsertIntegration(id: string, integration: Integration, orgId?: string): Promise<Integration> {
    if (!id || !integration) return null;
    const key = this.getKey('integration', id, orgId);
    this.storage.integrations.set(key, integration);
    await this.persist();
    return { ...integration, id };
  }

  async deleteIntegration(id: string, orgId?: string): Promise<boolean> {
    if (!id) return false;
    const key = this.getKey('integration', id, orgId);
    const deleted = this.storage.integrations.delete(key);
    await this.persist();
    return deleted;
  }
} 