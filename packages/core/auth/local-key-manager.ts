import { AuthManager, AuthResult } from "./types.js";

export class LocalKeyManager implements AuthManager {
  private readonly authToken: string | undefined;
  private readonly defaultOrgId = "";

  constructor() {
    this.authToken = process.env.AUTH_TOKEN;
  }

  public async authenticate(token: string): Promise<AuthResult> {
    if (!this.authToken) {
      return { 
        success: false,
      };
    }
    return {
      success: token === this.authToken,
      orgId: this.defaultOrgId
    };
  }
}
