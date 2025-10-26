export interface AuthResult {
    orgId: string;
    success: boolean;
    userId?: string;
    orgName?: string;
    orgRole?: string;
    message?: string;
}

export interface AuthManager {
    authenticate(token: string): Promise<AuthResult>;
}