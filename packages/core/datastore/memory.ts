import { ApiConfig, DiscoveryRun, FileReference, FileStatus, Integration, Run, RunStatus, Tool } from "@superglue/shared";
import { createHash } from 'node:crypto';
import type { DataStore, ToolScheduleInternal } from "./types.js";

export class MemoryStore implements DataStore {
  private storage: {
    apis: Map<string, ApiConfig>;
    runs: Map<string, Run>;
    runsIndex: Map<string, { id: string; timestamp: number; configId: string }[]>;
    workflows: Map<string, Tool>;
    workflowSchedules: Map<string, ToolScheduleInternal>;
    integrations: Map<string, Integration>;
    discoveryRuns: Map<string, DiscoveryRun>;
    fileReferences: Map<string, FileReference>;
  };

  private tenant: { email: string | null; emailEntrySkipped: boolean } = {
    email: null,
    emailEntrySkipped: false
  };

  constructor() {
    this.storage = {
      apis: new Map(),
      runs: new Map(),
      runsIndex: new Map(),
      workflows: new Map(),
      workflowSchedules: new Map(),
      integrations: new Map(),
      discoveryRuns: new Map(),
      fileReferences: new Map()
    };
  }

  private getKey(prefix: string, id: string, orgId?: string): string {
    return `${orgId ? `${orgId}:` : ''}${prefix}:${id}`;
  }

  private getOrgItems<T>(map: Map<string, T>, prefix: string, orgId?: string): T[] {
    return Array.from(map.entries())
      .filter(([key]) => key.startsWith(`${orgId ? `${orgId}:` : ''}${prefix}:`))
      .map(([key, value]) => ({ ...value, id: key.split(':').pop() })) as T[];
  }

  private generateHash(data: any): string {
    return createHash('md5').update(JSON.stringify(data)).digest('hex');
  }

  // API Config Methods
  async getApiConfig(params: { id: string; orgId?: string }): Promise<ApiConfig | null> {
    const { id, orgId } = params;
    if (!id) return null;
    const key = this.getKey('api', id, orgId);
    const config = this.storage.apis.get(key);
    return config ? { ...config, id } : null;
  }

  async listApiConfigs(params?: { limit?: number; offset?: number; orgId?: string }): Promise<{ items: ApiConfig[], total: number }> {
    const { limit = 10, offset = 0, orgId } = params || {};
    const items = this.getOrgItems(this.storage.apis, 'api', orgId).slice(offset, offset + limit);
    const total = this.getOrgItems(this.storage.apis, 'api', orgId).length;
    return { items, total };
  }

  async upsertApiConfig(params: { id: string; config: ApiConfig; orgId?: string }): Promise<ApiConfig> {
    const { id, config, orgId } = params;
    if (!id || !config) return null;
    const key = this.getKey('api', id, orgId);
    this.storage.apis.set(key, config);
    return { ...config, id };
  }

  async deleteApiConfig(params: { id: string; orgId?: string }): Promise<boolean> {
    const { id, orgId } = params;
    if (!id) return false;
    const key = this.getKey('api', id, orgId);
    return this.storage.apis.delete(key);
  }

  // Run Methods
  async getRun(params: { id: string; orgId?: string }): Promise<Run | null> {
    const { id, orgId } = params;
    if (!id) return null;
    const key = this.getKey('run', id, orgId);
    const run = this.storage.runs.get(key);
    return run ? { ...run, id } : null;
  }

  async createRun(params: { run: Run }): Promise<Run> {
    const { run } = params;
    if (!run) throw new Error('Run is required');
    const key = this.getKey('run', run.id, run.orgId);
    
    if (this.storage.runs.has(key)) {
      throw new Error(`Run with id ${run.id} already exists`);
    }

    this.storage.runs.set(key, run);

    const toolId = run.toolId || run.toolConfig?.id;
    if (toolId) {
      const indexKey = this.getKey('index', toolId, run.orgId);
      const existing = this.storage.runsIndex.get(indexKey) || [];
      existing.push({
        id: run.id,
        timestamp: run.startedAt ? run.startedAt.getTime() : Date.now(),
        configId: toolId
      });
      this.storage.runsIndex.set(indexKey, existing);
    }

    return run;
  }

  async updateRun(params: { id: string; orgId: string; updates: Partial<Run> }): Promise<Run> {
    const { id, orgId, updates } = params;
    const key = this.getKey('run', id, orgId);
    const existingRun = this.storage.runs.get(key);
    
    if (!existingRun) {
      throw new Error(`Run with id ${id} not found`);
    }

    const updatedRun: Run = {
      ...existingRun,
      ...updates,
      id,
      orgId
    };

    this.storage.runs.set(key, updatedRun);
    return updatedRun;
  }

  async listRuns(params?: { limit?: number; offset?: number; configId?: string; status?: RunStatus; orgId?: string }): Promise<{ items: Run[], total: number }> {
    const { limit = 10, offset = 0, configId, status, orgId } = params || {};
    const allRuns = this.getOrgItems(this.storage.runs, 'run', orgId);

    const validRuns = allRuns.filter((run): run is Run =>
      run !== null && !!run.id
    );

    validRuns.sort((a, b) => {
      const aTime = a.startedAt instanceof Date ? a.startedAt.getTime() : 0;
      const bTime = b.startedAt instanceof Date ? b.startedAt.getTime() : 0;
      return bTime - aTime;
    });

    let filteredRuns = validRuns;
    
    if (configId) {
      filteredRuns = filteredRuns.filter(run => {
        const toolId = run.toolId || run.toolConfig?.id;
        return toolId === configId;
      });
    }
    
    if (status !== undefined) {
      filteredRuns = filteredRuns.filter(run => run.status === status);
    }

    const items = filteredRuns.slice(offset, offset + limit);
    return { items, total: filteredRuns.length };
  }

  async clearAll(): Promise<void> {
    this.storage.apis.clear();
    this.storage.runs.clear();
    this.storage.runsIndex.clear();
    this.storage.workflows.clear();
    this.storage.workflowSchedules.clear();
    this.storage.integrations.clear();
    this.storage.discoveryRuns.clear();
    this.storage.fileReferences.clear();
  }

  async disconnect(): Promise<void> {
    // No-op for memory store
  }

  async ping(): Promise<boolean> {
    return true;
  }

  async getTenantInfo(): Promise<{ email: string | null; emailEntrySkipped: boolean }> {
    return { ...this.tenant };
  }

  async setTenantInfo(params?: { email?: string; emailEntrySkipped?: boolean }): Promise<void> {
    const { email, emailEntrySkipped } = params || {};
    if (email !== undefined) {
      this.tenant.email = email;
    }
    if (emailEntrySkipped !== undefined) {
      this.tenant.emailEntrySkipped = emailEntrySkipped;
    }
  }

  // Workflow Methods
  async getWorkflow(params: { id: string; orgId?: string }): Promise<Tool | null> {
    const { id, orgId } = params;
    if (!id) return null;
    const key = this.getKey('workflow', id, orgId);
    const workflow = this.storage.workflows.get(key);
    return workflow ? { ...workflow, id } : null;
  }

  async listWorkflows(params?: { limit?: number; offset?: number; orgId?: string }): Promise<{ items: Tool[], total: number }> {
    const { limit = 10, offset = 0, orgId } = params || {};
    const items = this.getOrgItems(this.storage.workflows, 'workflow', orgId).slice(offset, offset + limit);
    const total = this.getOrgItems(this.storage.workflows, 'workflow', orgId).length;
    return { items, total };
  }

  async upsertWorkflow(params: { id: string; workflow: Tool; orgId?: string }): Promise<Tool> {
    const { id, workflow, orgId } = params;
    if (!id || !workflow) return null;
    const key = this.getKey('workflow', id, orgId);
    this.storage.workflows.set(key, workflow);
    return { ...workflow, id };
  }

  async deleteWorkflow(params: { id: string; orgId?: string }): Promise<boolean> {
    const { id, orgId } = params;
    if (!id) return false;
    const key = this.getKey('workflow', id, orgId);
    return this.storage.workflows.delete(key);
  }

  async renameWorkflow(params: { oldId: string; newId: string; orgId?: string }): Promise<Tool> {
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

    return newWorkflow;
  }

  // Integration Methods
  async getIntegration(params: { id: string; includeDocs?: boolean; orgId?: string }): Promise<Integration | null> {
    const { id, includeDocs = true, orgId } = params;
    if (!id) return null;
    const key = this.getKey('integration', id, orgId);
    const integration = this.storage.integrations.get(key);
    return integration ? { ...integration, id } : null;
  }

  async listIntegrations(params?: { limit?: number; offset?: number; includeDocs?: boolean; orgId?: string }): Promise<{ items: Integration[], total: number }> {
    const { limit = 10, offset = 0, includeDocs = true, orgId } = params || {};
    const items = this.getOrgItems(this.storage.integrations, 'integration', orgId).slice(offset, offset + limit);
    const total = this.getOrgItems(this.storage.integrations, 'integration', orgId).length;
    return { items, total };
  }

  async getManyIntegrations(params: { ids: string[]; includeDocs?: boolean; orgId?: string }): Promise<Integration[]> {
    const { ids, orgId } = params;
    return ids
      .map(id => {
        const key = this.getKey('integration', id, orgId);
        const integration = this.storage.integrations.get(key);
        return integration ? { ...integration, id } : null;
      })
      .filter((i): i is Integration => i !== null);
  }

  async upsertIntegration(params: { id: string; integration: Integration; orgId?: string }): Promise<Integration> {
    const { id, integration, orgId } = params;
    if (!id || !integration) return null;
    const key = this.getKey('integration', id, orgId);
    this.storage.integrations.set(key, integration);
    return { ...integration, id };
  }

  async deleteIntegration(params: { id: string; orgId?: string }): Promise<boolean> {
    const { id, orgId } = params;
    if (!id) return false;
    const key = this.getKey('integration', id, orgId);
    return this.storage.integrations.delete(key);
  }

  async copyTemplateDocumentationToUserIntegration(params: { templateId: string; userIntegrationId: string; orgId?: string }): Promise<boolean> {
    // Not supported for memory store
    return false;
  }

  // Workflow Schedule Methods
  async listWorkflowSchedules(params: { workflowId?: string, orgId: string }): Promise<ToolScheduleInternal[]> {
    const { workflowId, orgId } = params;
    const schedules = this.getOrgItems(this.storage.workflowSchedules, 'workflow-schedule', orgId);
    if (workflowId) {
      return schedules.filter(schedule => schedule.workflowId === workflowId);
    }
    return schedules;
  }

  async getWorkflowSchedule(params: { id: string; orgId?: string }): Promise<ToolScheduleInternal | null> {
    const { id, orgId } = params;
    if (!id) return null;
    const key = this.getKey('workflow-schedule', id, orgId);
    const schedule = this.storage.workflowSchedules.get(key);
    return schedule ? { ...schedule, id } : null;
  }

  async upsertWorkflowSchedule(params: { schedule: ToolScheduleInternal }): Promise<void> {
    const { schedule } = params;
    if (!schedule || !schedule.id) return;
    const key = this.getKey('workflow-schedule', schedule.id, schedule.orgId);
    this.storage.workflowSchedules.set(key, schedule);
  }

  async deleteWorkflowSchedule(params: { id: string, orgId: string }): Promise<boolean> {
    const { id, orgId } = params;
    if (!id) return false;
    const key = this.getKey('workflow-schedule', id, orgId);
    return this.storage.workflowSchedules.delete(key);
  }

  async listDueWorkflowSchedules(): Promise<ToolScheduleInternal[]> {
    const now = new Date();
    return Array.from(this.storage.workflowSchedules.entries())
      .filter(([key]) => key.includes(':workflow-schedule:'))
      .map(([key, value]) => ({ ...value, id: key.split(':').pop() }))
      .filter(schedule => schedule.enabled && schedule.nextRunAt <= now);
  }

  async updateScheduleNextRun(params: { id: string; nextRunAt: Date; lastRunAt: Date; }): Promise<boolean> {
    const { id, nextRunAt, lastRunAt } = params;
    if (!id) return false;

    for (const [key, schedule] of this.storage.workflowSchedules.entries()) {
      if (schedule.id === id) {
        const updatedSchedule = {
          ...schedule,
          nextRunAt,
          lastRunAt,
          updatedAt: new Date()
        };
        this.storage.workflowSchedules.set(key, updatedSchedule);
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

  async createDiscoveryRun(params: { run: DiscoveryRun; orgId?: string }): Promise<DiscoveryRun> {
    const { run, orgId } = params;
    const key = this.getKey('discovery-run', run.id, orgId);
    this.storage.discoveryRuns.set(key, run);
    return run;
  }

  async getDiscoveryRun(params: { id: string; orgId?: string }): Promise<DiscoveryRun | null> {
    const { id, orgId } = params;
    const key = this.getKey('discovery-run', id, orgId);
    return this.storage.discoveryRuns.get(key) || null;
  }

  async updateDiscoveryRun(params: { id: string; updates: Partial<DiscoveryRun>; orgId?: string }): Promise<DiscoveryRun> {
    const { id, updates, orgId } = params;
    const key = this.getKey('discovery-run', id, orgId);
    const existing = this.storage.discoveryRuns.get(key);
    if (!existing) {
      throw new Error(`Discovery run not found: ${id}`);
    }
    const updated = { ...existing, ...updates };
    this.storage.discoveryRuns.set(key, updated);
    return updated;
  }

  async listDiscoveryRuns(params?: { limit?: number; offset?: number; orgId?: string }): Promise<{ items: DiscoveryRun[], total: number }> {
    const { limit = 10, offset = 0, orgId } = params || {};
    const items = this.getOrgItems(this.storage.discoveryRuns, 'discovery-run', orgId);
    const total = items.length;
    const paginatedItems = items
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(offset, offset + limit);
    return { items: paginatedItems, total };
  }

  async deleteDiscoveryRun(params: { id: string; orgId?: string }): Promise<boolean> {
    const { id, orgId } = params;
    const key = this.getKey('discovery-run', id, orgId);
    return this.storage.discoveryRuns.delete(key);
  }

  async createFileReference(params: { file: FileReference; orgId?: string }): Promise<FileReference> {
    const { file, orgId } = params;
    const fileWithTimestamp: FileReference = {
      ...file,
      createdAt: file.createdAt || new Date()
    };
    const key = this.getKey('file-reference', file.id, orgId);
    this.storage.fileReferences.set(key, fileWithTimestamp);
    return fileWithTimestamp;
  }

  async getFileReference(params: { id: string; orgId?: string }): Promise<FileReference | null> {
    const { id, orgId } = params;
    const key = this.getKey('file-reference', id, orgId);
    return this.storage.fileReferences.get(key) || null;
  }

  async updateFileReference(params: { id: string; updates: Partial<FileReference>; orgId?: string }): Promise<FileReference> {
    const { id, updates, orgId } = params;
    const key = this.getKey('file-reference', id, orgId);
    const existing = this.storage.fileReferences.get(key);
    if (!existing) {
      throw new Error(`File reference not found: ${id}`);
    }
    const updated = { ...existing, ...updates };
    this.storage.fileReferences.set(key, updated);
    return updated;
  }

  async listFileReferences(params?: { fileIds?: string[]; status?: FileStatus; limit?: number; offset?: number; orgId?: string }): Promise<{ items: FileReference[], total: number }> {
    const { fileIds, status, limit = 10, offset = 0, orgId } = params || {};
    let items = this.getOrgItems(this.storage.fileReferences, 'file-reference', orgId);
    
    if (fileIds && fileIds.length > 0) {
      items = items.filter(file => fileIds.includes(file.id));
    }
    
    if (status) {
      items = items.filter(file => file.status === status);
    }
    
    const total = items.length;
    const paginatedItems = items.slice(offset, offset + limit);
    return { items: paginatedItems, total };
  }


  async deleteFileReference(params: { id: string; orgId?: string }): Promise<boolean> {
    const { id, orgId } = params;
    const key = this.getKey('file-reference', id, orgId);
    return this.storage.fileReferences.delete(key);
  }
} 
