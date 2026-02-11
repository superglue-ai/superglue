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
  allowedTools?: string[];
}

export interface AuthManager {
  authenticate(token: string): Promise<AuthResult>;
  createApiKey?(
    orgId: string,
    userId?: string,
    mode?: "frontend" | "backend",
  ): Promise<string | null>;
}
