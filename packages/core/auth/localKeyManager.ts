import { ApiKeyManager } from "./apiKeyManager.js";

export class LocalKeyManager implements ApiKeyManager {
  private readonly authToken: string | undefined;
  private readonly defaultOrgId = "";

  constructor() {
    this.authToken = process.env.AUTH_TOKEN;
  }

  public async getApiKeys(): Promise<{ orgId: string; key: string }[]> {
    if (!this.authToken) {
      return [];
    }
    return [{ orgId: this.defaultOrgId, key: this.authToken }];
  }

  public async authenticate(apiKey: string): Promise<{ orgId: string; success: boolean }> {
    if (!this.authToken) {
      return { orgId: '', success: false };
    }
    return {
      orgId: this.defaultOrgId,
      success: apiKey === this.authToken
    };
  }

  public cleanup(): void {
    // No cleanup needed for local key manager
  }
}
