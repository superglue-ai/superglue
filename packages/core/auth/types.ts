export interface AuthResult {
  success: boolean;
  orgId: string;
  userId?: string;
  userEmail?: string;
  orgName?: string;
  message?: string;
}

export interface CreateApiKeyParams {
  orgId: string;
  createdByUserId: string;
  userId?: string;
}

export interface AuthManager {
  authenticate(token: string): Promise<AuthResult>;
  createApiKey?(params: CreateApiKeyParams): Promise<string | null>;
}
