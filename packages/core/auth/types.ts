import { UserRole } from "@superglue/shared";

export interface AuthResult {
  success: boolean;
  orgId: string;
  userId?: string;
  orgName?: string;
  orgRole?: UserRole;
  message?: string;
}

export interface AuthManager {
  authenticate(token: string): Promise<AuthResult>;
}
