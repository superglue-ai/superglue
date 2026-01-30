"use client";

import { useConfig } from "@/src/app/config-context";
import { Button } from "@/src/components/ui/button";
import { FileChip } from "@/src/components/ui/FileChip";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { OAuthConnectButton } from "@/src/components/ui/oauth-connect-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Switch } from "@/src/components/ui/switch";
import { CredentialsManager } from "@/src/components/utils/CredentialManager";
import { HelpTooltip } from "@/src/components/utils/HelpTooltip";
import { useToast } from "@/src/hooks/use-toast";
import { cn } from "@/src/lib/general-utils";
import { getOAuthCallbackUrl, triggerOAuthFlow } from "@/src/lib/oauth-utils";
import { tokenRegistry } from "@/src/lib/token-registry";
import { systemOptions, findTemplateForSystem, resolveOAuthCertAndKey } from "@superglue/shared";
import { ChevronRight, Eye, EyeOff, Upload } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { CopyButton } from "@/src/components/tools/shared/CopyButton";
import { useSystemConfig } from "../context";

export function AuthenticationSection() {
  const config = useConfig();
  const { toast } = useToast();
  const { system, auth, setAuthType, setApiKeyCredentials, setOAuthFields, setUseSuperglueOAuth } =
    useSystemConfig();

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [connectLoading, setConnectLoading] = useState(false);
  const [certFileName, setCertFileName] = useState("");
  const [keyFileName, setKeyFileName] = useState("");

  useEffect(() => {
    if (auth.oauthFields.oauth_cert && auth.oauthFields.oauth_key) {
      const { cert, key } = resolveOAuthCertAndKey(
        auth.oauthFields.oauth_cert,
        auth.oauthFields.oauth_key,
      );
      setCertFileName(cert?.filename || "Certificate loaded");
      setKeyFileName(key?.filename || "Private key loaded");
    }
  }, [auth.oauthFields.oauth_cert, auth.oauthFields.oauth_key]);

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
        setOAuthFields({ [field]: fileData });
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
      setOAuthFields({ [field]: "" });
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

  const getTemplateOAuth = useCallback(() => {
    const match = findTemplateForSystem(system);
    return (match?.template.oauth as any) || null;
  }, [system.id, system.name, system.templateName, system.urlHost, system.urlPath]);

  const getResolvedOAuthFields = useCallback(() => {
    const templateOAuth = getTemplateOAuth();
    if (auth.useSuperglueOAuth && templateOAuth) {
      return {
        ...auth.oauthFields,
        client_id: templateOAuth.client_id || auth.oauthFields.client_id,
        auth_url: templateOAuth.authUrl || auth.oauthFields.auth_url,
        token_url: templateOAuth.tokenUrl || auth.oauthFields.token_url,
        scopes: templateOAuth.scopes || auth.oauthFields.scopes,
        grant_type: templateOAuth.grant_type || auth.oauthFields.grant_type,
      };
    }
    return auth.oauthFields;
  }, [auth.oauthFields, auth.useSuperglueOAuth, getTemplateOAuth]);

  const isConnectDisabled = useCallback(() => {
    if (auth.authType !== "oauth") return true;
    if (auth.useSuperglueOAuth) {
      const templateOAuth = getTemplateOAuth();
      return !templateOAuth?.client_id;
    }
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
  }, [auth.authType, auth.useSuperglueOAuth, getResolvedOAuthFields, getTemplateOAuth]);

  const handleConnect = async () => {
    if (auth.authType !== "oauth") return;
    setConnectLoading(true);
    const resolvedFields = getResolvedOAuthFields();

    const templateInfo = auth.useSuperglueOAuth
      ? {
          templateId: system.templateName,
          clientId: resolvedFields.client_id,
        }
      : undefined;

    const handleOAuthError = (error: string) => {
      setConnectLoading(false);
      toast({
        title: "OAuth Error",
        description: error,
        variant: "destructive",
      });
    };

    const handleOAuthSuccess = (tokens: any) => {
      setConnectLoading(false);
      if (tokens) {
        setOAuthFields({
          access_token: tokens.access_token || auth.oauthFields.access_token,
          refresh_token: tokens.refresh_token || auth.oauthFields.refresh_token,
          token_type: tokens.token_type || auth.oauthFields.token_type,
          expires_at: tokens.expires_at || auth.oauthFields.expires_at,
        });

        toast({
          title: "OAuth Connected",
          description: "Successfully authenticated",
        });
      }
    };

    triggerOAuthFlow(
      system.id,
      resolvedFields,
      tokenRegistry.getToken(),
      auth.authType,
      handleOAuthError,
      true,
      templateInfo,
      handleOAuthSuccess,
      config.superglueEndpoint,
      undefined,
      config.apiEndpoint,
    );
  };

  const templateOAuth = getTemplateOAuth();
  const hasTemplateClient = !!(
    templateOAuth?.client_id && String(templateOAuth.client_id).trim().length > 0
  );

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="authType" className="text-sm font-medium">
            Authentication Type
          </Label>
          <HelpTooltip text="Choose how to authenticate with this API. OAuth is recommended for supported services." />
        </div>
        <Select
          value={auth.authType}
          onValueChange={(value: "apikey" | "oauth" | "none") => setAuthType(value)}
        >
          <SelectTrigger className="w-full h-10 bg-background/50 border-border/60 focus:border-primary/50 transition-colors">
            <SelectValue placeholder="Select authentication type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="apikey">API Key / Token / Basic Auth</SelectItem>
            <SelectItem value="oauth">OAuth 2.0</SelectItem>
            <SelectItem value="none">No Authentication</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {auth.authType === "apikey" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="credentials" className="text-sm font-medium">
              API Credentials
            </Label>
            <HelpTooltip text="Add API keys or tokens needed for this system. Common keys include: api_key, bearer_token, api_secret." />
          </div>
          <div className="rounded-xl border border-border/60 bg-background/30 p-4">
            <CredentialsManager
              value={auth.apiKeyCredentials}
              onChange={setApiKeyCredentials}
              className="min-h-20"
            />
          </div>
        </div>
      )}

      {auth.authType === "oauth" && (
        <div className="space-y-5">
          <OAuthConnectButton
            system={system}
            onClick={handleConnect}
            disabled={isConnectDisabled()}
            loading={connectLoading}
          />

          {hasTemplateClient && (
            <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-muted/60 to-muted/30 p-4 border border-border/50">
              <div>
                <div className="font-medium text-sm">Use superglue OAuth</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Preconfigured client for{" "}
                  {systemOptions.find((o) => o.value === system.templateName)?.label}
                </div>
              </div>
              <Switch
                checked={auth.useSuperglueOAuth}
                onCheckedChange={(v) => setUseSuperglueOAuth(Boolean(v))}
              />
            </div>
          )}

          {!auth.useSuperglueOAuth && auth.oauthFields.grant_type === "authorization_code" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Redirect URI</Label>
                <span className="text-[10px] px-2.5 py-1 rounded-full bg-muted/60 text-muted-foreground border border-border/40">
                  Must be registered with OAuth provider
                </span>
              </div>
              <div className="flex items-center gap-2">
                <code className="text-xs bg-muted/60 px-3 py-2 rounded-lg flex-1 overflow-x-auto font-mono border border-border/40">
                  {getOAuthCallbackUrl()}
                </code>
                <CopyButton text={getOAuthCallbackUrl()} />
              </div>
            </div>
          )}

          {!auth.useSuperglueOAuth && (
            <div className="space-y-4 rounded-xl border border-border/50 bg-gradient-to-b from-card/80 to-card/40 p-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="client_id" className="text-xs font-medium">
                    Client ID
                  </Label>
                  <Input
                    id="client_id"
                    value={auth.oauthFields.client_id}
                    onChange={(e) => setOAuthFields({ client_id: e.target.value })}
                    placeholder="Your OAuth app client ID"
                    className="h-9 bg-background/50 border-border/60"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="client_secret" className="text-xs font-medium">
                    Client Secret
                  </Label>
                  <div className="relative">
                    <Input
                      id="client_secret"
                      type={showClientSecret ? "text" : "password"}
                      value={auth.oauthFields.client_secret}
                      onChange={(e) => setOAuthFields({ client_secret: e.target.value })}
                      placeholder="Your OAuth app client secret"
                      className="h-9 pr-9 bg-background/50 border-border/60"
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

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="grant_type" className="text-xs font-medium">
                    Grant Type
                  </Label>
                  <Select
                    value={auth.oauthFields.grant_type}
                    onValueChange={(value: "authorization_code" | "client_credentials") =>
                      setOAuthFields({ grant_type: value })
                    }
                  >
                    <SelectTrigger className="h-9 bg-background/50 border-border/60">
                      <SelectValue placeholder="Select grant type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="authorization_code">Authorization Code</SelectItem>
                      <SelectItem value="client_credentials">Client Credentials</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="scopes" className="text-xs font-medium">
                    Scopes
                  </Label>
                  <Input
                    id="scopes"
                    value={auth.oauthFields.scopes}
                    onChange={(e) => setOAuthFields({ scopes: e.target.value })}
                    placeholder="e.g., read write"
                    className="h-9 bg-background/50 border-border/60"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="auth_url" className="text-xs font-medium">
                    Authorization URL
                  </Label>
                  <Input
                    id="auth_url"
                    value={auth.oauthFields.auth_url}
                    onChange={(e) => setOAuthFields({ auth_url: e.target.value })}
                    placeholder="OAuth authorization endpoint"
                    className="h-9 bg-background/50 border-border/60"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="token_url" className="text-xs font-medium">
                    Token URL
                  </Label>
                  <Input
                    id="token_url"
                    value={auth.oauthFields.token_url}
                    onChange={(e) => setOAuthFields({ token_url: e.target.value })}
                    placeholder="OAuth token endpoint"
                    className="h-9 bg-background/50 border-border/60"
                  />
                </div>
              </div>

              {auth.oauthFields.grant_type === "client_credentials" && (
                <div className="flex justify-evenly pt-3 border-t border-border/30">
                  <div className="flex flex-col items-center">
                    <Label className="text-xs font-medium mb-2">Client Certificate</Label>
                    {auth.oauthFields.oauth_cert ? (
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
                        onClick={() => document.getElementById("cert-file-upload")?.click()}
                        className="bg-background/50"
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
                    <Label className="text-xs font-medium mb-2">Private Key</Label>
                    {auth.oauthFields.oauth_key ? (
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
                        onClick={() => document.getElementById("key-file-upload")?.click()}
                        className="bg-background/50"
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
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight
              className={cn("h-3.5 w-3.5 transition-transform", showAdvanced && "rotate-90")}
            />
            Additional API Credentials
          </button>

          {showAdvanced && (
            <div className="rounded-xl border border-border/50 bg-gradient-to-b from-card/80 to-card/40 p-4">
              <p className="text-xs text-muted-foreground mb-3">
                Some APIs require additional credentials alongside OAuth (e.g., developer_token,
                account_id).
              </p>
              <CredentialsManager
                value={auth.apiKeyCredentials}
                onChange={setApiKeyCredentials}
                className="min-h-16"
              />
            </div>
          )}
        </div>
      )}

      {auth.authType === "none" && (
        <div className="rounded-xl bg-gradient-to-r from-muted/50 to-muted/30 p-4 border border-border/40">
          <p className="text-sm text-muted-foreground">
            The API endpoint should be publicly accessible or credentials should be provided at
            request time.
          </p>
        </div>
      )}
    </div>
  );
}
