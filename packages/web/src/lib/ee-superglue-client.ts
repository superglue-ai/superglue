import {
  BatchFileUploadRequest,
  BatchFileUploadResponse,
  FileReference,
  SuperglueClient,
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
}

export function createEESuperglueClient(apiEndpoint: string): EESuperglueClient {
  return new EESuperglueClient({
    apiKey: tokenRegistry.getToken(),
    apiEndpoint,
  });
}
