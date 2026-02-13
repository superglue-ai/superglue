"use client";

import { useConfig } from "@/src/app/config-context";
import { useSystems } from "@/src/app/systems-context";
import { useToast } from "@/src/hooks/use-toast";
import { createSuperglueClient } from "@/src/lib/client-utils";
import type { System } from "@superglue/shared";
import { systems as systemTemplates, findTemplateForSystem } from "@superglue/shared";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AuthState,
  ContextState,
  OAuthFields,
  OnboardingState,
  PhaseCompletion,
  SectionStatus,
  SystemConfigContextValue,
  SystemContextForAgent,
  SystemDefinition,
  SystemSection,
} from "./types";

const DEFAULT_OAUTH_FIELDS: OAuthFields = {
  client_id: "",
  client_secret: "",
  auth_url: "",
  token_url: "",
  access_token: "",
  refresh_token: "",
  scopes: "",
  expires_at: "",
  expires_in: "",
  token_type: "Bearer",
  grant_type: "authorization_code",
  oauth_cert: "",
  oauth_key: "",
};

function detectAuthType(credentials: any): "oauth" | "apikey" | "none" {
  if (!credentials || Object.keys(credentials).length === 0) return "none";

  const oauthSpecificFields = [
    "client_id",
    "client_secret",
    "auth_url",
    "token_url",
    "access_token",
    "refresh_token",
    "scopes",
    "expires_at",
    "token_type",
  ];

  const allKeys = Object.keys(credentials);
  const hasOAuthFields = allKeys.some((key) => oauthSpecificFields.includes(key));

  if (hasOAuthFields) return "oauth";
  return "apikey";
}

function extractOAuthFields(credentials: Record<string, any>): OAuthFields {
  return {
    client_id: credentials.client_id || "",
    client_secret: credentials.client_secret || "",
    auth_url: credentials.auth_url || "",
    token_url: credentials.token_url || "",
    access_token: credentials.access_token || "",
    refresh_token: credentials.refresh_token || "",
    scopes: credentials.scopes || "",
    expires_at: credentials.expires_at || "",
    expires_in: credentials.expires_in || "",
    token_type: credentials.token_type || "Bearer",
    grant_type: credentials.grant_type || "authorization_code",
    oauth_cert: credentials.oauth_cert || "",
    oauth_key: credentials.oauth_key || "",
  };
}

function extractNonOAuthCredentials(credentials: Record<string, any>): string {
  const oauthKeys = [
    "client_id",
    "client_secret",
    "auth_url",
    "token_url",
    "access_token",
    "refresh_token",
    "scopes",
    "expires_at",
    "expires_in",
    "token_type",
    "grant_type",
    "oauth_cert",
    "oauth_key",
  ];

  const nonOAuthCreds: Record<string, any> = {};
  for (const [key, value] of Object.entries(credentials)) {
    if (!oauthKeys.includes(key)) {
      nonOAuthCreds[key] = value;
    }
  }

  return Object.keys(nonOAuthCreds).length > 0 ? JSON.stringify(nonOAuthCreds, null, 2) : "{}";
}

interface SystemConfigProviderProps {
  initialSystem?: System;
  isNew?: boolean;
  isOnboarding?: boolean;
  children: ReactNode;
}

const SystemConfigContext = createContext<SystemConfigContextValue | null>(null);

export function useSystemConfig(): SystemConfigContextValue {
  const context = useContext(SystemConfigContext);
  if (!context) {
    throw new Error("useSystemConfig must be used within a SystemConfigProvider");
  }
  return context;
}

export function SystemConfigProvider({
  initialSystem,
  isNew = false,
  isOnboarding = false,
  children,
}: SystemConfigProviderProps) {
  const config = useConfig();
  const { toast } = useToast();
  const { systems, refreshSystems } = useSystems();

  const initialRef = useRef(initialSystem);

  const [systemId, setSystemId] = useState(initialSystem?.id || "");
  const [systemName, setSystemName] = useState(initialSystem?.name || "");
  const [urlHost, setUrlHost] = useState(initialSystem?.urlHost || "");
  const [urlPath, setUrlPath] = useState(initialSystem?.urlPath || "");
  const [templateName, setTemplateName] = useState(initialSystem?.templateName || "");
  const [icon, setIcon] = useState(initialSystem?.icon || "");

  const initialAuthType = initialSystem
    ? detectAuthType(initialSystem.credentials || {})
    : "apikey";
  const [authType, setAuthType] = useState<"none" | "oauth" | "apikey">(initialAuthType);
  const [credentials, setCredentials] = useState<Record<string, any>>(
    initialSystem?.credentials || {},
  );
  const [oauthFields, setOauthFieldsState] = useState<OAuthFields>(
    initialSystem?.credentials
      ? extractOAuthFields(initialSystem.credentials)
      : DEFAULT_OAUTH_FIELDS,
  );
  const [apiKeyCredentials, setApiKeyCredentials] = useState(
    initialSystem?.credentials
      ? initialAuthType === "oauth"
        ? extractNonOAuthCredentials(initialSystem.credentials)
        : JSON.stringify(initialSystem.credentials, null, 2)
      : "{}",
  );
  const [useSuperglueOAuth, setUseSuperglueOAuth] = useState(false);

  const [specificInstructions, setSpecificInstructions] = useState(
    initialSystem?.specificInstructions || "",
  );
  const [docFileCount, setDocFileCount] = useState(0);
  const [activeSection, setActiveSection] = useState<SystemSection>("configuration");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const [isOnboardingActive, setIsOnboardingActive] = useState(isOnboarding);

  useEffect(() => {
    if (!initialSystem?.id) return;
    const client = createSuperglueClient(config.superglueEndpoint, config.apiEndpoint);
    client
      .listSystemFileReferences(initialSystem.id)
      .then((result) => {
        setDocFileCount(result.files.length);
      })
      .catch(() => {});
  }, [initialSystem?.id, config.superglueEndpoint, config.apiEndpoint]);

  useEffect(() => {
    if (!systemId || isNew) return;

    const updatedSystem = systems.find((s) => s.id === systemId);
    if (!updatedSystem) return;

    const currentUpdatedAt = updatedSystem.updatedAt
      ? new Date(updatedSystem.updatedAt).getTime()
      : 0;
    const initialUpdatedAt = initialRef.current?.updatedAt
      ? new Date(initialRef.current.updatedAt).getTime()
      : 0;

    if (currentUpdatedAt > initialUpdatedAt) {
      setSystemName(updatedSystem.name || "");
      setUrl(updatedSystem.url || "");
      setTemplateName(updatedSystem.templateName || "");
      setIcon(updatedSystem.icon || "");
      setSpecificInstructions(updatedSystem.specificInstructions || "");

      const newAuthType = detectAuthType(updatedSystem.credentials || {});
      setAuthType(newAuthType);
      setCredentials(updatedSystem.credentials || {});
      setOauthFieldsState(extractOAuthFields(updatedSystem.credentials || {}));
      setApiKeyCredentials(
        newAuthType === "oauth"
          ? extractNonOAuthCredentials(updatedSystem.credentials || {})
          : JSON.stringify(updatedSystem.credentials || {}, null, 2),
      );

      initialRef.current = updatedSystem;
      setHasUnsavedChanges(false);
    }
  }, [systems, systemId, isNew]);

  useEffect(() => {
    if (!initialSystem) return;

    const hasChanges =
      systemId !== (initialSystem.id || "") ||
      systemName !== (initialSystem.name || "") ||
      url !== (initialSystem.url || "") ||
      specificInstructions !== (initialSystem.specificInstructions || "") ||
      authType !== detectAuthType(initialSystem.credentials || {});

    setHasUnsavedChanges(hasChanges);
  }, [systemId, systemName, url, specificInstructions, authType, initialSystem]);

  useEffect(() => {
    if (isNew) {
      setHasUnsavedChanges(systemId.trim().length > 0 || urlHost.trim().length > 0);
    }
  }, [isNew, systemId, urlHost]);

  const setOAuthFields = useCallback((fields: Partial<OAuthFields>) => {
    setOauthFieldsState((prev) => ({ ...prev, ...fields }));
    setHasUnsavedChanges(true);
  }, []);

  const isOAuthConfigured = useMemo(() => {
    const effectiveGrantType = oauthFields.grant_type || "authorization_code";
    const effectiveAccessToken = oauthFields.access_token;
    const effectiveRefreshToken = oauthFields.refresh_token;

    return effectiveGrantType === "client_credentials"
      ? Boolean(effectiveAccessToken)
      : Boolean(effectiveAccessToken && effectiveRefreshToken);
  }, [oauthFields]);

  const system = useMemo<SystemDefinition>(
    () => ({
      id: systemId,
      name: systemName || undefined,
      urlHost,
      urlPath,
      templateName: templateName || undefined,
      icon: icon || undefined,
      createdAt: initialSystem?.createdAt,
      updatedAt: initialSystem?.updatedAt,
    }),
    [systemId, systemName, urlHost, urlPath, templateName, icon, initialSystem],
  );

  const auth = useMemo<AuthState>(
    () => ({
      authType,
      credentials,
      oauthFields,
      apiKeyCredentials,
      isOAuthConfigured,
      useSuperglueOAuth,
    }),
    [authType, credentials, oauthFields, apiKeyCredentials, isOAuthConfigured, useSuperglueOAuth],
  );

  const context = useMemo<ContextState>(
    () => ({
      specificInstructions,
      docFileCount,
    }),
    [specificInstructions, docFileCount],
  );

  const getSectionStatus = useCallback(
    (section: SystemSection): SectionStatus => {
      switch (section) {
        case "configuration":
          const hasId = systemId.trim().length > 0;
          const hasUrl = urlHost.trim().length > 0;
          return {
            isComplete: hasId && hasUrl,
            hasErrors: false,
            label: hasId && hasUrl ? "Configured" : "Needs endpoint",
          };
        case "authentication":
          if (authType === "none") {
            return { isComplete: true, hasErrors: false, label: "No auth" };
          }
          if (authType === "oauth") {
            return {
              isComplete: isOAuthConfigured,
              hasErrors: false,
              label: "OAuth",
            };
          }
          try {
            const parsed = JSON.parse(apiKeyCredentials);
            const hasKeys = Object.keys(parsed).length > 0;
            return {
              isComplete: hasKeys,
              hasErrors: false,
              label: "API Key",
            };
          } catch {
            return { isComplete: false, hasErrors: false, label: "API Key" };
          }
        case "context":
          const hasInstructions = specificInstructions.trim().length > 0;
          return {
            isComplete: docFileCount > 0 || hasInstructions,
            hasErrors: false,
            label: `${docFileCount} source${docFileCount !== 1 ? "s" : ""}`,
          };
        default:
          return { isComplete: false, hasErrors: false, label: "Unknown" };
      }
    },
    [
      systemId,
      urlHost,
      authType,
      isOAuthConfigured,
      apiKeyCredentials,
      specificInstructions,
      docFileCount,
    ],
  );

  const getSystemContextForAgent = useCallback((): SystemContextForAgent => {
    let credentialKeys: string[] = [];
    if (authType === "oauth") {
      const oauthKeys = Object.entries(oauthFields)
        .filter(([_, value]) => value !== "")
        .map(([key]) => key);
      let additionalKeys: string[] = [];
      try {
        const parsed = JSON.parse(apiKeyCredentials || "{}");
        additionalKeys = Object.keys(parsed);
      } catch {}
      credentialKeys = [...new Set([...oauthKeys, ...additionalKeys])];
    } else if (authType === "apikey") {
      try {
        const parsed = JSON.parse(apiKeyCredentials || "{}");
        credentialKeys = Object.keys(parsed);
      } catch {}
    }

    return {
      systemId,
      urlHost,
      urlPath,
      templateName: templateName || undefined,
      authType,
      credentialKeys,
      specificInstructions,
      sectionStatuses: {
        configuration: getSectionStatus("configuration"),
        authentication: getSectionStatus("authentication"),
        context: getSectionStatus("context"),
      },
    };
  }, [
    systemId,
    urlHost,
    urlPath,
    templateName,
    authType,
    oauthFields,
    apiKeyCredentials,
    specificInstructions,
    getSectionStatus,
  ]);

  const saveSystem = useCallback(
    async (oauthTokenOverride?: Partial<OAuthFields>): Promise<boolean> => {
      if (!systemId.trim()) {
        toast({
          title: "Error",
          description: "System ID is required",
          variant: "destructive",
        });
        return false;
      }

      if (!urlHost.trim()) {
        toast({
          title: "Error",
          description: "API Endpoint is required",
          variant: "destructive",
        });
        return false;
      }

      setIsSaving(true);

      try {
        let finalCredentials: Record<string, any> = {};
        const effectiveOAuthFields = oauthTokenOverride
          ? { ...oauthFields, ...oauthTokenOverride }
          : oauthFields;

        if (authType === "oauth") {
          const oauthCredsRaw = Object.fromEntries(
            Object.entries(effectiveOAuthFields).filter(([_, value]) => value !== ""),
          );
          let additionalCreds: Record<string, any> = {};
          if (
            apiKeyCredentials &&
            apiKeyCredentials.trim() !== "" &&
            apiKeyCredentials.trim() !== "{}"
          ) {
            try {
              additionalCreds = JSON.parse(apiKeyCredentials);
            } catch {
              toast({
                title: "Error",
                description: "Additional API credentials must be valid JSON",
                variant: "destructive",
              });
              setIsSaving(false);
              return false;
            }
          }
          finalCredentials = { ...oauthCredsRaw, ...additionalCreds };
        } else if (authType === "apikey") {
          try {
            finalCredentials = JSON.parse(apiKeyCredentials);
          } catch {
            toast({
              title: "Error",
              description: "Credentials must be valid JSON",
              variant: "destructive",
            });
            setIsSaving(false);
            return false;
          }
        }

        const systemData = {
          name: systemName.trim() || undefined,
          url: url.trim(),
          specificInstructions: specificInstructions.trim(),
          credentials: finalCredentials,
          templateName: templateName || undefined,
        };

        const existingSystem = systems.find((s) => s.id === systemId);

        const client = createSuperglueClient(config.superglueEndpoint, config.apiEndpoint);
        const savedSystem = existingSystem
          ? await client.updateSystem(systemId, systemData)
          : await client.createSystem({ ...systemData, name: systemData.name || systemId });

        await refreshSystems();
        setHasUnsavedChanges(false);
        initialRef.current = savedSystem;

        toast({
          title: "Success",
          description: `System "${systemId}" saved successfully`,
        });

        return true;
      } catch (error) {
        console.error("Error saving system:", error);
        toast({
          title: "Error",
          description: "Failed to save system",
          variant: "destructive",
        });
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [
      systemId,
      systemName,
      url,
      specificInstructions,
      authType,
      oauthFields,
      apiKeyCredentials,
      templateName,
      systems,
      config.superglueEndpoint,
      config.apiEndpoint,
      refreshSystems,
      toast,
    ],
  );

  const resetToInitial = useCallback(() => {
    const initial = initialRef.current;
    if (initial) {
      setSystemId(initial.id || "");
      setSystemName(initial.name || "");
      setUrlHost(initial.urlHost || "");
      setUrlPath(initial.urlPath || "");
      setTemplateName(initial.templateName || "");
      setIcon(initial.icon || "");
      setAuthType(detectAuthType(initial.credentials || {}));
      setCredentials(initial.credentials || {});
      setOauthFieldsState(extractOAuthFields(initial.credentials || {}));
      setApiKeyCredentials(
        detectAuthType(initial.credentials || {}) === "oauth"
          ? extractNonOAuthCredentials(initial.credentials || {})
          : JSON.stringify(initial.credentials || {}, null, 2),
      );
      setSpecificInstructions(initial.specificInstructions || "");
    } else {
      setSystemId("");
      setSystemName("");
      setUrlHost("");
      setUrlPath("");
      setTemplateName("");
      setIcon("");
      setAuthType("apikey");
      setCredentials({});
      setOauthFieldsState(DEFAULT_OAUTH_FIELDS);
      setApiKeyCredentials("{}");
      setSpecificInstructions("");
    }
    setHasUnsavedChanges(false);
  }, []);

  const phaseCompletion = useMemo<PhaseCompletion>(() => {
    const configComplete = Boolean(systemId.trim() && urlHost.trim());

    let authComplete = false;
    if (authType === "none") {
      authComplete = true;
    } else if (authType === "oauth") {
      const effectiveGrantType = oauthFields.grant_type || "authorization_code";
      authComplete =
        effectiveGrantType === "client_credentials"
          ? Boolean(oauthFields.access_token)
          : Boolean(oauthFields.access_token && oauthFields.refresh_token);
    } else if (authType === "apikey") {
      try {
        const parsed = JSON.parse(apiKeyCredentials);
        authComplete = Object.keys(parsed).length > 0;
      } catch {
        authComplete = false;
      }
    }

    const contextComplete = Boolean(specificInstructions.trim());

    return {
      configuration: configComplete,
      authentication: authComplete,
      context: contextComplete,
    };
  }, [
    systemId,
    urlHost,
    authType,
    oauthFields.access_token,
    oauthFields.refresh_token,
    oauthFields.grant_type,
    apiKeyCredentials,
    specificInstructions,
  ]);

  const exitOnboarding = useCallback(() => {
    setIsOnboardingActive(false);
  }, []);

  const onboarding = useMemo<OnboardingState>(
    () => ({
      isOnboarding: isOnboardingActive,
      phaseCompletion,
    }),
    [isOnboardingActive, phaseCompletion],
  );

  const value = useMemo<SystemConfigContextValue>(
    () => ({
      system,
      auth,
      context,

      activeSection,
      isNewSystem: isNew,
      hasUnsavedChanges,
      isSaving,
      isLoading,

      onboarding,
      exitOnboarding,

      setSystemId: (id) => {
        setSystemId(id);
        setHasUnsavedChanges(true);
      },
      setSystemName: (name) => {
        setSystemName(name);
        setHasUnsavedChanges(true);
      },
      setUrlHost: (host) => {
        setUrlHost(host);
        setHasUnsavedChanges(true);
      },
      setUrlPath: (path) => {
        setUrlPath(path);
        setHasUnsavedChanges(true);
      },
      setTemplateName: (name) => {
        setTemplateName(name);
        setHasUnsavedChanges(true);
      },
      setIcon: (icon) => {
        setIcon(icon);
        setHasUnsavedChanges(true);
      },

      setAuthType: (type) => {
        setAuthType(type);
        setHasUnsavedChanges(true);
      },
      setCredentials: (creds) => {
        setCredentials(creds);
        setHasUnsavedChanges(true);
      },
      setOAuthFields,
      setApiKeyCredentials: (creds) => {
        setApiKeyCredentials(creds);
        setHasUnsavedChanges(true);
      },
      setUseSuperglueOAuth: (use) => {
        setUseSuperglueOAuth(use);
        setHasUnsavedChanges(true);
      },

      setSpecificInstructions: (instructions) => {
        setSpecificInstructions(instructions);
        setHasUnsavedChanges(true);
      },

      setDocFileCount,

      setActiveSection,

      getSectionStatus,
      getSystemContextForAgent,

      saveSystem,
      resetToInitial,
    }),
    [
      system,
      auth,
      context,
      activeSection,
      isNew,
      hasUnsavedChanges,
      isSaving,
      isLoading,
      onboarding,
      exitOnboarding,
      setOAuthFields,
      getSectionStatus,
      getSystemContextForAgent,
      saveSystem,
      resetToInitial,
    ],
  );

  return <SystemConfigContext.Provider value={value}>{children}</SystemConfigContext.Provider>;
}
