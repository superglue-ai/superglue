import {
  BatchFileUploadRequest,
  BatchFileUploadResponse,
  DiscoveryRun,
  DiscoverySource,
  FileReference,
  NotificationRule,
  SlackAuthType,
  StoredRunResults,
  SuperglueClient,
  Tool,
  ToolSchedule,
} from "@superglue/shared";
import type { Role, OrgMember, OrgInvitation } from "@superglue/shared";
import { tokenRegistry } from "./token-registry";
import { connectionMonitor } from "./connection-monitor";

export class EESuperglueClient extends SuperglueClient {
  async batchCreateFileReferences(
    files: BatchFileUploadRequest["files"],
  ): Promise<BatchFileUploadResponse> {
    return this.restRequest<BatchFileUploadResponse>("POST", "/v1/file-references/batch", {
      files,
    });
  }

  async createDiscoveryRun(params: {
    fileIds: string[];
    data?: any;
  }): Promise<{ success: boolean; data: DiscoveryRun }> {
    // Convert fileIds to sources
    const sources: DiscoverySource[] = params.fileIds.map((id) => ({ id, type: "file" as const }));
    return this.restRequest<{ success: boolean; data: DiscoveryRun }>(
      "POST",
      "/v1/discovery-runs",
      {
        sources,
        data: params.data,
      },
    );
  }

  async getDiscoveryRun(id: string): Promise<{ success: boolean; data: DiscoveryRun }> {
    return this.restRequest<{ success: boolean; data: DiscoveryRun }>(
      "GET",
      `/v1/discovery-runs/${id}`,
    );
  }

  async listDiscoveryRuns(
    limit: number = 10,
    offset: number = 0,
  ): Promise<{ success: boolean; items: DiscoveryRun[]; total: number }> {
    return this.restRequest<{ success: boolean; items: DiscoveryRun[]; total: number }>(
      "GET",
      `/v1/discovery-runs?limit=${limit}&offset=${offset}`,
    );
  }

  async updateDiscoveryRun(
    id: string,
    updates: Partial<DiscoveryRun>,
  ): Promise<{ success: boolean; data: DiscoveryRun }> {
    return this.restRequest<{ success: boolean; data: DiscoveryRun }>(
      "PATCH",
      `/v1/discovery-runs/${id}`,
      { updates },
    );
  }

  async deleteDiscoveryRun(id: string): Promise<{ success: boolean }> {
    return this.restRequest<{ success: boolean }>("DELETE", `/v1/discovery-runs/${id}`);
  }

  async listFileReferences(
    fileIds: string[],
  ): Promise<{ success: boolean; items: FileReference[]; total: number }> {
    const fileIdsParam = fileIds.join(",");
    return this.restRequest<{ success: boolean; items: FileReference[]; total: number }>(
      "GET",
      `/v1/file-references?fileIds=${encodeURIComponent(fileIdsParam)}`,
    );
  }

  async deleteFileReference(id: string): Promise<{ success: boolean }> {
    return this.restRequest<{ success: boolean }>("DELETE", `/v1/file-references/${id}`);
  }

  async startDiscoveryRun(
    id: string,
  ): Promise<{ success: boolean; data: { fileContents: Record<string, string> } }> {
    return this.restRequest<{ success: boolean; data: { fileContents: Record<string, string> } }>(
      "POST",
      `/v1/discovery-runs/${id}/start`,
    );
  }

  async listToolHistory(toolId: string): Promise<
    Array<{
      version: number;
      createdAt: string;
      createdByUserId?: string;
      createdByEmail?: string;
      tool: Tool;
    }>
  > {
    const response = await this.restRequest<{
      data: Array<{
        version: number;
        createdAt: string;
        createdByUserId?: string;
        createdByEmail?: string;
        tool: Tool;
      }>;
    }>("GET", `/v1/tools/${encodeURIComponent(toolId)}/history`);
    return response.data;
  }

  async restoreToolVersion(toolId: string, version: number): Promise<Tool> {
    return this.restRequest<Tool>(
      "POST",
      `/v1/tools/${encodeURIComponent(toolId)}/history/${version}/restore`,
    );
  }
  // REST API - Tool Schedules (nested under /tools/:toolId/schedules)
  // JSON returns dates as strings, so we parse them to Date objects
  private parseScheduleDates(s: any): ToolSchedule {
    return {
      ...s,
      lastRunAt: s.lastRunAt ? new Date(s.lastRunAt) : undefined,
      nextRunAt: new Date(s.nextRunAt),
      createdAt: new Date(s.createdAt),
      updatedAt: new Date(s.updatedAt),
    };
  }

  async listToolSchedules(toolId?: string): Promise<ToolSchedule[]> {
    const path = toolId ? `/v1/tools/${encodeURIComponent(toolId)}/schedules` : "/v1/schedules";
    const response = await this.restRequest<{ data: any[] }>("GET", path);
    return response.data.map((s) => this.parseScheduleDates(s));
  }

  async getToolSchedule(toolId: string, scheduleId: string): Promise<ToolSchedule> {
    const response = await this.restRequest<any>(
      "GET",
      `/v1/tools/${encodeURIComponent(toolId)}/schedules/${encodeURIComponent(scheduleId)}`,
    );
    return this.parseScheduleDates(response);
  }

  async createToolSchedule(
    toolId: string,
    schedule: {
      cronExpression: string;
      timezone: string;
      enabled?: boolean;
      payload?: Record<string, any>;
      options?: Record<string, any>;
    },
  ): Promise<ToolSchedule> {
    const response = await this.restRequest<any>(
      "POST",
      `/v1/tools/${encodeURIComponent(toolId)}/schedules`,
      schedule,
    );
    return this.parseScheduleDates(response);
  }

  async updateToolSchedule(
    toolId: string,
    scheduleId: string,
    updates: {
      cronExpression?: string;
      timezone?: string;
      enabled?: boolean;
      payload?: Record<string, any>;
      options?: Record<string, any>;
    },
  ): Promise<ToolSchedule> {
    const response = await this.restRequest<any>(
      "PUT",
      `/v1/tools/${encodeURIComponent(toolId)}/schedules/${encodeURIComponent(scheduleId)}`,
      updates,
    );
    return this.parseScheduleDates(response);
  }

  async deleteToolSchedule(toolId: string, scheduleId: string): Promise<void> {
    await this.restRequest<void>(
      "DELETE",
      `/v1/tools/${encodeURIComponent(toolId)}/schedules/${encodeURIComponent(scheduleId)}`,
    );
  }

  // Notification Settings
  async getNotificationSettings(): Promise<NotificationSettingsResponse> {
    return this.restRequest<NotificationSettingsResponse>("GET", "/v1/settings/notifications");
  }

  async updateNotificationSettings(settings: {
    channels?: {
      slack?: {
        enabled?: boolean;
        authType?: SlackAuthType;
        webhookUrl?: string;
        botToken?: string;
        channelId?: string;
        rules?: NotificationRule[];
      };
    };
  }): Promise<NotificationSettingsResponse> {
    return this.restRequest<NotificationSettingsResponse>(
      "PUT",
      "/v1/settings/notifications",
      settings,
    );
  }

  async testNotification(
    channel: "slack",
    baseUrl?: string,
  ): Promise<{ success: boolean; error?: string }> {
    return this.restRequest<{ success: boolean; error?: string }>(
      "POST",
      "/v1/settings/notifications/test",
      { channel, baseUrl },
    );
  }

  async deleteNotificationChannel(channelId: "slack"): Promise<{ success: boolean }> {
    return this.restRequest<{ success: boolean }>(
      "DELETE",
      `/v1/settings/notifications/channels/${channelId}`,
    );
  }

  // Org Preferences
  async getPreferences(): Promise<{ storeRunResults: boolean }> {
    return this.restRequest<{ storeRunResults: boolean }>("GET", "/v1/settings/preferences");
  }

  async updatePreferences(preferences: {
    storeRunResults?: boolean;
  }): Promise<{ storeRunResults: boolean }> {
    return this.restRequest<{ storeRunResults: boolean }>(
      "PUT",
      "/v1/settings/preferences",
      preferences,
    );
  }

  async deleteAllRunResults(): Promise<{ success: boolean; deletedCount: number }> {
    return this.restRequest<{ success: boolean; deletedCount: number }>(
      "DELETE",
      "/v1/settings/run-results",
    );
  }

  // Run Results (EE feature)

  /**
   * Fetch stored run results from S3
   * Returns null if no results are stored for this run, or if S3 is not configured
   */
  async getRunResults(
    runId: string,
    options?: { truncate?: boolean },
  ): Promise<StoredRunResults | null> {
    try {
      const queryParams = options?.truncate ? "?truncate=true" : "";
      const response = await this.restRequest<{
        success: boolean;
        data: (Omit<StoredRunResults, "storedAt"> & { storedAt: string }) | null;
        message?: string;
      }>("GET", `/v1/runs/${encodeURIComponent(runId)}/results${queryParams}`);

      if (!response.data) {
        return null;
      }

      // Parse storedAt string to Date
      return {
        ...response.data,
        storedAt: new Date(response.data.storedAt),
      };
    } catch (err: any) {
      // Return null for 503 (S3 not configured) or other errors
      // Callers should fall back to DB data
      console.warn(`Failed to fetch run results for ${runId}:`, err.message);
      return null;
    }
  }

  // Role Management
  async getMe(): Promise<{ userId: string; orgId: string; roleIds: string[]; roles: Role[] }> {
    return this.restRequest<{ userId: string; orgId: string; roleIds: string[]; roles: Role[] }>(
      "GET",
      "/v1/me",
    );
  }

  async listRoles(): Promise<Role[]> {
    const response = await this.restRequest<{ data: Role[] }>("GET", "/v1/roles");
    return response.data || [];
  }

  async getRole(id: string): Promise<Role> {
    const response = await this.restRequest<{ data: Role }>("GET", `/v1/roles/${id}`);
    return response.data;
  }

  async createRole(role: {
    name: string;
    description?: string;
    tools?: "ALL" | string[];
    systems?: "ALL" | Record<string, any>;
  }): Promise<Role> {
    const response = await this.restRequest<{ data: Role }>("POST", "/v1/roles", role);
    return response.data;
  }

  async updateRole(
    id: string,
    role: {
      name?: string;
      description?: string;
      tools?: "ALL" | string[];
      systems?: "ALL" | Record<string, any>;
    },
  ): Promise<Role> {
    const response = await this.restRequest<{ data: Role }>("PUT", `/v1/roles/${id}`, role);
    return response.data;
  }

  async deleteRole(id: string): Promise<void> {
    await this.restRequest("DELETE", `/v1/roles/${id}`);
  }

  async getUserRoles(userId: string): Promise<Role[]> {
    const response = await this.restRequest<{ data: Role[] }>("GET", `/v1/users/${userId}/roles`);
    return response.data || [];
  }

  async addUserRoles(userId: string, roleIds: string[]): Promise<Role[]> {
    const response = await this.restRequest<{ data: Role[] }>("POST", `/v1/users/${userId}/roles`, {
      roleIds,
    });
    return response.data || [];
  }

  async removeUserRole(userId: string, roleId: string): Promise<Role[]> {
    const response = await this.restRequest<{ data: Role[] }>(
      "DELETE",
      `/v1/users/${userId}/roles/${roleId}`,
    );
    return response.data || [];
  }

  async deleteAllUserRoles(userId: string): Promise<void> {
    await this.restRequest("DELETE", `/v1/users/${userId}/roles`);
  }

  async listRoleAssignments(): Promise<Record<string, string[]>> {
    const response = await this.restRequest<{ data: Record<string, string[]> }>(
      "GET",
      `/v1/roles/assignments`,
    );
    return response.data || {};
  }

  async listOrgMembers(): Promise<{ members: OrgMember[]; invitations: OrgInvitation[] }> {
    const response = await this.restRequest<{ data: OrgMember[]; invitations: OrgInvitation[] }>(
      "GET",
      `/v1/org/members`,
    );
    return { members: response.data || [], invitations: response.invitations || [] };
  }

  // End User Management
  async sendPortalLink(endUserId: string): Promise<{
    success: boolean;
    message: string;
    recipient: string;
  }> {
    return this.restRequest<{
      success: boolean;
      message: string;
      recipient: string;
    }>("POST", `/v1/end-users/${endUserId}/invite`);
  }

  // API Key Management
  async listApiKeys(): Promise<ApiKey[]> {
    const response = await this.restRequest<{ data: ApiKey[] }>("GET", "/v1/api-keys");
    return response.data || [];
  }

  async createApiKey(
    options: {
      mode?: "frontend" | "backend";
      userId?: string | null;
    } = {},
  ): Promise<ApiKey> {
    const response = await this.restRequest<{ data: ApiKey }>("POST", "/v1/api-keys", options);
    if (!response.data) throw new Error("Failed to create API key");
    return response.data;
  }

  async deleteApiKey(id: string): Promise<boolean> {
    await this.restRequest<{ success: boolean }>("DELETE", `/v1/api-keys/${id}`);
    return true;
  }

  async updateApiKey(
    id: string,
    updates: {
      userId?: string | null;
    },
  ): Promise<ApiKey> {
    const response = await this.restRequest<{ data: ApiKey }>(
      "PATCH",
      `/v1/api-keys/${id}`,
      updates,
    );
    return response.data;
  }

  // Summarize API - uses LLM to generate human-readable summaries
  async summarize(prompt: string): Promise<{ summary: string; durationMs: number }> {
    return this.restRequest<{ summary: string; durationMs: number }>("POST", "/v1/summarize", {
      prompt,
    });
  }

  async initializeUser({
    userId,
    email,
    name,
  }: {
    userId: string;
    email: string;
    name?: string;
  }): Promise<{ success: boolean; data?: { userId: string; orgId: string; email: string } }> {
    return this.restRequest("POST", "/v1/internal/initializeUser", { userId, email, name });
  }

  async assignOrgRole({
    userId,
    orgId,
    roleId,
  }: {
    userId: string;
    orgId: string;
    roleId: string;
  }): Promise<{ success: boolean }> {
    return this.restRequest("POST", "/v1/internal/assignOrgRole", { userId, orgId, roleId });
  }
}

// Response type for notification settings
export interface SlackChannelResponse {
  enabled: boolean;
  authType: SlackAuthType;
  webhookUrl?: string;
  botToken?: string;
  channelId?: string;
  isConfigured: boolean;
  status: "active" | "failing" | "disabled";
  lastError?: string;
  lastErrorAt?: string;
  consecutiveFailures: number;
  rules: NotificationRule[];
}

export interface NotificationSettingsResponse {
  channels: {
    slack: SlackChannelResponse | null;
  };
  rateLimit: {
    maxPerHour: number;
    currentCount: number;
    windowStart: string;
  };
}

export interface ApiKey {
  id: string;
  key: string;
  orgId: string;
  userId: string;
  createdByUserId: string;
  mode: "frontend" | "backend";
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export function createEESuperglueClient(apiEndpoint: string): EESuperglueClient {
  return new EESuperglueClient({
    apiKey: tokenRegistry.getToken(),
    apiEndpoint,
    onInfrastructureError: () => connectionMonitor.onInfrastructureError(apiEndpoint),
  });
}

// Portal Client for end-user portal operations (uses portal session token, not API key)
export interface PortalSession {
  sessionToken: string;
  endUser: {
    id: string;
    externalId: string;
    email?: string;
    name?: string;
  };
  systems: PortalSystemInfo[];
}

export interface PortalSystemInfo {
  id: string;
  name: string;
  url?: string;
  icon?: string;
  hasCredentials: boolean;
  oauth?: {
    authUrl?: string;
    tokenUrl?: string;
    scopes?: string;
    clientId?: string;
    grantType?: string;
  };
  templateName?: string;
  authType?: "apikey" | "oauth" | "none";
  credentialMode?: "user" | "org";
  credentialFields?: string[];
}

export interface PortalApiKey {
  id: string;
  key: string;
  isActive: boolean;
  createdAt: string;
}

export class PortalClient {
  private apiEndpoint: string;
  private sessionToken: string;

  constructor(apiEndpoint: string, sessionToken: string) {
    this.apiEndpoint = apiEndpoint;
    this.sessionToken = sessionToken;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const response = await fetch(`${this.apiEndpoint}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.sessionToken}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `Request failed: ${response.statusText}`);
    }

    return response.json();
  }

  async getSession(): Promise<PortalSession> {
    const data = await this.request<{
      endUser: PortalSession["endUser"];
      systems: PortalSystemInfo[];
    }>("GET", "/v1/portal/session");
    return {
      sessionToken: this.sessionToken,
      endUser: data.endUser,
      systems: data.systems,
    };
  }

  async listApiKeys(): Promise<PortalApiKey[]> {
    const data = await this.request<{ data: PortalApiKey[] }>("GET", "/v1/portal/api-keys");
    return data.data || [];
  }

  async createApiKey(): Promise<PortalApiKey> {
    const data = await this.request<{ data: PortalApiKey }>("POST", "/v1/portal/api-keys", {});
    if (!data.data) throw new Error("Failed to create API key");
    return data.data;
  }

  async deleteApiKey(keyId: string): Promise<void> {
    await this.request("DELETE", `/v1/portal/api-keys/${keyId}`);
  }

  async saveSystemCredentials(
    systemId: string,
    credentials: Record<string, unknown>,
  ): Promise<void> {
    await this.request("POST", `/v1/portal/systems/${systemId}/credentials`, { credentials });
  }

  async deleteSystemCredentials(systemId: string): Promise<void> {
    await this.request("DELETE", `/v1/portal/systems/${systemId}/credentials`);
  }
}

export function createPortalClient(apiEndpoint: string, sessionToken: string): PortalClient {
  return new PortalClient(apiEndpoint, sessionToken);
}
