import { ApiConfig, ExtractConfig, Integration, RunResult, TransformConfig, Workflow } from "@superglue/client";
import { createHash } from 'node:crypto';
import type { DataStore, WorkflowScheduleInternal } from "./types.js";

export class MemoryStore implements DataStore {
  private storage: {
    apis: Map<string, ApiConfig>;
    extracts: Map<string, ExtractConfig>;
    transforms: Map<string, TransformConfig>;
    runs: Map<string, RunResult>;
    runsIndex: Map<string, { id: string; timestamp: number; configId: string }[]>;
    workflows: Map<string, Workflow>;
    workflowSchedules: Map<string, WorkflowScheduleInternal>;
    integrations: Map<string, Integration>;
  };

  private tenant: { email: string | null; emailEntrySkipped: boolean } = {
    email: null,
    emailEntrySkipped: false
  };

  constructor() {
    this.storage = {
      apis: new Map(),
      extracts: new Map(),
      transforms: new Map(),
      runs: new Map(),
      runsIndex: new Map(),
      workflows: new Map(),
      workflowSchedules: new Map(),
      integrations: new Map()
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

  // Extract Config Methods
  async getExtractConfig(params: { id: string; orgId?: string }): Promise<ExtractConfig | null> {
    const { id, orgId } = params;
    if (!id) return null;
    const key = this.getKey('extract', id, orgId);
    const config = this.storage.extracts.get(key);
    return config ? { ...config, id } : null;
  }

  async listExtractConfigs(params?: { limit?: number; offset?: number; orgId?: string }): Promise<{ items: ExtractConfig[], total: number }> {
    const { limit = 10, offset = 0, orgId } = params || {};
    const items = this.getOrgItems(this.storage.extracts, 'extract', orgId).slice(offset, offset + limit);
    const total = this.getOrgItems(this.storage.extracts, 'extract', orgId).length;
    return { items, total };
  }

  async upsertExtractConfig(params: { id: string; config: ExtractConfig; orgId?: string }): Promise<ExtractConfig> {
    const { id, config, orgId } = params;
    if (!id || !config) return null;
    const key = this.getKey('extract', id, orgId);
    this.storage.extracts.set(key, config);
    return { ...config, id };
  }

  async deleteExtractConfig(params: { id: string; orgId?: string }): Promise<boolean> {
    const { id, orgId } = params;
    if (!id) return false;
    const key = this.getKey('extract', id, orgId);
    return this.storage.extracts.delete(key);
  }

  // Transform Config Methods
  async getTransformConfig(params: { id: string; orgId?: string }): Promise<TransformConfig | null> {
    const { id, orgId } = params;
    if (!id) return null;
    const key = this.getKey('transform', id, orgId);
    const config = this.storage.transforms.get(key);
    return config ? { ...config, id } : null;
  }

  async listTransformConfigs(params?: { limit?: number; offset?: number; orgId?: string }): Promise<{ items: TransformConfig[], total: number }> {
    const { limit = 10, offset = 0, orgId } = params || {};
    const items = this.getOrgItems(this.storage.transforms, 'transform', orgId).slice(offset, offset + limit);
    const total = this.getOrgItems(this.storage.transforms, 'transform', orgId).length;
    return { items, total };
  }

  async upsertTransformConfig(params: { id: string; config: TransformConfig; orgId?: string }): Promise<TransformConfig> {
    const { id, config, orgId } = params;
    if (!id || !config) return null;
    const key = this.getKey('transform', id, orgId);
    this.storage.transforms.set(key, config);
    return { ...config, id };
  }

  async deleteTransformConfig(params: { id: string; orgId?: string }): Promise<boolean> {
    const { id, orgId } = params;
    if (!id) return false;
    const key = this.getKey('transform', id, orgId);
    return this.storage.transforms.delete(key);
  }

  // Run Result Methods
  async getRun(params: { id: string; orgId?: string }): Promise<RunResult | null> {
    const { id, orgId } = params;
    if (!id) return null;
    const key = this.getKey('run', id, orgId);
    const run = this.storage.runs.get(key);
    return run ? { ...run, id } : null;
  }

  async createRun(params: { result: RunResult; orgId?: string }): Promise<RunResult> {
    const { result: run, orgId } = params;
    if (!run) return null;
    const key = this.getKey('run', run.id, orgId);
    this.storage.runs.set(key, run);
    
    // Update index for efficient listing
    const configId = run.config?.id;
    if (configId) {
      const indexKey = this.getKey('index', configId, orgId);
      const existing = this.storage.runsIndex.get(indexKey) || [];
      existing.push({
        id: run.id,
        timestamp: run.startedAt ? run.startedAt.getTime() : Date.now(),
        configId
      });
      this.storage.runsIndex.set(indexKey, existing);
    }
    
    return { ...run, id: run.id };
  }

  async listRuns(params?: { limit?: number; offset?: number; configId?: string; orgId?: string }): Promise<{ items: RunResult[], total: number }> {
    const { limit = 10, offset = 0, configId, orgId } = params || {};
    const allRuns = this.getOrgItems(this.storage.runs, 'run', orgId);
    
    // Store total count of ALL runs (including corrupted ones)
    const totalAllRuns = allRuns.length;
    
    // Filter out runs with corrupted data (missing critical fields)
    const validRuns = allRuns.filter((run): run is RunResult => 
      run !== null && 
      run.config && 
      run.config.id && 
      run.startedAt instanceof Date
    );
    
    // Sort by startedAt date (most recent first)
    validRuns.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    
    // Filter by configId if provided
    const filteredRuns = configId ? validRuns.filter(run => run.config?.id === configId) : validRuns;
    
    // Apply pagination
    const items = filteredRuns.slice(offset, offset + limit);
    
    // Return total as count of ALL runs (including corrupted ones)
    return { items, total: totalAllRuns };
  }

  async deleteRun(params: { id: string; orgId?: string }): Promise<boolean> {
    const { id, orgId } = params;
    if (!id) return false;
    const key = this.getKey('run', id, orgId);
    const run = this.storage.runs.get(key);
    
    if (run) {
      // Remove from index
      const configId = run.config?.id;
      if (configId) {
        const indexKey = this.getKey('index', configId, orgId);
        const existing = this.storage.runsIndex.get(indexKey) || [];
        const filtered = existing.filter(item => item.id !== id);
        if (filtered.length > 0) {
          this.storage.runsIndex.set(indexKey, filtered);
        } else {
          this.storage.runsIndex.delete(indexKey);
        }
      }
    }
    
    return this.storage.runs.delete(key);
  }

  async deleteAllRuns(params?: { orgId?: string }): Promise<boolean> {
    const { orgId } = params || {};
    const prefix = orgId ? `${orgId}:run:` : 'run:';
    const keysToDelete: string[] = [];
    
    for (const key of this.storage.runs.keys()) {
      if (key.startsWith(prefix)) {
        keysToDelete.push(key);
      }
    }
    
    // Also clear index entries
    const indexPrefix = orgId ? `${orgId}:index:` : 'index:';
    for (const key of this.storage.runsIndex.keys()) {
      if (key.startsWith(indexPrefix)) {
        this.storage.runsIndex.delete(key);
      }
    }
    
    keysToDelete.forEach(key => this.storage.runs.delete(key));
    
    return true;
  }

  async clearAll(): Promise<void> {
    this.storage.apis.clear();
    this.storage.extracts.clear();
    this.storage.transforms.clear();
    this.storage.runs.clear();
    this.storage.runsIndex.clear();
    this.storage.workflows.clear();
    this.storage.workflowSchedules.clear();
    this.storage.integrations.clear();
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
  async getWorkflow(params: { id: string; orgId?: string }): Promise<Workflow | null> {
    const { id, orgId } = params;
    if (!id) return null;
    const key = this.getKey('workflow', id, orgId);
    const workflow = this.storage.workflows.get(key);
    return workflow ? { ...workflow, id } : null;
  }

  async listWorkflows(params?: { limit?: number; offset?: number; orgId?: string }): Promise<{ items: Workflow[], total: number }> {
    const { limit = 10, offset = 0, orgId } = params || {};
    const items = this.getOrgItems(this.storage.workflows, 'workflow', orgId).slice(offset, offset + limit);
    const total = this.getOrgItems(this.storage.workflows, 'workflow', orgId).length;
    return { items, total };
  }

  async getManyWorkflows(params: { ids: string[]; orgId?: string }): Promise<Workflow[]> {
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
    const { id, workflow, orgId } = params;
    if (!id || !workflow) return null;
    const key = this.getKey('workflow', id, orgId);
    this.storage.workflows.set(key, workflow);
  }

  async deleteWorkflow(params: { id: string; orgId?: string }): Promise<boolean> {
    const { id, orgId } = params;
    if (!id) return false;
    const key = this.getKey('workflow', id, orgId);
    return this.storage.workflows.delete(key);
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

  async getManyIntegrations(params: { ids: string[]; orgId?: string }): Promise<Integration[]> {
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
  async listWorkflowSchedules(params: { workflowId: string, orgId: string }): Promise<WorkflowScheduleInternal[]> {
    const { workflowId, orgId } = params;
    return this.getOrgItems(this.storage.workflowSchedules, 'workflow-schedule', orgId)
      .filter(schedule => schedule.workflowId === workflowId);
  }

  async getWorkflowSchedule(params: { id: string; orgId?: string }): Promise<WorkflowScheduleInternal | null> {
    const { id, orgId } = params;
    if (!id) return null;
    const key = this.getKey('workflow-schedule', id, orgId);
    const schedule = this.storage.workflowSchedules.get(key);
    return schedule ? { ...schedule, id } : null;
  }

  async upsertWorkflowSchedule(params: { schedule: WorkflowScheduleInternal }): Promise<void> {
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

  async listDueWorkflowSchedules(): Promise<WorkflowScheduleInternal[]> {
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
} 
