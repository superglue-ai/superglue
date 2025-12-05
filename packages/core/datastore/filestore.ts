import type { ApiConfig, Integration, Run, RunStatus, Tool } from "@superglue/shared";
import fs from 'node:fs';
import path from 'node:path';
import { credentialEncryption } from "../utils/encryption.js";
import { logMessage } from "../utils/logs.js";
import type { DataStore, ToolScheduleInternal } from "./types.js";

function isLegacyRunData(data: any): boolean {
  return !data.status || !['running', 'success', 'failed', 'aborted'].includes(data.status);
}

function migrateFileStoreRun(data: any): Run {
  if (isLegacyRunData(data)) {
    return {
      id: data.id,
      toolId: data.config?.id || '',
      orgId: data.orgId || '',
      status: data.success === true ? 'success' as RunStatus : 'failed' as RunStatus,
      toolConfig: data.config,
      toolPayload: undefined,
      toolResult: data.data,
      options: undefined,
      error: data.error,
      startedAt: data.startedAt ? new Date(data.startedAt) : new Date(),
      completedAt: data.completedAt ? new Date(data.completedAt) : undefined
    };
  }
  return {
    ...data,
    startedAt: data.startedAt ? new Date(data.startedAt) : new Date(),
    completedAt: data.completedAt ? new Date(data.completedAt) : undefined
  };
}

export class FileStore implements DataStore {

  private storage: {
    apis: Map<string, ApiConfig>;
    workflows: Map<string, Tool>;
    workflowSchedules: Map<string, ToolScheduleInternal>;
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

  private async readRunsFromLogs(orgId?: string, configId?: string, maxRuns?: number): Promise<Run[]> {
    try {
      const linesToRead = maxRuns ? maxRuns * 3 : 1000;
      const lines = await this.readLastLines(this.logsFilePath, linesToRead);

      const runs: Run[] = [];

      for (const line of lines) {
        try {
          const rawData = JSON.parse(line);
          const run = migrateFileStoreRun(rawData);

          if (orgId && run.orgId && run.orgId !== orgId) continue;
          const toolId = run.toolId || run.toolConfig?.id;
          if (configId && toolId !== configId) continue;

          runs.push(run);

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

  private async appendRunToLogs(run: Run): Promise<void> {
    try {
      const logLine = JSON.stringify(run) + '\n';
      await fs.promises.appendFile(this.logsFilePath, logLine, { mode: 0o644 });
    } catch (error) {
      logMessage('error', 'Failed to append run to logs: ' + error);
      throw error;
    }
  }

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
          const rawData = JSON.parse(line);
          const run = migrateFileStoreRun(rawData);
          if (run.id === id && (!orgId || run.orgId === orgId)) {
            found = true;
            continue;
          }
          filteredLines.push(line);
        } catch (parseError) {
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

  // Run Methods
  async getRun(params: { id: string; orgId?: string }): Promise<Run | null> {
    await this.ensureInitialized();
    const { id, orgId } = params;
    if (!id) return null;

    const runs = await this.readRunsFromLogs(orgId);
    return runs.find(r => r.id === id) || null;
  }

  async createRun(params: { run: Run }): Promise<Run> {
    await this.ensureInitialized();
    const { run } = params;
    if (!run) return null;

    if (String(process.env.DISABLE_LOGS).toLowerCase() !== 'true') {
      await this.appendRunToLogs(run);
    }

    return run;
  }

  async updateRun(params: { id: string; orgId: string; updates: Partial<Run> }): Promise<Run> {
    await this.ensureInitialized();
    const { id, orgId, updates } = params;
    
    const runs = await this.readRunsFromLogs(orgId);
    const existingRun = runs.find(r => r.id === id);
    
    if (!existingRun) {
      throw new Error(`Run with id ${id} not found`);
    }

    const updatedRun: Run = {
      ...existingRun,
      ...updates,
      id,
      orgId
    };

    await this.removeRunFromLogs(id, orgId);
    await this.appendRunToLogs(updatedRun);

    return updatedRun;
  }

  async listRuns(params?: { limit?: number; offset?: number; configId?: string; orgId?: string }): Promise<{ items: Run[], total: number }> {
    await this.ensureInitialized();
    const { limit = 10, offset = 0, configId, orgId } = params || {};
    const allRuns = await this.readRunsFromLogs(orgId, configId);

    const validRuns = allRuns.filter((run): run is Run =>
      run !== null &&
      run.id &&
      run.startedAt instanceof Date
    );

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
  async getWorkflow(params: { id: string; orgId?: string }): Promise<Tool | null> {
    await this.ensureInitialized();
    const { id, orgId } = params;
    if (!id) return null;
    const key = this.getKey('workflow', id, orgId);
    const workflow = this.storage.workflows.get(key);
    return workflow ? { ...workflow, id } : null;
  }

  async listWorkflows(params?: { limit?: number; offset?: number; orgId?: string }): Promise<{ items: Tool[], total: number }> {
    await this.ensureInitialized();
    const { limit = 10, offset = 0, orgId } = params || {};
    const items = this.getOrgItems(this.storage.workflows, 'workflow', orgId)
      .slice(offset, offset + limit);
    const total = this.getOrgItems(this.storage.workflows, 'workflow', orgId).length;
    return { items, total };
  }

  async getManyWorkflows(params: { ids: string[]; orgId?: string }): Promise<Tool[]> {
    await this.ensureInitialized();
    const { ids, orgId } = params;
    return ids
      .map(id => {
        const key = this.getKey('workflow', id, orgId);
        const workflow = this.storage.workflows.get(key);
        return workflow ? { ...workflow, id } : null;
      })
      .filter((w): w is Tool => w !== null);
  }

  async upsertWorkflow(params: { id: string; workflow: Tool; orgId?: string }): Promise<Tool> {
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

  async renameWorkflow(params: { oldId: string; newId: string; orgId?: string }): Promise<Tool> {
    await this.ensureInitialized();
    const { oldId, newId, orgId } = params;
    
    // Check if newId already exists
    const newKey = this.getKey('workflow', newId, orgId);
    if (this.storage.workflows.has(newKey)) {
      throw new Error(`Workflow with ID '${newId}' already exists`);
    }

    // Get old workflow
    const oldKey = this.getKey('workflow', oldId, orgId);
    const oldWorkflow = this.storage.workflows.get(oldKey);
    if (!oldWorkflow) {
      throw new Error(`Workflow with ID '${oldId}' not found`);
    }

    // Create new workflow with newId
    const newWorkflow: Tool = {
      ...oldWorkflow,
      id: newId,
      updatedAt: new Date()
    };

    // Save new workflow
    this.storage.workflows.set(newKey, newWorkflow);

    // Update all workflow schedules that reference this workflow
    for (const [key, schedule] of this.storage.workflowSchedules.entries()) {
      if (schedule.workflowId === oldId && schedule.orgId === (orgId || '')) {
        const updatedSchedule = {
          ...schedule,
          workflowId: newId,
          updatedAt: new Date()
        };
        this.storage.workflowSchedules.set(key, updatedSchedule);
      }
    }

    // Delete old workflow
    this.storage.workflows.delete(oldKey);

    await this.persist();
    return newWorkflow;
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

  async copyTemplateDocumentationToUserIntegration(params: { templateId: string; userIntegrationId: string; orgId?: string }): Promise<boolean> {
    // Not supported for file store
    return false;
  }

  // Workflow Schedule Methods
  async listWorkflowSchedules(params: { workflowId: string, orgId: string }): Promise<ToolScheduleInternal[]> {
    await this.ensureInitialized();
    const { workflowId, orgId } = params;
    return this.getOrgItems(this.storage.workflowSchedules, 'workflow-schedule', orgId)
      .filter(schedule => schedule.workflowId === workflowId);
  }

  async getWorkflowSchedule(params: { id: string; orgId?: string }): Promise<ToolScheduleInternal | null> {
    await this.ensureInitialized();
    const { id, orgId } = params;
    if (!id) return null;
    const key = this.getKey('workflow-schedule', id, orgId);
    const schedule = this.storage.workflowSchedules.get(key);
    return schedule ? { ...schedule, id } : null;
  }

  async upsertWorkflowSchedule(params: { schedule: ToolScheduleInternal }): Promise<void> {
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

  async listDueWorkflowSchedules(): Promise<ToolScheduleInternal[]> {
    await this.ensureInitialized();
    const now = new Date();
    return Array.from(this.storage.workflowSchedules.entries())
      .filter(([key]) => key.includes('workflow-schedule:'))
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

  async getTemplateOAuthCredentials(params: { templateId: string }): Promise<{ client_id: string; client_secret: string } | null> {
    return null;
  }

  private oauthSecrets: Map<string, { clientId: string; clientSecret: string; expiresAt: number }> = new Map();

  async cacheOAuthSecret(params: { uid: string; clientId: string; clientSecret: string; ttlMs: number }): Promise<void> {
    this.oauthSecrets.set(params.uid, {
      clientId: params.clientId,
      clientSecret: params.clientSecret,
      expiresAt: Date.now() + params.ttlMs
    });
  }

  async getOAuthSecret(params: { uid: string }): Promise<{ clientId: string; clientSecret: string } | null> {
    const entry = this.oauthSecrets.get(params.uid);

    if (!entry || entry.expiresAt <= Date.now()) {
      this.oauthSecrets.delete(params.uid);
      return null;
    }

    // Delete after retrieval (one-time use)
    this.oauthSecrets.delete(params.uid);

    return {
      clientId: entry.clientId,
      clientSecret: entry.clientSecret
    };
  }

  async deleteOAuthSecret(params: { uid: string }): Promise<void> {
    this.oauthSecrets.delete(params.uid);
  }
} 