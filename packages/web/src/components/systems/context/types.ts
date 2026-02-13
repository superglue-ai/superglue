export interface OAuthFields {
  client_id: string;
  client_secret: string;
  auth_url: string;
  token_url: string;
  access_token: string;
  refresh_token: string;
  scopes: string;
  expires_at: string;
  expires_in: string;
  token_type: string;
  grant_type: "authorization_code" | "client_credentials";
  oauth_cert: string;
  oauth_key: string;
}

export interface SystemDefinition {
  id: string;
  name?: string;
  urlHost: string;
  urlPath: string;
  templateName?: string;
  icon?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface AuthState {
  authType: "none" | "oauth" | "apikey";
  credentials: Record<string, any>;
  oauthFields: OAuthFields;
  apiKeyCredentials: string;
  isOAuthConfigured: boolean;
  useSuperglueOAuth: boolean;
}

export interface ContextState {
  specificInstructions: string;
  docFileCount: number;
}

export type SystemSection = "configuration" | "authentication" | "context";
export type OnboardingPhase = "configuration" | "authentication" | "context";

export interface SectionStatus {
  isComplete: boolean;
  hasErrors: boolean;
  label: string;
}

export interface PhaseCompletion {
  configuration: boolean;
  authentication: boolean;
  context: boolean;
}

export interface OnboardingState {
  isOnboarding: boolean;
  phaseCompletion: PhaseCompletion;
}

export interface SystemConfigContextValue {
  system: SystemDefinition;
  auth: AuthState;
  context: ContextState;

  activeSection: SystemSection;
  isNewSystem: boolean;
  hasUnsavedChanges: boolean;
  isSaving: boolean;
  isLoading: boolean;

  onboarding: OnboardingState;
  exitOnboarding: () => void;

  setSystemId: (id: string) => void;
  setSystemName: (name: string) => void;
  setUrlHost: (host: string) => void;
  setUrlPath: (path: string) => void;
  setTemplateName: (name: string) => void;
  setIcon: (icon: string) => void;

  setAuthType: (type: "none" | "oauth" | "apikey") => void;
  setCredentials: (credentials: Record<string, any>) => void;
  setOAuthFields: (fields: Partial<OAuthFields>) => void;
  setApiKeyCredentials: (credentials: string) => void;
  setUseSuperglueOAuth: (use: boolean) => void;

  setSpecificInstructions: (instructions: string) => void;
  setDocFileCount: (count: number) => void;

  setActiveSection: (section: SystemSection) => void;

  getSectionStatus: (section: SystemSection) => SectionStatus;
  getSystemContextForAgent: () => SystemContextForAgent;

  saveSystem: (oauthTokenOverride?: Partial<OAuthFields>) => Promise<boolean>;
  resetToInitial: () => void;
}

export interface SystemContextForAgent {
  systemId: string;
  urlHost: string;
  urlPath: string;
  templateName?: string;
  authType: "none" | "oauth" | "apikey";
  credentialKeys: string[];
  specificInstructions: string;
  sectionStatuses: {
    configuration: { isComplete: boolean; label: string };
    authentication: { isComplete: boolean; label: string };
    context: { isComplete: boolean; label: string };
  };
}
