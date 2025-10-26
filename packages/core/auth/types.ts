export interface AuthResult {
    success: boolean;
    orgId: string
    userId?: string;
    orgName?: string;
    orgRole?: string;
    message?: string;
}

export interface AuthManager {
    authenticate(token: string): Promise<AuthResult>;
}