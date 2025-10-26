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
        orgId: '', 
        success: false,
        userId: undefined,
        orgName: undefined,
        orgRole: undefined
      };
    }
    return {
      orgId: this.defaultOrgId,
      success: token === this.authToken,
      userId: undefined,
      orgName: undefined,
      orgRole: undefined
    };
  }
}
