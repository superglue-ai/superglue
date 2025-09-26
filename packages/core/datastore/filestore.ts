import type { ApiConfig, ExtractConfig, Integration, RunResult, TransformConfig, Workflow } from "@superglue/client";
import fs from 'node:fs';
import path from 'node:path';
import { credentialEncryption } from "../utils/encryption.js";
import { logMessage } from "../utils/logs.js";
import type { DataStore, WorkflowScheduleInternal } from "./types.js";

export class FileStore implements DataStore {

  private storage: {
    apis: Map<string, ApiConfig>;
    extracts: Map<string, ExtractConfig>;
    transforms: Map<string, TransformConfig>;
    workflows: Map<string, Workflow>;
    workflowSchedules: Map<string, WorkflowScheduleInternal>;
    integrations: Map<string, Integration>;
    tenant: {
      email: string | null;
      emailEntrySkipped: boolean;
    };
  };

  private filePath: string;
  private logsFilePath: string;
  private initialized: boolean = false;
  private initPromise: Promise<void> | null = null;

  constructor(storageDir = '/data') {
    this.storage = {
      apis: new Map(),
      extracts: new Map(),
      transforms: new Map(),
      workflows: new Map(),
      workflowSchedules: new Map(),
      integrations: new Map(),
      tenant: {
        email: null,
        emailEntrySkipped: false
      }
    };

    this.filePath = path.join(storageDir, 'superglue_data.json');
    this.logsFilePath = path.join(storageDir, 'superglue_logs.jsonl');

    this.ensureInitialized();
    logMessage('info', `File Datastore: Initial storage path: ${this.filePath}`);
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    if (!this.initPromise) {
      this.initPromise = this.initializeStorage();
    }

    await this.initPromise;
  }

  private async initializeStorage(): Promise<void> {
    try {
      try {
        await fs.promises.access(path.dirname(this.filePath));
      } catch {
        if (this.filePath.startsWith('/data/')) {
          logMessage('warn', 'File Datastore: "/data" directory not found, switching to local ".superglue" directory');
          this.filePath = path.join('./.superglue', 'superglue_data.json');
          this.logsFilePath = path.join('./.superglue', 'superglue_logs.jsonl');
          logMessage('info', `File Datastore: Updated storage path: ${this.filePath}`);
        }
      }

      // Ensure the directory exists with proper permissions
      await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true, mode: 0o755 });
      logMessage('info', `File Datastore: Created/verified directory: ${path.dirname(this.filePath)}`);

      try {
        const data = await fs.promises.readFile(this.filePath, 'utf-8');
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
          workflowSchedules: new Map(Object.entries(parsed.workflowSchedules || {})),
          integrations: new Map(Object.entries(parsed.integrations || {})),
          tenant: {
            email: parsed.tenant?.email || null,
            emailEntrySkipped: parsed.tenant?.emailEntrySkipped || false
          }
        };
        logMessage('info', 'File Datastore: Successfully loaded existing data');
      } catch (error) {
        logMessage('error', 'File Datastore: Error loading data: ' + error);
        try {
          await fs.promises.access(this.filePath);
          logMessage('error', 'COULD NOT LOAD FROM EXISTING FILE. EXITING. ' + error);
          process.exit(1);
        } catch {
          logMessage('info', 'File Datastore: No existing data found, starting with empty storage');
          await this.persist();
        }
      }

      // Ensure logs file exists
      try {
        await fs.promises.access(this.logsFilePath);
      } catch {
        await fs.promises.writeFile(this.logsFilePath, '');
        logMessage('info', 'Logs Datastore: Created empty logs file');
      }

      this.initialized = true;
    } catch (error) {
      logMessage('error', 'Failed to initialize storage: ' + error);
      throw error;
    }
  }


  private isPersisting = false;
  private async persist() {
    try {
      while (this.isPersisting) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      this.isPersisting = true;
      const serialized = {
        apis: Object.fromEntries(this.storage.apis),
        extracts: Object.fromEntries(this.storage.extracts),
        transforms: Object.fromEntries(this.storage.transforms),
        workflows: Object.fromEntries(this.storage.workflows),
        workflowSchedules: Object.fromEntries(this.storage.workflowSchedules),
        integrations: Object.fromEntries(this.storage.integrations),
        tenant: this.storage.tenant
      };
      await fs.promises.writeFile(this.filePath, JSON.stringify(serialized, null, 2), { mode: 0o644 });
    } catch (error) {
      logMessage('error', 'Failed to persist data: ' + error);
      throw error;
    }
    finally {
      this.isPersisting = false;
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

  // Helper function to read last N lines from file without reading entire file (async version)
  private async readLastLines(filePath: string, lineCount: number): Promise<string[]> {
    try {
      await fs.promises.access(filePath);
    } catch {
      return [];
    }

    const BUFFER_SIZE = 8192;
    let fileHandle: fs.promises.FileHandle;

    try {
      fileHandle = await fs.promises.open(filePath, 'r');
      const stats = await fileHandle.stat();
      let fileSize = stats.size;

      if (fileSize === 0) {
        await fileHandle.close();
        return [];
      }

      const lines: string[] = [];
      let buffer = Buffer.alloc(BUFFER_SIZE);
      let leftover = '';
      let position = fileSize;

      while (lines.length < lineCount && position > 0) {
        const chunkSize = Math.min(BUFFER_SIZE, position);
        position = Math.max(0, position - chunkSize);

        const result = await fileHandle.read(buffer, 0, chunkSize, position);
        const chunk = buffer.subarray(0, result.bytesRead).toString('utf-8') + leftover;

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

      await fileHandle.close();
      return lines.slice(-lineCount);
    } catch (error) {
      if (fileHandle!) {
        await fileHandle.close();
      }
      logMessage('error', 'Failed to read last lines: ' + error);
      return [];
    }
  }

  // Helper function to read runs from logs file
  private async readRunsFromLogs(orgId?: string, configId?: string, maxRuns?: number): Promise<RunResult[]> {
    try {
      // Read more lines than needed to account for filtering
      const linesToRead = maxRuns ? maxRuns * 3 : 1000;
      const lines = await this.readLastLines(this.logsFilePath, linesToRead);

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
  private async appendRunToLogs(run: RunResult, orgId: string): Promise<void> {
    try {
      const runWithOrgId = { ...run, orgId };
      const logLine = JSON.stringify(runWithOrgId) + '\n';
      await fs.promises.appendFile(this.logsFilePath, logLine, { mode: 0o644 });
    } catch (error) {
      logMessage('error', 'Failed to append run to logs: ' + error);
      throw error;
    }
  }

  // Helper function to remove run from logs file
  private async removeRunFromLogs(id: string, orgId?: string): Promise<boolean> {
    try {
      try {
        await fs.promises.access(this.logsFilePath);
      } catch {
        return false;
      }

      const content = await fs.promises.readFile(this.logsFilePath, 'utf-8');
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
        await fs.promises.writeFile(this.logsFilePath, newContent, { mode: 0o644 });
      }

      return found;
    } catch (error) {
      logMessage('error', 'Failed to remove run from logs: ' + error);
      return false;
    }
  }

  // API Config Methods
  async getApiConfig(params: { id: string; orgId?: string }): Promise<ApiConfig | null> {
    await this.ensureInitialized();
    const { id, orgId } = params;
    if (!id) return null;
    const key = this.getKey('api', id, orgId);
    const config = this.storage.apis.get(key);
    return config ? { ...config, id } : null;
  }

  async listApiConfigs(params?: { limit?: number; offset?: number; orgId?: string }): Promise<{ items: ApiConfig[], total: number }> {
    await this.ensureInitialized();
    const { limit = 10, offset = 0, orgId } = params || {};
    const orgItems = this.getOrgItems(this.storage.apis, 'api', orgId);
    const items = orgItems
      .slice(offset, offset + limit);
    const total = orgItems.length;
    return { items, total };
  }

  async upsertApiConfig(params: { id: string; config: ApiConfig; orgId?: string }): Promise<ApiConfig> {
    await this.ensureInitialized();
    const { id, config, orgId } = params;
    if (!id || !config) return null;
    const key = this.getKey('api', id, orgId);
    this.storage.apis.set(key, config);
    await this.persist();
    return { ...config, id };
  }

  async deleteApiConfig(params: { id: string; orgId?: string }): Promise<boolean> {
    await this.ensureInitialized();
    const { id, orgId } = params;
    if (!id) return false;
    const key = this.getKey('api', id, orgId);
    const deleted = this.storage.apis.delete(key);
    await this.persist();
    return deleted;
  }

  // Extract Config Methods
  async getExtractConfig(params: { id: string; orgId?: string }): Promise<ExtractConfig | null> {
    await this.ensureInitialized();
    const { id, orgId } = params;
    if (!id) return null;
    const key = this.getKey('extract', id, orgId);
    const config = this.storage.extracts.get(key);
    return config ? { ...config, id } : null;
  }

  async listExtractConfigs(params?: { limit?: number; offset?: number; orgId?: string }): Promise<{ items: ExtractConfig[], total: number }> {
    await this.ensureInitialized();
    const { limit = 10, offset = 0, orgId } = params || {};
    const items = this.getOrgItems(this.storage.extracts, 'extract', orgId)
      .slice(offset, offset + limit);
    const total = this.getOrgItems(this.storage.extracts, 'extract', orgId).length;
    return { items, total };
  }

  async upsertExtractConfig(params: { id: string; config: ExtractConfig; orgId?: string }): Promise<ExtractConfig> {
    await this.ensureInitialized();
    const { id, config, orgId } = params;
    if (!id || !config) return null;
    const key = this.getKey('extract', id, orgId);
    this.storage.extracts.set(key, config);
    await this.persist();
    return { ...config, id };
  }

  async deleteExtractConfig(params: { id: string; orgId?: string }): Promise<boolean> {
    await this.ensureInitialized();
    const { id, orgId } = params;
    if (!id) return false;
    const key = this.getKey('extract', id, orgId);
    const deleted = this.storage.extracts.delete(key);
    await this.persist();
    return deleted;
  }

  // Transform Config Methods  
  async getTransformConfig(params: { id: string; orgId?: string }): Promise<TransformConfig | null> {
    await this.ensureInitialized();
    const { id, orgId } = params;
    if (!id) return null;
    const key = this.getKey('transform', id, orgId);
    const config = this.storage.transforms.get(key);
    return config ? { ...config, id } : null;
  }

  async listTransformConfigs(params?: { limit?: number; offset?: number; orgId?: string }): Promise<{ items: TransformConfig[], total: number }> {
    await this.ensureInitialized();
    const { limit = 10, offset = 0, orgId } = params || {};
    const items = this.getOrgItems(this.storage.transforms, 'transform', orgId)
      .slice(offset, offset + limit);
    const total = this.getOrgItems(this.storage.transforms, 'transform', orgId).length;
    return { items, total };
  }

  async upsertTransformConfig(params: { id: string; config: TransformConfig; orgId?: string }): Promise<TransformConfig> {
    await this.ensureInitialized();
    const { id, config, orgId } = params;
    if (!id || !config) return null;
    const key = this.getKey('transform', id, orgId);
    this.storage.transforms.set(key, config);
    await this.persist();
    return { ...config, id };
  }

  async deleteTransformConfig(params: { id: string; orgId?: string }): Promise<boolean> {
    await this.ensureInitialized();
    const { id, orgId } = params;
    if (!id) return false;
    const key = this.getKey('transform', id, orgId);
    const deleted = this.storage.transforms.delete(key);
    await this.persist();
    return deleted;
  }

  // Run Result Methods
  async getRun(params: { id: string; orgId?: string }): Promise<RunResult | null> {
    await this.ensureInitialized();
    const { id, orgId } = params;
    if (!id) return null;

    const runs = await this.readRunsFromLogs(orgId);
    const run = runs.find(r => r.id === id);
    if (!run) return null;
    if ((run as any).orgId) delete (run as any).orgId;
    return run || null;
  }

  async createRun(params: { result: RunResult; orgId?: string }): Promise<RunResult> {
    await this.ensureInitialized();
    const { result: run, orgId } = params;
    if (!run) return null;
    if ((run as any).stepResults) delete (run as any).stepResults;

    // Only log runs if disable_logs environment variable is not set
    if (String(process.env.DISABLE_LOGS).toLowerCase() !== 'true') {
      await this.appendRunToLogs(run, orgId);
    }

    return run;
  }

  async listRuns(params?: { limit?: number; offset?: number; configId?: string; orgId?: string }): Promise<{ items: RunResult[], total: number }> {
    await this.ensureInitialized();
    const { limit = 10, offset = 0, configId, orgId } = params || {};
    const allRuns = await this.readRunsFromLogs(orgId, configId);

    // Filter out invalid runs
    const validRuns = allRuns.filter((run): run is RunResult =>
      run !== null &&
      run.config &&
      run.config.id &&
      run.startedAt instanceof Date
    ).map(run => {
      if ((run as any).orgId) delete (run as any).orgId;
      return run;
    });

    const items = validRuns.slice(offset, offset + limit);
    return { items, total: validRuns.length };
  }

  async deleteRun(params: { id: string; orgId?: string }): Promise<boolean> {
    await this.ensureInitialized();
    const { id, orgId } = params;
    if (!id) return false;
    return this.removeRunFromLogs(id, orgId);
  }

  async deleteAllRuns(params?: { orgId?: string }): Promise<boolean> {
    await this.ensureInitialized();
    const { orgId } = params || {};
    try {
      try {
        await fs.promises.access(this.logsFilePath);
      } catch {
        // Logs file doesn't exist, nothing to delete
        return true;
      }

      // Read all existing logs
      const logs = await fs.promises.readFile(this.logsFilePath, 'utf-8');
      const lines = logs.split('\n').filter(line => line.trim());

      // Filter out logs for the specified org
      const remainingLines = lines.filter(line => {
        try {
          const logEntry = JSON.parse(line);
          return logEntry.orgId !== orgId;
        } catch {
          return true; // Keep malformed lines
        }
      });

      // Write back the filtered logs
      await fs.promises.writeFile(this.logsFilePath, remainingLines.join('\n') + '\n');
      return true;
    } catch (error) {
      logMessage('error', 'Failed to delete all runs: ' + error);
      return false;
    }
  }

  async clearAll(): Promise<void> {
    await this.ensureInitialized();
    this.storage.apis.clear();
    this.storage.extracts.clear();
    this.storage.transforms.clear();
    this.storage.workflows.clear();
    this.storage.workflowSchedules.clear();
    this.storage.integrations.clear();
    await this.persist();

    // Clear logs file
    try {
      await fs.promises.writeFile(this.logsFilePath, '', { mode: 0o644 });
    } catch (error) {
      logMessage('error', 'Failed to clear logs file: ' + error);
    }
  }

  async disconnect(): Promise<void> {
    await this.ensureInitialized();
    await this.persist();
  }

  async ping(): Promise<boolean> {
    await this.ensureInitialized();
    return true;
  }

  async getTenantInfo(): Promise<{ email: string | null; emailEntrySkipped: boolean }> {
    await this.ensureInitialized();
    return this.storage.tenant;
  }

  async setTenantInfo(params?: { email?: string; emailEntrySkipped?: boolean }): Promise<void> {
    await this.ensureInitialized();
    const { email, emailEntrySkipped } = params || {};
    const currentInfo = this.storage.tenant;
    this.storage.tenant = {
      email: email !== undefined ? email : currentInfo.email,
      emailEntrySkipped: emailEntrySkipped !== undefined ? emailEntrySkipped : currentInfo.emailEntrySkipped
    };
    await this.persist();
  }

  // Workflow Methods
  async getWorkflow(params: { id: string; orgId?: string }): Promise<Workflow | null> {
    await this.ensureInitialized();
    const { id, orgId } = params;
    if (!id) return null;
    const key = this.getKey('workflow', id, orgId);
    const workflow = this.storage.workflows.get(key);
    return workflow ? { ...workflow, id } : null;
  }

  async listWorkflows(params?: { limit?: number; offset?: number; orgId?: string }): Promise<{ items: Workflow[], total: number }> {
    await this.ensureInitialized();
    const { limit = 10, offset = 0, orgId } = params || {};
    const items = this.getOrgItems(this.storage.workflows, 'workflow', orgId)
      .slice(offset, offset + limit);
    const total = this.getOrgItems(this.storage.workflows, 'workflow', orgId).length;
    return { items, total };
  }

  async getManyWorkflows(params: { ids: string[]; orgId?: string }): Promise<Workflow[]> {
    await this.ensureInitialized();
    const { ids, orgId } = params;
    return ids
      .map(id => {
        const key = this.getKey('workflow', id, orgId);
        const workflow = this.storage.workflows.get(key);
        return workflow ? { ...workflow, id } : null;
      })
      .filter((w): w is Workflow => w !== null);
  }

  async upsertWorkflow(params: { id: string; workflow: Workflow; orgId?: string }): Promise<Workflow> {
    await this.ensureInitialized();
    const { id, workflow, orgId } = params;
    if (!id || !workflow) return null;
    const key = this.getKey('workflow', id, orgId);
    this.storage.workflows.set(key, workflow);
    await this.persist();
    return { ...workflow, id };
  }

  async deleteWorkflow(params: { id: string; orgId?: string }): Promise<boolean> {
    await this.ensureInitialized();
    const { id, orgId } = params;
    if (!id) return false;
    const key = this.getKey('workflow', id, orgId);
    const deleted = this.storage.workflows.delete(key);
    await this.persist();
    return deleted;
  }

  // Integration Methods
  async getIntegration(params: { id: string; includeDocs?: boolean; orgId?: string }): Promise<Integration | null> {
    await this.ensureInitialized();
    const { id, includeDocs = true, orgId } = params;
    if (!id) return null;
    const key = this.getKey('integration', id, orgId);
    const integration = this.storage.integrations.get(key);
    if (!integration) return null;

    // Decrypt credentials if encryption is enabled
    const decryptedIntegration = { ...integration, id };
    if (decryptedIntegration.credentials) {
      decryptedIntegration.credentials = credentialEncryption.decrypt(decryptedIntegration.credentials);
    }

    return decryptedIntegration;
  }

  async listIntegrations(params?: { limit?: number; offset?: number; includeDocs?: boolean; orgId?: string }): Promise<{ items: Integration[], total: number }> {
    await this.ensureInitialized();
    const { limit = 10, offset = 0, includeDocs = true, orgId } = params || {};
    const orgItems = this.getOrgItems(this.storage.integrations, 'integration', orgId);
    const items = orgItems
      .slice(offset, offset + limit)
      .map(integration => {
        const decrypted = { ...integration };
        if (decrypted.credentials) {
          decrypted.credentials = credentialEncryption.decrypt(decrypted.credentials);
        }
        return decrypted;
      });
    const total = orgItems.length;
    return { items, total };
  }

  async getManyIntegrations(params: { ids: string[]; orgId?: string }): Promise<Integration[]> {
    await this.ensureInitialized();
    const { ids, orgId } = params;
    return ids
      .map(id => {
        const key = this.getKey('integration', id, orgId);
        const integration = this.storage.integrations.get(key);
        if (!integration) return null;
        const decrypted = { ...integration, id };
        if (decrypted.credentials) {
          decrypted.credentials = credentialEncryption.decrypt(decrypted.credentials);
        }
        return decrypted;
      })
      .filter((i): i is Integration => i !== null);
  }

  async upsertIntegration(params: { id: string; integration: Integration; orgId?: string }): Promise<Integration> {
    await this.ensureInitialized();
    const { id, integration, orgId } = params;
    if (!id || !integration) return null;
    const key = this.getKey('integration', id, orgId);

    // Encrypt credentials if encryption is enabled and credentials exist
    const toStore = { ...integration };
    if (toStore.credentials) {
      toStore.credentials = credentialEncryption.encrypt(toStore.credentials);
    }

    this.storage.integrations.set(key, toStore);
    await this.persist();
    return { ...integration, id };
  }

  async deleteIntegration(params: { id: string; orgId?: string }): Promise<boolean> {
    await this.ensureInitialized();
    const { id, orgId } = params;
    if (!id) return false;
    const key = this.getKey('integration', id, orgId);
    const deleted = this.storage.integrations.delete(key);
    await this.persist();
    return deleted;
  }

  // Workflow Schedule Methods
  async listWorkflowSchedules(params: { workflowId: string, orgId: string }): Promise<WorkflowScheduleInternal[]> {
    await this.ensureInitialized();
    const { workflowId, orgId } = params;
    return this.getOrgItems(this.storage.workflowSchedules, 'workflow-schedule', orgId)
      .filter(schedule => schedule.workflowId === workflowId);
  }

  async getWorkflowSchedule(params: { id: string; orgId?: string }): Promise<WorkflowScheduleInternal | null> {
    await this.ensureInitialized();
    const { id, orgId } = params;
    if (!id) return null;
    const key = this.getKey('workflow-schedule', id, orgId);
    const schedule = this.storage.workflowSchedules.get(key);
    return schedule ? { ...schedule, id } : null;
  }

  async upsertWorkflowSchedule(params: { schedule: WorkflowScheduleInternal }): Promise<void> {
    await this.ensureInitialized();
    const { schedule } = params;
    if (!schedule || !schedule.id) return;
    const key = this.getKey('workflow-schedule', schedule.id, schedule.orgId);
    this.storage.workflowSchedules.set(key, schedule);
    await this.persist();
  }

  async deleteWorkflowSchedule(params: { id: string, orgId: string }): Promise<boolean> {
    await this.ensureInitialized();
    const { id, orgId } = params;
    if (!id) return false;
    const key = this.getKey('workflow-schedule', id, orgId);
    const deleted = this.storage.workflowSchedules.delete(key);
    await this.persist();
    return deleted;
  }

  async listDueWorkflowSchedules(): Promise<WorkflowScheduleInternal[]> {
    await this.ensureInitialized();
    const now = new Date();
    return Array.from(this.storage.workflowSchedules.entries())
      .filter(([key]) => key.includes(':workflow-schedule:'))
      .map(([key, value]) => ({ ...value, id: key.split(':').pop() }))
      .filter(schedule => schedule.enabled && schedule.nextRunAt <= now);
  }

  async updateScheduleNextRun(params: { id: string; nextRunAt: Date; lastRunAt: Date; }): Promise<boolean> {
    await this.ensureInitialized();
    const { id, nextRunAt, lastRunAt } = params;
    if (!id) return false;

    // Find the schedule by searching all orgs since we don't have orgId in params
    for (const [key, schedule] of this.storage.workflowSchedules.entries()) {
      if (schedule.id === id) {
        const updatedSchedule = {
          ...schedule,
          nextRunAt,
          lastRunAt,
          updatedAt: new Date()
        };
        this.storage.workflowSchedules.set(key, updatedSchedule);
        await this.persist();
        return true;
      }
    }
    return false;
  }

  async getTemplateOAuthCredentials(templateId: string): Promise<{ client_id: string; client_secret: string } | null> {
    // FileStore doesn't support template OAuth credentials
    // This is only available in PostgresStore with database configuration
    return null;
  }
} 