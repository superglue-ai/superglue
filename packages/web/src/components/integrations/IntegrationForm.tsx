import { useConfig } from '@/src/app/config-context';
import { detectAuthType } from '@/src/app/integrations/page';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/src/components/ui/command';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/src/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { Textarea } from '@/src/components/ui/textarea';
import { CredentialsManager } from '@/src/components/utils/CredentialManager';
import { DocumentationField } from '@/src/components/utils/DocumentationField';
import { HelpTooltip } from '@/src/components/utils/HelpTooltip';
import { URLField } from '@/src/components/utils/URLField';
import { useToast } from '@/src/hooks/use-toast';
import { cn, composeUrl, inputErrorStyles } from '@/src/lib/utils';
import type { Integration } from '@superglue/client';

import { getOAuthConfig, integrations } from '@superglue/shared';
import { Check, ChevronRight, ChevronsUpDown, Copy, Globe, Link } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export interface IntegrationFormProps {
    integration?: Integration;
    onSave: (integration: Integration) => Promise<Integration | null>;
    onCancel: () => void;
    integrationOptions: { value: string; label: string; icon: string }[];
    getSimpleIcon: (name: string) => any;
    modal?: boolean;
}

function sanitizeIntegrationId(id: string) {
    // Remove protocol if present
    let cleanId = id.replace(/^.*:\/\//, '');

    // Take everything before the first slash
    const slashIndex = cleanId.indexOf('/');
    if (slashIndex !== -1) {
        cleanId = cleanId.substring(0, slashIndex);
    }

    // Clean up and return
    return cleanId
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')  // Replace non-alphanumeric with hyphens
        .replace(/-+/g, '-')          // Replace multiple hyphens with single
        .replace(/^-|-$/g, '');       // Remove leading/trailing hyphens
}

export function IntegrationForm({
    integration,
    onSave,
    onCancel,
    integrationOptions,
    getSimpleIcon,
    modal = false,
}: IntegrationFormProps) {
    const initialSelected = integration
        ? integrationOptions.find(opt =>
            opt.value !== 'manual' &&
            (integration.id === opt.value || (integration.urlHost && integration.urlHost.includes(opt.value)))
        )?.value || 'manual'
        : 'manual';
    const [selectedIntegration, setSelectedIntegration] = useState<string>(initialSelected);
    const [integrationDropdownOpen, setIntegrationDropdownOpen] = useState(false);
    const [id, setId] = useState(integration?.id || initialSelected);
    const [urlHost, setUrlHost] = useState(integration?.urlHost || '');
    const [urlPath, setUrlPath] = useState(integration?.urlPath || '');
    const [documentationUrl, setDocumentationUrl] = useState(integration?.documentationUrl || '');
    const [documentation, setDocumentation] = useState(integration?.documentation || '');
    const [specificInstructions, setSpecificInstructions] = useState(integration?.specificInstructions || '');

    // Add state to track if user manually edited the ID
    const [isIdManuallyEdited, setIsIdManuallyEdited] = useState(false);

    // Initialize auth type
    const initialAuthType = !integration ? 'apikey' : detectAuthType(integration.credentials || {});
    const [authType, setAuthType] = useState<'none' | 'oauth' | 'apikey'>(initialAuthType);

    // Initialize OAuth fields
    const [oauthFields, setOauthFields] = useState(() => {
        const creds = integration?.credentials || {};
        return {
            client_id: creds.client_id || '',
            client_secret: creds.client_secret || '',
            auth_url: creds.auth_url || '',
            token_url: creds.token_url || '',
            access_token: creds.access_token || '',
            refresh_token: creds.refresh_token || '',
            scopes: creds.scopes || '',
            expires_at: creds.expires_at || '',
            token_type: creds.token_type || 'Bearer'
        };
    });

    // Initialize API key credentials as JSON string for CredentialsManager
    const [apiKeyCredentials, setApiKeyCredentials] = useState(() => {
        const creds = integration?.credentials || {};
        // For OAuth integrations, only include non-OAuth fields in the additional credentials
        if (initialAuthType === 'oauth' && integration) {
            const { client_id, client_secret, auth_url, token_url, access_token, refresh_token, scopes, expires_at, ...additionalCreds } = creds;
            return Object.keys(additionalCreds).length > 0 ? JSON.stringify(additionalCreds, null, 2) : '{}';
        }
        return Object.keys(creds).length > 0 ? JSON.stringify(creds, null, 2) : '{}';
    });

    const [validationErrors, setValidationErrors] = useState<Record<string, boolean>>({});
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [hasUploadedFile, setHasUploadedFile] = useState(
        // Check if existing integration has file upload
        integration?.documentationUrl?.startsWith('file://') || false
    );

    const urlFieldRef = useRef<any>(null);
    const isEditing = !!integration;
    const config = useConfig();
    const { toast } = useToast();


    // Pre-fill OAuth URLs when auth type changes to OAuth
    useEffect(() => {
        if (authType === 'oauth' && selectedIntegration && selectedIntegration !== 'manual') {
            const integrationTemplate = integrations[selectedIntegration];
            if (integrationTemplate?.oauth) {
                setOauthFields(prev => ({
                    ...prev,
                    auth_url: prev.auth_url || integrationTemplate.oauth!.authUrl,
                    token_url: prev.token_url || integrationTemplate.oauth!.tokenUrl,
                    scopes: prev.scopes || integrationTemplate.oauth!.scopes || ''
                }));
            }
        }
    }, [authType, selectedIntegration]);

    // Function to handle file upload
    const handleFileUpload = (extractedText: string) => {
        setDocumentation(extractedText);
        setHasUploadedFile(true);
    };

    // Function to handle file removal
    const handleFileRemove = () => {
        setDocumentation('');
        setHasUploadedFile(false);
    };

    const handleIntegrationSelect = (value: string) => {
        setSelectedIntegration(value);

        if (value === 'manual') {
            setUrlHost('');
            setUrlPath('');
            setDocumentationUrl('');
            setDocumentation('');
            setSpecificInstructions('');
            // Set custom as ID if not editing
            if (!isEditing) {
                setId('new-integration');
            }
            return;
        }

        // Use integrations from shared package
        const integrationTemplate = integrations[value];

        if (integrationTemplate) {
            const apiUrl = integrationTemplate.apiUrl || '';
            let urlHost = '';
            let urlPath = '';
            try {
                const url = new URL(apiUrl);
                urlHost = url.origin;
                urlPath = url.pathname;
            } catch {
                urlHost = apiUrl;
                urlPath = '';
            }
            setUrlHost(urlHost);
            setUrlPath(urlPath);
            // Only set documentation URL if no file is uploaded
            if (!hasUploadedFile) {
                setDocumentationUrl(integrationTemplate.docsUrl || '');
                setDocumentation('');
            }
            setSpecificInstructions('');
            // Always set ID to dropdown value for new integrations
            if (!isEditing) {
                setId(value);
            }

            if (integrationTemplate.preferredAuthType) {
                setAuthType(integrationTemplate.preferredAuthType);
            }

            // Pre-fill OAuth URLs if OAuth is available and selected
            if (integrationTemplate.oauth) {
                // Only pre-fill OAuth URLs if user has OAuth selected
                if (integrationTemplate.preferredAuthType === 'oauth') {
                    setOauthFields(prev => ({
                        ...prev,
                        auth_url: integrationTemplate.oauth!.authUrl || prev.auth_url,
                        token_url: integrationTemplate.oauth!.tokenUrl || prev.token_url,
                        scopes: integrationTemplate.oauth!.scopes || prev.scopes || ''
                    }));
                }
            }
        }
    };

    const handleUrlChange = (host: string, path: string) => {
        setUrlHost(host);
        setUrlPath(path);

        // Auto-update ID when URL changes (only for new integrations and if not manually edited)
        if (!isEditing && !isIdManuallyEdited) {
            const fullUrl = composeUrl(host, path);
            if (fullUrl) {
                const sanitizedId = sanitizeIntegrationId(fullUrl);
                if (sanitizedId) {
                    setId(sanitizedId);
                }
            }
        }
    };

    const handleSubmit = async () => {
        const errors: Record<string, boolean> = {};
        if (!id.trim()) errors.id = true;
        if (!urlHost.trim()) errors.urlHost = true;
        if (specificInstructions.length > 2000) errors.specificInstructions = true;

        let creds = {};

        // Build credentials based on auth type
        if (authType === 'oauth') {
            // Validate OAuth required fields
            if (!oauthFields.client_id) errors.client_id = true;
            if (!oauthFields.client_secret) errors.client_secret = true;

            // Start with OAuth fields
            const oauthCreds = Object.fromEntries(
                Object.entries({
                    ...oauthFields,
                    scopes: oauthFields.scopes || integrations[selectedIntegration]?.oauth?.scopes || ''
                }).filter(([_, value]) => value !== '')
            );

            // Parse and merge additional credentials if provided
            let additionalCreds = {};
            try {
                additionalCreds = JSON.parse(apiKeyCredentials);
            } catch {
                // If parsing fails, just use OAuth credentials
            }

            // Merge OAuth and additional credentials
            creds = { ...oauthCreds, ...additionalCreds };
        } else if (authType === 'apikey') {
            try {
                creds = JSON.parse(apiKeyCredentials);
            } catch {
                setValidationErrors(prev => ({ ...prev, credentials: true }));
                return;
            }
        }

        setValidationErrors(errors);
        if (Object.keys(errors).length > 0) return;

        // Create the integration object
        const integrationData = {
            id: isEditing ? integration!.id : id.trim(),
            urlHost: urlHost.trim(),
            urlPath: urlPath.trim(),
            documentationUrl: documentationUrl.trim(),
            documentation: documentation.trim(),
            specificInstructions: specificInstructions.trim(),
            credentials: creds,
        };

        try {
            // Save the integration first and get the resolved integration ID back from backend
            const savedIntegration = await onSave(integrationData);

            if (!savedIntegration) {
                toast({
                    title: 'Error',
                    description: 'Failed to save integration',
                    variant: 'destructive',
                });
                return;
            }

            // If OAuth and not already configured, trigger OAuth flow using the resolved integration ID
            if (authType === 'oauth' && (!oauthFields.access_token || !oauthFields.refresh_token)) {
                const authUrl = buildOAuthUrlForIntegration(savedIntegration.id);
                if (authUrl) {
                    const width = 600;
                    const height = 700;
                    const left = (window.screen.width - width) / 2;
                    const top = (window.screen.height - height) / 2;

                    const popup = window.open(
                        authUrl,
                        'oauth_popup',
                        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
                    );
                }
            }
        } catch (error) {
            // Error handling is done in the parent component
            console.error('Error in form submission:', error);
        }
    };

    // Generate OAuth callback URL
    const getOAuthCallbackUrl = () => {
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
        return `${baseUrl}/api/auth/callback`; // No more integration ID needed
    };



    // Helper to copy text to clipboard
    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            toast({
                title: 'Copied',
                description: 'Callback URL copied to clipboard',
            });
        } catch (err) {
            toast({
                title: 'Failed to copy',
                description: 'Please copy the URL manually',
                variant: 'destructive',
            });
        }
    };

    // Helper to build OAuth authorization URL
    const buildOAuthUrlForIntegration = (integrationId: string) => {
        try {
            const { client_id, scopes } = oauthFields;

            if (!client_id) return null;

            const redirectUri = getOAuthCallbackUrl();

            // Get auth URL from OAuth fields or known providers
            let authUrl = oauthFields.auth_url;
            let defaultScopes = '';

            if (!authUrl) {
                const oauthConfig = getOAuthConfig(integrationId) || getOAuthConfig(selectedIntegration);
                authUrl = oauthConfig?.authUrl;
                defaultScopes = oauthConfig?.scopes || '';
            }

            if (!authUrl) return null;

            const params = new URLSearchParams({
                client_id,
                redirect_uri: redirectUri,
                response_type: 'code',
                state: btoa(JSON.stringify({
                    integrationId,
                    timestamp: Date.now(),
                    apiKey: config.superglueApiKey,
                    redirectUri,
                })),
            });

            // Use explicitly set scopes or fall back to defaults
            const finalScopes = scopes || defaultScopes;
            if (finalScopes) {
                params.append('scope', finalScopes);
            }

            // Add Google-specific parameters if it's a Google service
            if (authUrl.includes('google.com')) {
                params.append('access_type', 'offline');
                params.append('prompt', 'consent');
            }

            return `${authUrl}?${params.toString()}`;
        } catch {
            return null;
        }
    };

    // Legacy function that uses the form's current ID (for backward compatibility)
    const buildOAuthUrl = () => {
        const integrationId = isEditing ? integration!.id : id.trim();
        return buildOAuthUrlForIntegration(integrationId);
    };

    return (
        <Card className={cn(
            modal ? "border-0 shadow-none bg-background" : "mt-4 border-primary/50",
            "flex flex-col max-h-[calc(100vh-200px)]"
        )}>
            <CardHeader className={cn(
                modal ? "p-6 pb-0 border-0" : "py-3 px-4",
                "flex-shrink-0"
            )}>
                <CardTitle className="text-lg">{integration ? 'Edit Integration' : 'Add New Integration'}</CardTitle>
            </CardHeader>
            <CardContent className={cn(
                modal ? "p-6 space-y-3 border-0" : "p-4 space-y-3",
                "flex-1 overflow-y-auto"
            )}>
                <div>
                    <Label htmlFor="integrationSelect">From Template</Label>
                    <HelpTooltip text="Select from known integrations or choose No Template for any other API." />
                    <Popover open={integrationDropdownOpen} onOpenChange={setIntegrationDropdownOpen}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={integrationDropdownOpen}
                                className="w-full justify-between"
                            >
                                <div className="flex items-center gap-2">
                                    {selectedIntegration ? (
                                        <>
                                            {(() => {
                                                const icon = getSimpleIcon(
                                                    integrationOptions.find(opt => opt.value === selectedIntegration)?.icon || ''
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
                                                {integrationOptions.find(option => option.value === selectedIntegration)?.label}
                                            </span>
                                        </>
                                    ) : (
                                        <span>Select integration...</span>
                                    )}
                                </div>
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 pointer-events-auto z-[9999]">
                            <Command className="w-full">
                                <CommandInput placeholder="Search integrations..." />
                                <CommandEmpty>No integration found.</CommandEmpty>
                                <CommandGroup className="max-h-[300px] overflow-y-auto">
                                    {integrationOptions.map((option) => (
                                        <CommandItem
                                            key={option.value}
                                            value={option.value}
                                            onSelect={() => {
                                                handleIntegrationSelect(option.value);
                                                setIntegrationDropdownOpen(false);
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
                                                        'h-4 w-4 flex-shrink-0',
                                                        selectedIntegration === option.value ? 'opacity-100' : 'opacity-0'
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
                <div>
                    <Label htmlFor="integrationFullUrl">API Endpoint*</Label>
                    <HelpTooltip text="The base URL of the API (e.g., https://api.example.com/v1)." />
                    <URLField
                        ref={urlFieldRef}
                        url={composeUrl(urlHost, urlPath) || ''}
                        onUrlChange={handleUrlChange}
                        error={validationErrors.urlHost}
                    />
                    {validationErrors.urlHost && <p className="text-sm text-destructive mt-1">API Endpoint is required.</p>}
                </div>
                <div>
                    <Label htmlFor="documentation">Documentation</Label>
                    <HelpTooltip text="You can either paste a documentation URL or upload a file. To add multiple pages, you can upload a zip file. You can add manual documentation to the instructions in the advanced options below." />
                    <DocumentationField
                        url={documentationUrl || ''}
                        content={documentation || ''}
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
                            <HelpTooltip
                                text="Choose how to authenticate with this API. OAuth is recommended for supported services."
                            />
                        </Label>
                        <Select
                            key={authType}
                            value={authType}
                            onValueChange={(value: 'apikey' | 'oauth' | 'none') => setAuthType(value)}
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

                    {authType === 'oauth' && (
                        <div className="">
                            <div className="text-sm font-medium mb-2 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    OAuth Configuration
                                    {oauthFields.access_token && oauthFields.refresh_token && (
                                        <>
                                            <Check className="h-4 w-4 text-green-600" />
                                            <span className="text-green-600 text-xs font-normal">Successfully configured</span>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label htmlFor="client_id" className="text-xs flex items-center gap-1">
                                        Client ID*
                                        <HelpTooltip text="The unique identifier for your OAuth app. Find this in your OAuth provider's app settings (e.g., Google Cloud Console, GitHub App Settings)." />
                                    </Label>
                                    <Input
                                        id="client_id"
                                        value={oauthFields.client_id}
                                        onChange={e => setOauthFields(prev => ({ ...prev, client_id: e.target.value }))}
                                        placeholder="Your OAuth app client ID"
                                        className={cn("h-9", validationErrors.client_id && inputErrorStyles)}
                                        autoComplete="off"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="client_secret" className="text-xs flex items-center gap-1">
                                        Client Secret*
                                        <HelpTooltip text="The secret key for your OAuth app. Keep this confidential! Find this in your OAuth provider's app settings alongside the Client ID." />
                                    </Label>
                                    <Input
                                        id="client_secret"
                                        type="password"
                                        value={oauthFields.client_secret}
                                        onChange={e => setOauthFields(prev => ({ ...prev, client_secret: e.target.value }))}
                                        placeholder="Your OAuth app client secret"
                                        className={cn("h-9", validationErrors.client_secret && inputErrorStyles)}
                                        autoComplete="new-password"
                                    />
                                </div>
                            </div>

                            <div className="border-t pt-3">
                                <Label className="text-xs flex items-center gap-1">
                                    Redirect URI
                                    <HelpTooltip text="Copy this URL and add it to your OAuth app's allowed redirect URIs. This is where users will be sent after authorizing your app." />
                                </Label>
                                <div className="flex items-center gap-2 mt-1 mb-2">
                                    <code className="text-xs bg-background px-2 py-1 rounded flex-1 overflow-x-auto">
                                        {getOAuthCallbackUrl()}
                                    </code>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => copyToClipboard(getOAuthCallbackUrl())}
                                    >
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>


                        </div>
                    )}

                    {authType === 'apikey' && (
                        <div className="space-y-2">
                            <Label htmlFor="credentials" className="flex items-center gap-2">
                                API Credentials
                                <HelpTooltip text="Add API keys or tokens needed for this integration. You can add multiple key-value pairs. Common keys include: api_key, bearer_token, api_secret, username, password." />
                            </Label>
                            <div className="w-full">
                                <CredentialsManager
                                    value={apiKeyCredentials}
                                    onChange={setApiKeyCredentials}
                                    className={cn('min-h-20', validationErrors.credentials && inputErrorStyles)}
                                />
                            </div>
                            {validationErrors.credentials && <p className="text-sm text-destructive">Credentials must be valid JSON.</p>}
                        </div>
                    )}

                    {authType === 'none' && (
                        <div className="bg-muted/50">
                            <p className="text-sm text-muted-foreground">
                                The API endpoint should be publicly accessible or credentials should be provided at request time.
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
                            className={cn(
                                "h-4 w-4 transition-transform",
                                showAdvanced && "rotate-90"
                            )}
                        />
                        Advanced Options
                    </button>
                </div>
                {showAdvanced && (
                    <>
                        {!isEditing && (
                            <div>
                                <Label htmlFor="integrationId">Custom Integration ID*</Label>
                                <HelpTooltip text="A unique identifier for this integration within the workflow (e.g., 'crm', 'productApi')." />
                                <Input
                                    id="integrationId"
                                    value={id || ''}
                                    onChange={e => {
                                        setId(e.target.value);
                                        setIsIdManuallyEdited(true);
                                    }}
                                    placeholder="e.g., crm-api"
                                    className={cn(validationErrors.id && inputErrorStyles)}
                                />
                                {validationErrors.id && <p className="text-sm text-destructive mt-1">Integration ID is required and must be unique.</p>}
                            </div>
                        )}

                        {/* OAuth Advanced Settings */}
                        {authType === 'oauth' && (
                            <>
                                <div>
                                    <Label htmlFor="scopes" className="text-xs">OAuth Scopes</Label>
                                    <HelpTooltip text="Permissions requested from the OAuth provider. Format varies by provider: Google uses URLs (https://www.googleapis.com/auth/...), others use simple strings (read write). Leave empty to use defaults." />
                                    <Input
                                        id="scopes"
                                        value={oauthFields.scopes}
                                        onChange={e => setOauthFields(prev => ({ ...prev, scopes: e.target.value }))}
                                        placeholder="Space-separated scopes (e.g., read write)"
                                        className="h-9"
                                    />
                                    {!oauthFields.scopes && integrations[selectedIntegration]?.oauth?.scopes && (
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Default: {integrations[selectedIntegration]?.oauth?.scopes}
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <Label htmlFor="auth_url" className="text-xs">Authorization URL</Label>
                                    <HelpTooltip text="OAuth authorization endpoint. Leave empty to use the default for this provider." />
                                    <div className="relative">
                                        <Input
                                            id="auth_url"
                                            value={oauthFields.auth_url}
                                            onChange={e => setOauthFields(prev => ({ ...prev, auth_url: e.target.value }))}
                                            placeholder="OAuth authorization endpoint"
                                            className="h-9 pr-20"
                                        />
                                        <Badge
                                            variant="outline"
                                            className="absolute right-2 top-1/2 -translate-y-1/2 bg-background border"
                                        >
                                            <Link className="h-3 w-3 mr-1" />
                                            URL
                                        </Badge>
                                    </div>
                                    {!oauthFields.auth_url && integrations[selectedIntegration]?.oauth?.authUrl && (
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Default: {integrations[selectedIntegration]?.oauth?.authUrl}
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <Label htmlFor="token_url" className="text-xs">Token URL</Label>
                                    <HelpTooltip text="OAuth token endpoint. Leave empty to use the default for this provider." />
                                    <div className="relative">
                                        <Input
                                            id="token_url"
                                            value={oauthFields.token_url}
                                            onChange={e => setOauthFields(prev => ({ ...prev, token_url: e.target.value }))}
                                            placeholder="OAuth token endpoint"
                                            className="h-9 pr-20"
                                        />
                                        <Badge
                                            variant="outline"
                                            className="absolute right-2 top-1/2 -translate-y-1/2 bg-background border"
                                        >
                                            <Link className="h-3 w-3 mr-1" />
                                            URL
                                        </Badge>
                                    </div>
                                    {!oauthFields.token_url && integrations[selectedIntegration]?.oauth?.tokenUrl && (
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Default: {integrations[selectedIntegration]?.oauth?.tokenUrl}
                                        </p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="additionalCredentials" className="flex items-center gap-2 text-xs">
                                        Additional API Credentials
                                        <HelpTooltip text="Some APIs require additional credentials alongside OAuth. Common examples: developer_token (Google Ads), account_id, workspace_id. Add any extra key-value pairs needed." />
                                    </Label>
                                    <div className="w-full">
                                        <CredentialsManager
                                            value={apiKeyCredentials}
                                            onChange={setApiKeyCredentials}
                                            className={cn('min-h-20', validationErrors.credentials && inputErrorStyles)}
                                        />
                                    </div>
                                    {validationErrors.credentials && <p className="text-sm text-destructive">Credentials must be valid JSON.</p>}
                                </div>
                            </>
                        )}

                        <div>
                            <Label htmlFor="specificInstructions">Specific Instructions</Label>
                            <HelpTooltip text="Provide specific guidance on how to use this integration (e.g., rate limits, special endpoints, authentication details). Max 2000 characters." />
                            <div className="relative">
                                <Textarea
                                    id="specificInstructions"
                                    value={specificInstructions}
                                    onChange={e => setSpecificInstructions(e.target.value)}
                                    placeholder="e.g. always use pagination with max 50 items per page"
                                    className={cn(
                                        'min-h-[100px] pr-16',
                                        validationErrors.specificInstructions && inputErrorStyles
                                    )}
                                    maxLength={2000}
                                />
                                <div className="absolute bottom-2 right-2 text-xs text-muted-foreground">
                                    {specificInstructions.length}/2000
                                </div>
                            </div>
                            {validationErrors.specificInstructions && (
                                <p className="text-sm text-destructive mt-1">
                                    Specific instructions must be 2000 characters or less.
                                </p>
                            )}
                        </div>
                    </>
                )}
            </CardContent>
            <CardFooter className={cn(
                modal ? "p-6 pt-0 border-0" : "p-4 pt-2",
                "flex-shrink-0"
            )}>
                <div className="flex justify-end gap-2 w-full">
                    <Button variant="outline" onClick={onCancel}>Cancel</Button>
                    <Button onClick={handleSubmit}>
                        {integration ? 'Save Changes' : 'Add Integration'}
                    </Button>
                </div>
            </CardFooter>
        </Card>
    );
}

export default IntegrationForm; 