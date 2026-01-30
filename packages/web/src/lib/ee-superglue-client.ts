import {
  BatchFileUploadRequest,
  BatchFileUploadResponse,
  DiscoveryRun,
  DiscoverySource,
  FileReference,
  NotificationRule,
  NotificationSettings,
  SlackAuthType,
  SuperglueClient,
  Tool,
  ToolSchedule,
} from "@superglue/shared";
import { tokenRegistry } from "./token-registry";

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

export function createEESuperglueClient(endpoint: string, apiEndpoint?: string): EESuperglueClient {
  return new EESuperglueClient({
    endpoint,
    apiKey: tokenRegistry.getToken(),
    apiEndpoint,
  });
}
