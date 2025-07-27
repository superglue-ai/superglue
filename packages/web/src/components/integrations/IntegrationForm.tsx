import { useConfig } from '@/src/app/config-context';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
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
import { cn, composeUrl } from '@/src/lib/utils';
import type { Integration } from '@superglue/client';
import { SuperglueClient } from '@superglue/client';
import { getOAuthConfig, integrations } from '@superglue/shared';
import { Check, ChevronRight, ChevronsUpDown, Copy, Globe, Key } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

export interface IntegrationFormProps {
    integration?: Integration;
    onSave: (integration: Integration) => void | Promise<void>;
    onCancel: () => void;
    integrationOptions: { value: string; label: string; icon: string }[];
    getSimpleIcon: (name: string) => any;
    inputErrorStyles: string;
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
    inputErrorStyles,
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
    
    const detectAuthType = (creds: any) => {
        if(!integration) return 'apikey';
        if (!creds || Object.keys(creds).length === 0) return 'none'; // Changed from 'none' to 'apikey'
        if (creds.client_id || creds.client_secret || creds.access_token || creds.refresh_token) return 'oauth';
        return 'apikey';
    };
    
    const [authType, setAuthType] = useState<'none' | 'oauth' | 'apikey'>(() => {
        try {
            const creds = integration?.credentials || {};
            return detectAuthType(creds);
        } catch {
            return 'apikey'; // Changed from 'none' to 'apikey'
        }
    });
    
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
            expires_at: creds.expires_at || ''
        };
    });
    
    // Initialize API key credentials as JSON string for CredentialsManager
    const [apiKeyCredentials, setApiKeyCredentials] = useState(() => {
        const creds = integration?.credentials || {};
        return JSON.stringify(creds, null, 2);
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

    const client = useMemo(() => new SuperglueClient({
        endpoint: config.superglueEndpoint,
        apiKey: config.superglueApiKey,
    }), [config.superglueEndpoint, config.superglueApiKey]);

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
        setValidationErrors(errors);
        if (Object.keys(errors).length > 0) return;
        
        let creds = {};
        
        // Build credentials based on auth type
        if (authType === 'oauth') {
            creds = Object.fromEntries(
                Object.entries({
                    ...oauthFields,
                    scopes: oauthFields.scopes || integrations[selectedIntegration]?.oauth?.scopes || ''
                }).filter(([_, value]) => value !== '')
            );
        } else if (authType === 'apikey') {
            try {
                creds = JSON.parse(apiKeyCredentials);
            } catch {
                setValidationErrors(prev => ({ ...prev, credentials: true }));
                return;
            }
        }
        
        setValidationErrors({});

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
        onSave(integrationData);
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
    const buildOAuthUrl = () => {
        try {
            const { client_id, scopes } = oauthFields;
            
            if (!client_id) return null;

            const integrationId = isEditing ? integration!.id : id.trim();
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
                    integrationId,  // This is the key part
                    timestamp: Date.now(),
                    apiKey: config.superglueApiKey 
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

    return (
        <Card className={modal ? "border-0 shadow-none bg-background" : "mt-4 border-primary/50"}>
            <CardHeader className={modal ? "p-6 pb-0 border-0" : "py-3 px-4"}>
                <CardTitle className="text-lg">{integration ? 'Edit Integration' : 'Add New Integration'}</CardTitle>
            </CardHeader>
            <CardContent className={modal ? "p-6 space-y-3 border-0" : "p-4 space-y-3"}>
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
                    <HelpTooltip text="You can either paste a documentation URL or upload a file. You can add manual documentation to the instructions in the advanced options below." />
                    <DocumentationField
                        url={documentationUrl || ''}
                        content={documentation || ''}
                        onUrlChange={setDocumentationUrl}
                        onContentChange={setDocumentation}
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
                                        className="h-9"
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
                                        className="h-9"
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
                            
                            {oauthFields.client_id && oauthFields.client_secret && (buildOAuthUrl() !== null) && (
                                <Button
                                    type="button"
                                    variant={oauthFields.access_token && oauthFields.refresh_token ? "outline" : "default"}
                                    size="sm"
                                    className="w-full"
                                    onClick={async () => {
                                        // First save/upsert the integration
                                        const errors: Record<string, boolean> = {};
                                        if (!id.trim()) errors.id = true;
                                        if (!urlHost.trim()) errors.urlHost = true;
                                        if (specificInstructions.length > 2000) errors.specificInstructions = true;
                                        
                                        if (Object.keys(errors).length > 0) {
                                            setValidationErrors(errors);
                                            toast({
                                                title: 'Validation Error',
                                                description: 'Please fill in all required fields before connecting OAuth',
                                                variant: 'destructive',
                                            });
                                            return;
                                        }
                                        
                                        // Build credentials
                                        const creds = Object.fromEntries(
                                            Object.entries({
                                                ...oauthFields,
                                                scopes: oauthFields.scopes || integrations[selectedIntegration]?.oauth?.scopes || ''
                                            }).filter(([_, value]) => value !== '')
                                        );
                                        
                                        // Create integration data
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
                                            // Save the integration first
                                            await client.upsertIntegration(integrationData.id, integrationData);
                                            
                                            // Then open OAuth URL
                                            const authUrl = buildOAuthUrl();
                                            if (authUrl) {
                                                window.open(authUrl, '_blank');
                                            }
                                        } catch (error) {
                                            toast({
                                                title: 'Error',
                                                description: 'Failed to save integration before OAuth connection',
                                                variant: 'destructive',
                                            });
                                        }
                                    }}
                                >
                                    <Key className="h-4 w-4 mr-2" />
                                    {oauthFields.access_token && oauthFields.refresh_token ? 'Reconnect with OAuth' : 'Connect with OAuth'}
                                </Button>
                            )}
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
                                    <Input
                                        id="auth_url"
                                        value={oauthFields.auth_url}
                                        onChange={e => setOauthFields(prev => ({ ...prev, auth_url: e.target.value }))}
                                        placeholder="OAuth authorization endpoint"
                                        className="h-9"
                                    />
                                    {!oauthFields.auth_url && integrations[selectedIntegration]?.oauth?.authUrl && (
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Default: {integrations[selectedIntegration]?.oauth?.authUrl}
                                        </p>
                                    )}
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
                <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={onCancel}>Cancel</Button>
                    <Button onClick={handleSubmit}>
                        {integration ? 'Save Changes' : 'Add Integration'}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

export default IntegrationForm; 