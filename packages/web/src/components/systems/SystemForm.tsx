import { useConfig } from "@/src/app/config-context";
import { detectAuthType } from "@/src/app/systems/page";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/src/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/src/components/ui/command";
import { FileChip } from "@/src/components/ui/FileChip";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/src/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Switch } from "@/src/components/ui/switch";
import { Textarea } from "@/src/components/ui/textarea";
import { CredentialsManager } from "@/src/components/utils/CredentialManager";
import { DocumentationField } from "@/src/components/utils/DocumentationField";
import { HelpTooltip } from "@/src/components/utils/HelpTooltip";
import { URLField } from "@/src/components/utils/URLField";
import { useToast } from "@/src/hooks/use-toast";
import { cn, composeUrl, inputErrorStyles } from "@/src/lib/general-utils";
import { tokenRegistry } from "@/src/lib/token-registry";
import type { System } from "@superglue/shared";

import {
  createOAuthErrorHandler,
  getOAuthCallbackUrl,
  triggerOAuthFlow,
} from "@/src/lib/oauth-utils";
import { findTemplateForSystem, resolveOAuthCertAndKey, systems } from "@superglue/shared";
import { Check, ChevronRight, ChevronsUpDown, Eye, EyeOff, Globe, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CopyButton } from "../tools/shared/CopyButton";

export interface SystemFormProps {
  system?: System;
  onSave: (system: System) => Promise<System | null>;
  onCancel: () => void;
  systemOptions: { value: string; label: string; icon: string }[];
  getSimpleIcon: (name: string) => any;
  modal?: boolean;
}

function sanitizeSystemId(id: string) {
  // Handle PostgreSQL connection strings specially
  if (id.startsWith("postgres://") || id.startsWith("postgresql://")) {
    try {
      const url = new URL(id);
      let host = url.hostname;
      const database = url.pathname.substring(1); // Remove leading slash

      // Truncate host if too long (keep first 20 chars)
      if (host.length > 20) {
        host = host.substring(0, 20);
      }

      let cleanId = `DB-${host}-${database}`;

      return cleanId
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-") // Replace non-alphanumeric with hyphens
        .replace(/-+/g, "-") // Replace multiple hyphens with single
        .replace(/^-|-$/g, ""); // Remove leading/trailing hyphens
    } catch {}
  }

  let cleanId = id.replace(/^.*:\/\//, "");

  const slashIndex = cleanId.indexOf("/");
  if (slashIndex !== -1) {
    cleanId = cleanId.substring(0, slashIndex);
  }

  return cleanId
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-") // Replace non-alphanumeric with hyphens
    .replace(/-+/g, "-") // Replace multiple hyphens with single
    .replace(/^-|-$/g, ""); // Remove leading/trailing hyphens
}

export function SystemForm({
  system,
  onSave,
  onCancel,
  systemOptions,
  getSimpleIcon,
  modal = false,
}: SystemFormProps) {
  const initialSelected = system ? (findTemplateForSystem(system)?.key ?? "") : "";
  const [selectedSystem, setSelectedSystem] = useState<string>(initialSelected);
  const [systemDropdownOpen, setSystemDropdownOpen] = useState(false);
  const [id, setId] = useState(system?.id || initialSelected);
  const [urlHost, setUrlHost] = useState(system?.urlHost || "");
  const [urlPath, setUrlPath] = useState(system?.urlPath || "");
  const [documentationUrl, setDocumentationUrl] = useState(system?.documentationUrl || "");
  const [documentation, setDocumentation] = useState(system?.documentation || "");
  const [specificInstructions, setSpecificInstructions] = useState(
    system?.specificInstructions || "",
  );

  // Add state to track if user manually edited the ID
  const [isIdManuallyEdited, setIsIdManuallyEdited] = useState(false);

  // Initialize auth type
  const initialAuthType = !system ? "apikey" : detectAuthType(system.credentials || {});
  const [authType, setAuthType] = useState<"none" | "oauth" | "apikey">(initialAuthType);

  // Initialize OAuth fields
  const [oauthFields, setOauthFields] = useState(() => {
    const creds = system?.credentials || {};
    return {
      client_id: creds.client_id || "",
      client_secret: creds.client_secret || "",
      auth_url: creds.auth_url || "",
      token_url: creds.token_url || "",
      access_token: creds.access_token || "",
      refresh_token: creds.refresh_token || "",
      scopes: creds.scopes || "",
      expires_at: creds.expires_at || "",
      expires_in: creds.expires_in || "",
      token_type: creds.token_type || "Bearer",
      grant_type: creds.grant_type || "authorization_code",
      oauth_cert: creds.oauth_cert || "",
      oauth_key: creds.oauth_key || "",
    };
  });

  // Track initial OAuth field values to detect changes
  const [initialOAuthFields, setInitialOAuthFields] = useState(() => {
    const creds = system?.credentials || {};
    return {
      client_id: creds.client_id || "",
      client_secret: creds.client_secret || "",
      auth_url: creds.auth_url || "",
      token_url: creds.token_url || "",
      scopes: creds.scopes || "",
      grant_type: "authorization_code",
    };
  });

  // Track initial API credentials to detect changes
  const [initialApiCredentials, setInitialApiCredentials] = useState(() => {
    const creds = system?.credentials || {};
    if (initialAuthType === "oauth" && system) {
      const {
        client_id,
        client_secret,
        auth_url,
        token_url,
        access_token,
        refresh_token,
        scopes,
        expires_at,
        expires_in,
        token_type,
        grant_type,
        oauth_cert,
        oauth_key,
        ...additionalCreds
      } = creds;
      return Object.keys(additionalCreds).length > 0
        ? JSON.stringify(additionalCreds, null, 2)
        : "{}";
    }
    return Object.keys(creds).length > 0 ? JSON.stringify(creds, null, 2) : "{}";
  });

  // Initialize API key credentials as JSON string for CredentialsManager
  const [apiKeyCredentials, setApiKeyCredentials] = useState(() => {
    const creds = system?.credentials || {};
    // For OAuth systems, only include non-OAuth fields in the additional credentials
    if (initialAuthType === "oauth" && system) {
      const {
        client_id,
        client_secret,
        auth_url,
        token_url,
        access_token,
        refresh_token,
        scopes,
        expires_at,
        expires_in,
        token_type,
        grant_type,
        oauth_cert,
        oauth_key,
        ...additionalCreds
      } = creds;
      return Object.keys(additionalCreds).length > 0
        ? JSON.stringify(additionalCreds, null, 2)
        : "{}";
    }
    return Object.keys(creds).length > 0 ? JSON.stringify(creds, null, 2) : "{}";
  });

  const [validationErrors, setValidationErrors] = useState<Record<string, boolean>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showOAuth, setShowOAuth] = useState(false);
  const [useSuperglueOAuth, setUseSuperglueOAuth] = useState<boolean>(false);
  const [connectLoading, setConnectLoading] = useState(false);
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [hasUploadedFile, setHasUploadedFile] = useState(
    // Check if existing system has file upload
    system?.documentationUrl?.startsWith("file://") || false,
  );
  const [certFileName, setCertFileName] = useState<string>("");
  const [keyFileName, setKeyFileName] = useState<string>("");

  const { toast } = useToast();

  useEffect(() => {
    if (system?.credentials?.oauth_cert && system?.credentials?.oauth_key) {
      const { cert, key } = resolveOAuthCertAndKey(
        system.credentials.oauth_cert,
        system.credentials.oauth_key,
      );
      setCertFileName(cert?.filename || "Certificate loaded");
      setKeyFileName(key?.filename || "Private key loaded");
    }
  }, [system]);

  useEffect(() => {
    const handleOAuthMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const messageSystemId = event.data?.systemId;
      if (
        !messageSystemId ||
        (system?.id && messageSystemId !== system.id && messageSystemId !== id)
      ) {
        return;
      }

      if (event.data?.type === "oauth-success") {
        setConnectLoading(false);
        const tokens = event.data.tokens as
          | {
              access_token?: string;
              refresh_token?: string;
              token_type?: string;
              expires_at?: string;
            }
          | undefined;
        if (tokens) {
          setOauthFields((prev) => ({
            ...prev,
            access_token: tokens.access_token || prev.access_token,
            refresh_token: tokens.refresh_token || prev.refresh_token,
            token_type: tokens.token_type || prev.token_type,
            expires_at: tokens.expires_at || prev.expires_at,
          }));

          // Show success feedback for client_credentials flow
          if (oauthFields.grant_type === "client_credentials") {
            toast({
              title: "OAuth Connected",
              description: "Successfully authenticated with client credentials",
            });
          }
        }
      } else if (event.data?.type === "oauth-error") {
        setConnectLoading(false);
      }
    };
    window.addEventListener("message", handleOAuthMessage);
    return () => window.removeEventListener("message", handleOAuthMessage);
  }, [id, system?.id, oauthFields.grant_type, toast]);

  const urlFieldRef = useRef<any>(null);
  const isEditing = !!system;
  const config = useConfig();

  // Pre-fill OAuth fields when auth type/template changes; enable SG toggle if template has client_id
  useEffect(() => {
    if (authType !== "oauth" || !selectedSystem) return;
    const systemTemplate = systems[selectedSystem];
    const templateOAuth: any = systemTemplate?.oauth;
    setUseSuperglueOAuth((prev) =>
      isEditing
        ? prev
        : !!(templateOAuth?.client_id && String(templateOAuth.client_id).trim().length > 0),
    );
    setOauthFields((prev) => ({
      ...prev,
      client_id: prev.client_id || templateOAuth?.client_id || "",
      auth_url: prev.auth_url || templateOAuth?.authUrl || "",
      token_url: prev.token_url || templateOAuth?.tokenUrl || "",
      scopes: prev.scopes || templateOAuth?.scopes || "",
      grant_type:
        (templateOAuth?.grant_type as "authorization_code" | "client_credentials") ||
        prev.grant_type ||
        "authorization_code",
    }));
  }, [authType, selectedSystem]);

  useEffect(() => {
    if (!isEditing || authType !== "oauth" || !selectedSystem) return;
    const templateClientId = systems[selectedSystem]?.oauth?.client_id;
    const savedClientId = (system?.credentials || {}).client_id || oauthFields.client_id;
    if (templateClientId && savedClientId && savedClientId === templateClientId) {
      setUseSuperglueOAuth(true);
    }
  }, [isEditing, authType, selectedSystem, system, oauthFields.client_id]);

  // Function to handle file upload
  const handleFileUpload = (extractedText: string) => {
    setDocumentation(extractedText);
    setHasUploadedFile(true);
  };

  // Function to handle file removal
  const handleFileRemove = () => {
    setDocumentation("");
    setDocumentationUrl("");
    setHasUploadedFile(false);
  };

  const handleOAuthFileUpload =
    (field: "oauth_cert" | "oauth_key", setFileName: (name: string) => void, displayName: string) =>
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const content = await file.text();
        const fileData = JSON.stringify({
          filename: file.name,
          content,
        });
        setOauthFields((prev) => ({ ...prev, [field]: fileData }));
        setFileName(file.name);
        toast({
          title: `${displayName} uploaded`,
          description: `${file.name} loaded successfully`,
        });
      } catch (error) {
        toast({
          title: `Failed to read ${displayName.toLowerCase()}`,
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
      }
    };

  const handleRemoveOAuthFile =
    (field: "oauth_cert" | "oauth_key", setFileName: (name: string) => void, inputId: string) =>
    () => {
      setOauthFields((prev) => ({ ...prev, [field]: "" }));
      setFileName("");
      const fileInput = document.getElementById(inputId) as HTMLInputElement;
      if (fileInput) {
        fileInput.value = "";
      }
    };

  const handleCertFileUpload = handleOAuthFileUpload("oauth_cert", setCertFileName, "Certificate");
  const handleKeyFileUpload = handleOAuthFileUpload("oauth_key", setKeyFileName, "Private key");
  const handleRemoveCert = handleRemoveOAuthFile("oauth_cert", setCertFileName, "cert-file-upload");
  const handleRemoveKey = handleRemoveOAuthFile("oauth_key", setKeyFileName, "key-file-upload");

  const handleSystemSelect = (value: string) => {
    setSelectedSystem(value);

    if (!value) {
      setUrlHost("");
      setUrlPath("");
      setDocumentationUrl("");
      setDocumentation("");
      setSpecificInstructions("");
      // Set custom as ID if not editing
      if (!isEditing) {
        setId("new-system");
      }
      return;
    }

    // Use systems from shared package
    const systemTemplate = systems[value];

    if (systemTemplate) {
      const apiUrl = systemTemplate.apiUrl || "";
      let urlHost = "";
      let urlPath = "";
      try {
        const url = new URL(apiUrl);
        urlHost = url.origin;
        urlPath = url.pathname;
      } catch {
        urlHost = apiUrl;
        urlPath = "";
      }
      setUrlHost(urlHost);
      setUrlPath(urlPath);
      // Only set documentation URL if no file is uploaded
      if (!hasUploadedFile) {
        setDocumentationUrl(systemTemplate.docsUrl || "");
        setDocumentation("");
      }
      setSpecificInstructions("");
      // Always set ID to dropdown value for new systems
      if (!isEditing) {
        setId(value);
      }

      if (systemTemplate.preferredAuthType) {
        setAuthType(systemTemplate.preferredAuthType);
      }

      // Pre-fill OAuth fields if OAuth is preferred/available
      if (systemTemplate.oauth && systemTemplate.preferredAuthType === "oauth") {
        const templateOAuth: any = systemTemplate.oauth;
        setOauthFields((prev) => ({
          ...prev,
          client_id: templateOAuth?.client_id || prev.client_id,
          auth_url: templateOAuth?.authUrl || prev.auth_url,
          token_url: templateOAuth?.tokenUrl || prev.token_url,
          scopes: templateOAuth?.scopes || prev.scopes || "",
          grant_type:
            (templateOAuth?.grant_type as "authorization_code" | "client_credentials") ||
            prev.grant_type ||
            "authorization_code",
        }));
        setUseSuperglueOAuth(
          !!(templateOAuth?.client_id && String(templateOAuth.client_id).trim().length > 0),
        );
      } else {
        setUseSuperglueOAuth(false);
      }
    }
  };

  const handleUrlChange = (host: string, path: string) => {
    setUrlHost(host);
    setUrlPath(path);

    // Auto-update ID when URL changes (only for new systems and if not manually edited)
    if (!isEditing && !isIdManuallyEdited) {
      const fullUrl = composeUrl(host, path);
      if (fullUrl) {
        const sanitizedId = sanitizeSystemId(fullUrl);
        if (sanitizedId) {
          setId(sanitizedId);
        }
      }
    }
  };

  // Check if OAuth fields have changed
  const hasOAuthFieldsChanged = () => {
    if (authType !== "oauth") return false;

    // Check if any OAuth field changed
    const oauthFieldsChanged =
      oauthFields.client_id !== initialOAuthFields.client_id ||
      oauthFields.client_secret !== initialOAuthFields.client_secret ||
      oauthFields.auth_url !== initialOAuthFields.auth_url ||
      oauthFields.token_url !== initialOAuthFields.token_url ||
      oauthFields.scopes !== initialOAuthFields.scopes ||
      oauthFields.grant_type !== initialOAuthFields.grant_type;

    // Check if additional API credentials changed
    const apiCredentialsChanged = apiKeyCredentials !== initialApiCredentials;

    return oauthFieldsChanged || apiCredentialsChanged;
  };

  const getTemplateOAuth = () => {
    if (!selectedSystem) return null as any;
    return (systems[selectedSystem]?.oauth as any) || null;
  };

  const getResolvedOAuthFields = (): typeof oauthFields => {
    const templateOAuth = getTemplateOAuth();
    if (useSuperglueOAuth && templateOAuth) {
      return {
        ...oauthFields,
        client_id: templateOAuth.client_id || oauthFields.client_id,
        auth_url: templateOAuth.authUrl || oauthFields.auth_url,
        token_url: templateOAuth.tokenUrl || oauthFields.token_url,
        scopes: templateOAuth.scopes || oauthFields.scopes,
        grant_type: templateOAuth.grant_type || oauthFields.grant_type,
        oauth_cert: oauthFields.oauth_cert,
        oauth_key: oauthFields.oauth_key,
      };
    }
    return oauthFields;
  };

  const effectiveGrantType = oauthFields.grant_type || "authorization_code";
  const effectiveAccessToken =
    (system?.credentials as any)?.access_token || oauthFields.access_token;
  const effectiveRefreshToken =
    (system?.credentials as any)?.refresh_token || oauthFields.refresh_token;
  const isOAuthConfigured: boolean =
    effectiveGrantType === "client_credentials"
      ? Boolean(effectiveAccessToken)
      : Boolean(effectiveAccessToken && effectiveRefreshToken);

  const isConnectDisabled = () => {
    if (authType !== "oauth") return true;
    if (useSuperglueOAuth) return false;
    const resolvedFields = getResolvedOAuthFields();
    const isClientCreds = resolvedFields.grant_type === "client_credentials";
    if (isClientCreds) {
      const hasClientSecret = !!resolvedFields.client_secret;
      const hasCertAndKey = !!(resolvedFields.oauth_cert && resolvedFields.oauth_key);
      return !(
        resolvedFields.client_id &&
        (hasClientSecret || hasCertAndKey) &&
        resolvedFields.token_url
      );
    }
    return !(
      resolvedFields.client_id &&
      resolvedFields.client_secret &&
      resolvedFields.token_url &&
      resolvedFields.auth_url &&
      resolvedFields.scopes
    );
  };

  const handleConnect = async () => {
    if (authType !== "oauth") return;
    setConnectLoading(true);
    const resolvedFields = getResolvedOAuthFields();
    const errors: Record<string, boolean> = {};
    if (!useSuperglueOAuth) {
      const isClientCreds = resolvedFields.grant_type === "client_credentials";
      if (!resolvedFields.client_id) errors.client_id = true;
      if (!resolvedFields.token_url) errors.token_url = true;

      if (isClientCreds) {
        const hasClientSecret = !!resolvedFields.client_secret;
        const hasCertAndKey = !!(resolvedFields.oauth_cert && resolvedFields.oauth_key);
        if (!hasClientSecret && !hasCertAndKey) {
          errors.client_secret = true;
        }
      } else {
        if (!resolvedFields.client_secret) errors.client_secret = true;
        if (!resolvedFields.auth_url) errors.auth_url = true;
        if (!resolvedFields.scopes) errors.scopes = true;
      }

      setValidationErrors((prev) => ({ ...prev, ...errors }));
      if (Object.keys(errors).length > 0) {
        setConnectLoading(false);
        return;
      }
    }

    let creds: any = {};
    try {
      const additional = JSON.parse(apiKeyCredentials || "{}");
      creds = { ...resolvedFields, ...additional };
    } catch {
      creds = { ...resolvedFields };
    }

    const systemData = {
      id: isEditing ? system!.id : (id || "").trim(),
      urlHost: urlHost.trim(),
      urlPath: urlPath.trim(),
      documentationUrl: documentationUrl.trim(),
      documentation: documentation.trim(),
      specificInstructions: specificInstructions.trim(),
      credentials: creds,
    } as System;

    try {
      const templateInfo = useSuperglueOAuth
        ? {
            templateId: selectedSystem,
            clientId: resolvedFields.client_id,
          }
        : undefined;

      const handleOAuthError = (error: string) => {
        setConnectLoading(false);
        const errorHandler = createOAuthErrorHandler(systemData.id, toast);
        errorHandler(error);
      };

      const handleOAuthSuccess = (tokens: any) => {
        setConnectLoading(false);
        if (tokens) {
          setOauthFields((prev) => ({
            ...prev,
            access_token: tokens.access_token || prev.access_token,
            refresh_token: tokens.refresh_token || prev.refresh_token,
            token_type: tokens.token_type || prev.token_type,
            expires_at: tokens.expires_at || prev.expires_at,
          }));

          toast({
            title: "OAuth Connected",
            description: "Successfully authenticated",
          });
        }
      };

      triggerOAuthFlow(
        systemData.id,
        resolvedFields,
        tokenRegistry.getToken(),
        authType,
        handleOAuthError as (error: string) => void,
        true,
        templateInfo,
        handleOAuthSuccess,
        config.superglueEndpoint,
        undefined, // suppressErrorUI
        config.apiEndpoint,
      );
    } catch (error) {
      console.error("Error connecting OAuth:", error);
      setConnectLoading(false);
    }
  };

  const handleSubmit = async () => {
    const errors: Record<string, boolean> = {};
    if (!id.trim()) errors.id = true;
    if (!urlHost.trim()) errors.urlHost = true;
    if (specificInstructions.length > 10000) errors.specificInstructions = true;

    let creds = {};

    // Build credentials based on auth type
    if (authType === "oauth") {
      const resolvedFields = getResolvedOAuthFields();
      const { grant_type, ...fieldsWithoutGrantType } = resolvedFields as any;
      const oauthCredsRaw = Object.fromEntries(
        Object.entries({
          ...fieldsWithoutGrantType,
          grant_type,
          scopes: fieldsWithoutGrantType.scopes || systems[selectedSystem]?.oauth?.scopes || "",
        }).filter(([_, value]) => value !== ""),
      ) as Record<string, any>;

      let additionalCreds: Record<string, any> = {};
      try {
        additionalCreds = JSON.parse(apiKeyCredentials);
      } catch {}

      creds = { ...oauthCredsRaw, ...additionalCreds };
    } else if (authType === "apikey") {
      try {
        creds = JSON.parse(apiKeyCredentials);
      } catch {
        setValidationErrors((prev) => ({ ...prev, credentials: true }));
        return;
      }
    }

    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) return;

    // Create the system object
    const systemData = {
      id: isEditing ? system!.id : id.trim(),
      urlHost: urlHost.trim(),
      urlPath: urlPath.trim(),
      documentationUrl: documentationUrl.trim(),
      documentation: documentation.trim(),
      specificInstructions: specificInstructions.trim(),
      credentials: creds,
      // Only set templateName for real templates; "Custom API" uses the "manual" option which isn't a valid template key
      ...(selectedSystem && selectedSystem !== "manual" && { templateName: selectedSystem }),
    };

    try {
      // Save the system first and get the resolved system ID back from backend
      const savedSystem = await onSave(systemData);

      if (!savedSystem) {
        toast({
          title: "Error",
          description: "Failed to save system",
          variant: "destructive",
        });
        return;
      }
    } catch (error) {}
  };

  return (
    <Card
      className={cn(
        modal ? "border-0 shadow-none bg-background" : "mt-4 border-primary/50",
        "flex flex-col max-h-[calc(100vh-200px)]",
      )}
    >
      <CardHeader className={cn(modal ? "p-6 pb-0 border-0" : "py-3 px-4", "flex-shrink-0")}>
        <CardTitle className="text-lg">{system ? "Edit System" : "Add New System"}</CardTitle>
      </CardHeader>
      <CardContent
        className={cn(modal ? "p-6 space-y-3 border-0" : "p-4 space-y-3", "flex-1 overflow-y-auto")}
      >
        <div>
          <Label htmlFor="systemSelect">System Template</Label>
          <HelpTooltip text="Choose a pre-configured template to get started quickly, or select 'Custom API' to set up any API manually. Templates are optional but make setup easier." />
          <Popover open={systemDropdownOpen} onOpenChange={setSystemDropdownOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={systemDropdownOpen}
                className="w-full justify-between"
              >
                <div className="flex items-center gap-2">
                  {selectedSystem ? (
                    <>
                      {(() => {
                        const icon = getSimpleIcon(
                          systemOptions.find((opt) => opt.value === selectedSystem)?.icon || "",
                        );
                        return icon ? (
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill={`#${icon.hex}`}
                            className="flex-shrink-0"
                          >
                            <path d={icon.path} />
                          </svg>
                        ) : (
                          <Globe className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        );
                      })()}
                      <span>
                        {systemOptions.find((option) => option.value === selectedSystem)?.label}
                      </span>
                    </>
                  ) : (
                    <span>Select system...</span>
                  )}
                </div>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 pointer-events-auto z-[9999]">
              <Command className="w-full">
                <CommandInput placeholder="Search templates..." />
                <CommandEmpty>
                  <div className="text-center py-4">
                    <div className="text-sm text-muted-foreground mb-2">No template found</div>
                    <div className="text-xs text-muted-foreground">
                      Don't worry! You can still create this system using "Custom API"
                    </div>
                  </div>
                </CommandEmpty>
                <CommandGroup className="max-h-[300px] overflow-y-auto">
                  {systemOptions.map((option) => (
                    <CommandItem
                      key={option.value}
                      value={option.value}
                      onSelect={() => {
                        handleSystemSelect(option.value);
                        setSystemDropdownOpen(false);
                      }}
                      className="flex items-center py-2"
                    >
                      <div className="flex items-center gap-2 w-full">
                        <div className="w-6 flex justify-center">
                          {(() => {
                            const icon = getSimpleIcon(option.icon);
                            return icon ? (
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill={`#${icon.hex}`}
                                className="flex-shrink-0"
                              >
                                <path d={icon.path} />
                              </svg>
                            ) : (
                              <Globe className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                            );
                          })()}
                        </div>
                        <span className="flex-grow">{option.label}</span>
                        <Check
                          className={cn(
                            "h-4 w-4 flex-shrink-0",
                            selectedSystem === option.value ? "opacity-100" : "opacity-0",
                          )}
                        />
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        {!isEditing && (
          <div>
            <Label htmlFor="systemId">System ID*</Label>
            <HelpTooltip text="A unique identifier for this system. You cannot change this after saving." />
            <Input
              id="systemId"
              value={id || ""}
              onChange={(e) => {
                setId(e.target.value);
                setIsIdManuallyEdited(true);
              }}
              placeholder="e.g., crm-api"
              className={cn(validationErrors.id && inputErrorStyles)}
            />
            {validationErrors.id && (
              <p className="text-sm text-destructive mt-1">
                System ID is required and must be unique.
              </p>
            )}
          </div>
        )}
        <div>
          <Label htmlFor="systemFullUrl">API Endpoint*</Label>
          <HelpTooltip text="The base URL of the API (e.g., https://api.example.com/v1)." />
          <URLField
            ref={urlFieldRef}
            url={composeUrl(urlHost, urlPath) || ""}
            onUrlChange={handleUrlChange}
            error={validationErrors.urlHost}
          />
          {validationErrors.urlHost && (
            <p className="text-sm text-destructive mt-1">API Endpoint is required.</p>
          )}
        </div>
        <div>
          <Label htmlFor="documentation">Documentation</Label>
          <HelpTooltip text="You can either paste a documentation URL or upload a file. To add multiple pages, you can upload a zip file. You can add manual documentation to the instructions in the advanced options below." />
          <DocumentationField
            url={documentationUrl || ""}
            content={documentation || ""}
            onUrlChange={setDocumentationUrl}
            onContentChange={(content) => {
              setDocumentation(content);
            }}
            onFileUpload={handleFileUpload}
            onFileRemove={handleFileRemove}
            hasUploadedFile={hasUploadedFile}
          />
        </div>
        <div className="space-y-4">
          <div>
            <Label htmlFor="authType" className="flex items-center gap-2">
              Authentication Type
              <HelpTooltip text="Choose how to authenticate with this API. OAuth is recommended for supported services." />
            </Label>
            <Select
              key={authType}
              value={authType}
              onValueChange={(value: "apikey" | "oauth" | "none") => setAuthType(value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select authentication type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="apikey">API Key / Token / Basic Auth</SelectItem>
                <SelectItem value="oauth">OAuth 2.0</SelectItem>
                <SelectItem value="none">No Authentication</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {authType === "oauth" && (
            <>
              {!isOAuthConfigured && !useSuperglueOAuth && (
                <div className="inline-flex items-center gap-1 text-amber-800 dark:text-amber-300 text-xs bg-amber-500/10 px-2 py-1.5 rounded border border-amber-500/20">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-3.5 w-3.5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>
                    OAuth not configured. Add OAuth credentials and connect in OAuth setup below.
                  </span>
                </div>
              )}
              {(useSuperglueOAuth || isOAuthConfigured) && (
                <div className="pt-1">
                  <Button
                    type="button"
                    disabled={connectLoading}
                    onClick={handleConnect}
                    className="w-full h-11 justify-center text-base"
                  >
                    <span className="inline-flex items-center gap-2">
                      {(() => {
                        const icon = getSimpleIcon(
                          systemOptions.find((opt) => opt.value === selectedSystem)?.icon || "",
                        );
                        return icon ? (
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill={`#${icon.hex}`}
                            className="flex-shrink-0"
                          >
                            <path d={icon.path} />
                          </svg>
                        ) : (
                          <Globe className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        );
                      })()}
                      {isOAuthConfigured ? (
                        <>
                          <Check className="h-4 w-4 text-green-600" />
                          <span>Connected — Reauthenticate</span>
                        </>
                      ) : (
                        <span>
                          Connect to{" "}
                          {systemOptions.find((option) => option.value === selectedSystem)?.label ||
                            id ||
                            "system"}
                        </span>
                      )}
                    </span>
                  </Button>
                </div>
              )}
              <div>
                <button
                  type="button"
                  onClick={() => setShowOAuth(!showOAuth)}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ChevronRight
                    className={cn("h-4 w-4 transition-transform", showOAuth && "rotate-90")}
                  />
                  OAuth Setup
                </button>
              </div>
              {showOAuth && (
                <div className="space-y-4">
                  {(() => {
                    const template = systems[selectedSystem as keyof typeof systems];
                    const templateOAuth: any = template?.oauth || null;
                    const hasTemplateClient = !!(
                      templateOAuth?.client_id && String(templateOAuth.client_id).trim().length > 0
                    );
                    return hasTemplateClient ? (
                      <div className="flex items-center justify-between border rounded-md p-3">
                        <div className="text-sm">
                          <div className="font-medium">Use superglue OAuth client</div>
                          <div className="text-xs text-muted-foreground">
                            Preconfigured client for{" "}
                            {systemOptions.find((o) => o.value === selectedSystem)?.label}
                          </div>
                        </div>
                        <Switch
                          checked={useSuperglueOAuth}
                          onCheckedChange={(v) => setUseSuperglueOAuth(Boolean(v))}
                          className="custom-switch"
                        />
                      </div>
                    ) : null;
                  })()}

                  {!useSuperglueOAuth && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label htmlFor="client_id" className="text-xs flex items-center gap-1">
                            Client ID*
                            <HelpTooltip text="Found in your OAuth provider app settings." />
                          </Label>
                          <Input
                            id="client_id"
                            value={oauthFields.client_id}
                            onChange={(e) =>
                              setOauthFields((prev) => ({ ...prev, client_id: e.target.value }))
                            }
                            placeholder="Your OAuth app client ID"
                            className={cn("h-9", validationErrors.client_id && inputErrorStyles)}
                            autoComplete="off"
                          />
                        </div>
                        <div>
                          <Label
                            htmlFor="client_secret"
                            className="text-xs flex items-center gap-1"
                          >
                            Client Secret*
                            <HelpTooltip text="Secret from your OAuth provider app settings." />
                          </Label>
                          <div className="relative">
                            <Input
                              id="client_secret"
                              type={showClientSecret ? "text" : "password"}
                              value={oauthFields.client_secret}
                              onChange={(e) =>
                                setOauthFields((prev) => ({
                                  ...prev,
                                  client_secret: e.target.value,
                                }))
                              }
                              placeholder="Your OAuth app client secret"
                              className={cn(
                                "h-9 pr-9",
                                validationErrors.client_secret && inputErrorStyles,
                              )}
                              autoComplete="new-password"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-0 top-0 h-9 w-9 hover:bg-transparent"
                              onClick={() => setShowClientSecret(!showClientSecret)}
                            >
                              {showClientSecret ? (
                                <EyeOff className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <Eye className="h-4 w-4 text-muted-foreground" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="grant_type" className="text-xs flex items-center gap-1">
                          OAuth Grant Type
                          <HelpTooltip text="Authorization Code = user consent; Client Credentials = server-to-server." />
                        </Label>
                        <Select
                          value={oauthFields.grant_type}
                          onValueChange={(value: "authorization_code" | "client_credentials") =>
                            setOauthFields((prev) => ({ ...prev, grant_type: value }))
                          }
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Select grant type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="authorization_code">Authorization Code</SelectItem>
                            <SelectItem value="client_credentials">Client Credentials</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {oauthFields.grant_type === "authorization_code" && (
                        <div>
                          <Label htmlFor="scopes" className="text-xs">
                            OAuth Scopes*
                          </Label>
                          <HelpTooltip text="Space-separated scopes. Leave empty to use defaults." />
                          <Input
                            id="scopes"
                            value={oauthFields.scopes}
                            onChange={(e) =>
                              setOauthFields((prev) => ({ ...prev, scopes: e.target.value }))
                            }
                            placeholder="e.g., read write"
                            className={cn("h-9", validationErrors.scopes && inputErrorStyles)}
                          />
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label htmlFor="auth_url" className="text-xs">
                            Authorization URL
                            {oauthFields.grant_type === "authorization_code" ? "*" : ""}
                          </Label>
                          <HelpTooltip text="OAuth authorization endpoint." />
                          <Input
                            id="auth_url"
                            value={oauthFields.auth_url}
                            onChange={(e) =>
                              setOauthFields((prev) => ({ ...prev, auth_url: e.target.value }))
                            }
                            placeholder="OAuth authorization endpoint"
                            className={cn("h-9", validationErrors.auth_url && inputErrorStyles)}
                          />
                        </div>
                        <div>
                          <Label htmlFor="token_url" className="text-xs">
                            Token URL*
                          </Label>
                          <HelpTooltip text="OAuth token endpoint." />
                          <Input
                            id="token_url"
                            value={oauthFields.token_url}
                            onChange={(e) =>
                              setOauthFields((prev) => ({ ...prev, token_url: e.target.value }))
                            }
                            placeholder="OAuth token endpoint"
                            className={cn("h-9", validationErrors.token_url && inputErrorStyles)}
                          />
                        </div>
                      </div>

                      {oauthFields.grant_type === "client_credentials" && (
                        <div className="space-y-3">
                          <div>
                            <Label htmlFor="scopes-cc" className="text-xs flex items-center gap-1">
                              OAuth Scopes
                              <HelpTooltip text="Space-separated scopes (optional). Some providers require scopes for client credentials flow." />
                            </Label>
                            <Input
                              id="scopes-cc"
                              value={oauthFields.scopes}
                              onChange={(e) =>
                                setOauthFields((prev) => ({ ...prev, scopes: e.target.value }))
                              }
                              placeholder="e.g., read write"
                              className="h-9"
                            />
                          </div>
                          <div className="flex justify-evenly">
                            <div className="flex flex-col items-center">
                              <Label className="text-xs flex items-center gap-1 mb-2">
                                Client Certificate
                                <HelpTooltip text="Required for mTLS/mutual TLS authentication (e.g., ABN AMRO). Upload .crt, .pem, or .cer file." />
                              </Label>
                              {oauthFields.oauth_cert ? (
                                <FileChip
                                  file={{
                                    name: certFileName || "Certificate",
                                    key: "oauth_cert",
                                    size: 0,
                                    status: "ready",
                                  }}
                                  onRemove={handleRemoveCert}
                                  size="large"
                                  rounded="sm"
                                  showOriginalName={true}
                                  showSize={false}
                                />
                              ) : (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    document.getElementById("cert-file-upload")?.click()
                                  }
                                >
                                  <Upload className="h-4 w-4 mr-2" />
                                  Upload
                                </Button>
                              )}
                              <input
                                type="file"
                                id="cert-file-upload"
                                hidden
                                accept=".crt,.pem,.cer"
                                onChange={handleCertFileUpload}
                              />
                            </div>
                            <div className="flex flex-col items-center">
                              <Label className="text-xs flex items-center gap-1 mb-2">
                                Private Key
                                <HelpTooltip text="Required for mTLS/mutual TLS authentication. Upload .key or .pem file." />
                              </Label>
                              {oauthFields.oauth_key ? (
                                <FileChip
                                  file={{
                                    name: keyFileName || "Private Key",
                                    key: "oauth_key",
                                    size: 0,
                                    status: "ready",
                                  }}
                                  onRemove={handleRemoveKey}
                                  size="large"
                                  rounded="sm"
                                  showOriginalName={true}
                                  showSize={false}
                                />
                              ) : (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    document.getElementById("key-file-upload")?.click()
                                  }
                                >
                                  <Upload className="h-4 w-4 mr-2" />
                                  Upload
                                </Button>
                              )}
                              <input
                                type="file"
                                id="key-file-upload"
                                hidden
                                accept=".key,.pem"
                                onChange={handleKeyFileUpload}
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {oauthFields.grant_type === "authorization_code" && (
                        <div className="border-t pt-3">
                          <Label className="text-xs flex items-center gap-1">
                            Redirect URI
                            <HelpTooltip text="Add this URL to your OAuth app allowed redirect URIs." />
                          </Label>
                          <div className="flex items-center gap-2 mt-1 mb-2">
                            <code className="text-xs bg-background px-2 py-1 rounded flex-1 overflow-x-auto">
                              {getOAuthCallbackUrl()}
                            </code>
                            <CopyButton text={getOAuthCallbackUrl()} />
                          </div>
                        </div>
                      )}

                      <div className="text-xs text-muted-foreground">
                        {oauthFields.grant_type === "client_credentials" ? (
                          <span>
                            Required: client ID, token URL, and either client secret OR (certificate
                            + key).
                          </span>
                        ) : (
                          <span>
                            Required: client ID, client secret, token URL, auth URL, scopes.
                          </span>
                        )}
                      </div>
                    </>
                  )}

                  {!useSuperglueOAuth && !isOAuthConfigured && (
                    <div className="pt-1">
                      <Button
                        type="button"
                        disabled={isConnectDisabled() || connectLoading}
                        onClick={handleConnect}
                        className="w-full h-11 justify-center text-base"
                      >
                        <span className="inline-flex items-center gap-2">
                          {isOAuthConfigured ? (
                            <>
                              <Check className="h-4 w-4 text-green-600" />
                              <span>Connected — Reauthenticate</span>
                            </>
                          ) : (
                            <>
                              Connect to{" "}
                              {systemOptions.find((option) => option.value === selectedSystem)
                                ?.label ||
                                id ||
                                "system"}
                              {(() => {
                                const icon = getSimpleIcon(
                                  systemOptions.find((opt) => opt.value === selectedSystem)?.icon ||
                                    "",
                                );
                                return icon ? (
                                  <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill={`#${icon.hex}`}
                                    className="flex-shrink-0"
                                  >
                                    <path d={icon.path} />
                                  </svg>
                                ) : (
                                  <Globe className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                                );
                              })()}
                            </>
                          )}
                        </span>
                      </Button>
                    </div>
                  )}

                  {isOAuthConfigured &&
                    oauthFields.expires_at &&
                    (() => {
                      const expiryDate = new Date(oauthFields.expires_at);
                      const expiryTime = expiryDate.getTime();
                      const now = Date.now();
                      const isExpired = expiryTime < now;

                      if (!isExpired) return null;

                      const dateStr = expiryDate.toLocaleDateString();
                      const timeStr = expiryDate.toLocaleTimeString();

                      return (
                        <div className="pt-2 text-xs text-muted-foreground">
                          OAuth access token expired: {dateStr} {timeStr}. Execute a tool with this
                          system to refresh automatically.
                        </div>
                      );
                    })()}
                </div>
              )}
            </>
          )}

          {authType === "apikey" && (
            <div className="space-y-2">
              <Label htmlFor="credentials" className="flex items-center gap-2">
                API Credentials
                <HelpTooltip text="Add API keys or tokens needed for this system. You can add multiple key-value pairs. Common keys include: api_key, bearer_token, api_secret, username, password." />
              </Label>
              <div className="w-full">
                <CredentialsManager
                  value={apiKeyCredentials}
                  onChange={setApiKeyCredentials}
                  className={cn("min-h-20", validationErrors.credentials && inputErrorStyles)}
                />
              </div>
              {validationErrors.credentials && (
                <p className="text-sm text-destructive">Credentials must be valid JSON.</p>
              )}
            </div>
          )}

          {authType === "none" && (
            <div className="bg-muted/50">
              <p className="text-sm text-muted-foreground">
                The API endpoint should be publicly accessible or credentials should be provided at
                request time.
              </p>
            </div>
          )}
        </div>
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight
              className={cn("h-4 w-4 transition-transform", showAdvanced && "rotate-90")}
            />
            Advanced Options
          </button>
        </div>
        {showAdvanced && (
          <>
            {authType === "oauth" && (
              <div className="space-y-3">
                <div>
                  <Label
                    htmlFor="additionalCredentials"
                    className="flex items-center gap-2 text-xs"
                  >
                    Additional API Credentials
                    <HelpTooltip text="Some APIs require additional credentials alongside OAuth. Common examples: developer_token (Google Ads), account_id, workspace_id. Add any extra key-value pairs needed." />
                  </Label>
                  <div className="w-full">
                    <CredentialsManager
                      value={apiKeyCredentials}
                      onChange={setApiKeyCredentials}
                      className={cn("min-h-20", validationErrors.credentials && inputErrorStyles)}
                    />
                  </div>
                  {validationErrors.credentials && (
                    <p className="text-sm text-destructive">Credentials must be valid JSON.</p>
                  )}
                </div>
              </div>
            )}

            <div>
              <Label htmlFor="specificInstructions">Specific Instructions</Label>
              <HelpTooltip text="Provide specific guidance on how to use this system (e.g., rate limits, special endpoints, authentication details). Max 2000 characters." />
              <div className="relative">
                <Textarea
                  id="specificInstructions"
                  value={specificInstructions}
                  onChange={(e) => setSpecificInstructions(e.target.value)}
                  placeholder="e.g. always use pagination with max 50 items per page"
                  className={cn(
                    "min-h-[100px] pr-16",
                    validationErrors.specificInstructions && inputErrorStyles,
                  )}
                  maxLength={10000}
                />
                <div className="absolute bottom-2 right-2 text-xs text-muted-foreground">
                  {specificInstructions.length}/10000
                </div>
              </div>
              {validationErrors.specificInstructions && (
                <p className="text-sm text-destructive mt-1">
                  Specific instructions must be 10000 characters or less.
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
      <CardFooter className={cn(modal ? "p-6 pt-0 border-0" : "p-4 pt-2", "flex-shrink-0")}>
        <div className="flex justify-end gap-2 w-full">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>{system ? "Save Changes" : "Add System"}</Button>
        </div>
      </CardFooter>
    </Card>
  );
}

export default SystemForm;
