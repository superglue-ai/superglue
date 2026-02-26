import { UserRole } from "@superglue/shared";

export interface AuthResult {
  success: boolean;
  orgId: string;
  userId?: string;
  orgName?: string;
  orgRole?: UserRole;
  message?: string;
  // EE: API key permission fields
  isRestricted?: boolean;
}

export interface CreateApiKeyParams {
  orgId: string;
  createdByUserId: string;
  isRestricted: boolean;
  userId?: string;
  mode?: "frontend" | "backend";
}

export interface AuthManager {
  authenticate(token: string): Promise<AuthResult>;
  createApiKey?(params: CreateApiKeyParams): Promise<string | null>;
}
