import { useConfig } from '@/src/app/config-context';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/src/components/ui/command';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/src/components/ui/popover';
import { Textarea } from '@/src/components/ui/textarea';
import { CredentialsManager } from '@/src/components/utils/CredentialManager';
import { DocumentationField } from '@/src/components/utils/DocumentationField';
import { HelpTooltip } from '@/src/components/utils/HelpTooltip';
import { URLField } from '@/src/components/utils/URLField';
import { useToast } from '@/src/hooks/use-toast';
import { cn, composeUrl } from '@/src/lib/utils';
import type { Integration } from '@superglue/client';
import { SuperglueClient } from '@superglue/client';
import { Check, ChevronRight, ChevronsUpDown, Globe } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

export interface IntegrationFormProps {
    integration?: Integration;
    onSave: (integration: Integration) => void;
    onCancel: () => void;
    integrationOptions: { value: string; label: string; icon: string }[];
    getSimpleIcon: (name: string) => any;
    inputErrorStyles: string;
    modal?: boolean;
}

function sanitizeIntegrationId(id: string) {
    return id
        .replace('www.', '')
        .replace('api.', '')
        .replace('http://', '')
        .replace('https://', '')
        .replace(/\./g, '-')
        .replace(/ /g, '-')
        .replace(/[^a-zA-Z0-9-]/g, '');
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
            opt.value !== 'custom' &&
            (integration.id === opt.value || (integration.urlHost && integration.urlHost.includes(opt.value)))
        )?.value || 'custom'
        : 'custom';
    const [selectedIntegration, setSelectedIntegration] = useState<string>(initialSelected);
    const [integrationDropdownOpen, setIntegrationDropdownOpen] = useState(false);
    const [id, setId] = useState(integration?.id || initialSelected);
    const [urlHost, setUrlHost] = useState(integration?.urlHost || '');
    const [urlPath, setUrlPath] = useState(integration?.urlPath || '');
    const [documentationUrl, setDocumentationUrl] = useState(integration?.documentationUrl || '');
    const [documentation, setDocumentation] = useState(integration?.documentation || '');
    const [specificInstructions, setSpecificInstructions] = useState(integration?.specificInstructions || '');
    const [credentials, setCredentials] = useState(
        integration?.credentials ? JSON.stringify(integration.credentials, null, 2) : '{}'
    );
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

        if (value === 'custom') {
            setUrlHost('');
            setUrlPath('');
            setDocumentationUrl('');
            setDocumentation('');
            setSpecificInstructions('');
            // Set custom as ID if not editing
            if (!isEditing) {
                setId('custom');
            }
            return;
        }

        // @ts-ignore
        const integrationTemplate = require('@/src/lib/integrations').integrations[value];
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
            setDocumentationUrl(integrationTemplate.docsUrl || '');
            setDocumentation('');
            setSpecificInstructions('');
            // Always set ID to dropdown value for new integrations
            if (!isEditing) {
                setId(value);
            }
        }
    };

    const handleUrlChange = (host: string, path: string) => {
        setUrlHost(host);
        setUrlPath(path);
    };

    const handleSubmit = async () => {
        const errors: Record<string, boolean> = {};
        if (!id.trim()) errors.id = true;
        if (!urlHost.trim()) errors.urlHost = true;
        if (specificInstructions.length > 2000) errors.specificInstructions = true;
        setValidationErrors(errors);
        if (Object.keys(errors).length > 0) return;
        let creds = {};
        try {
            creds = JSON.parse(credentials);
        } catch {
            setValidationErrors(prev => ({ ...prev, credentials: true }));
            return;
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

    return (
        <Card className={modal ? "border-0 shadow-none bg-background" : "mt-4 border-primary/50"}>
            <CardHeader className={modal ? "p-6 pb-0 border-0" : "py-3 px-4"}>
                <CardTitle className="text-lg">{integration ? 'Edit Integration' : 'Add New Integration'}</CardTitle>
            </CardHeader>
            <CardContent className={modal ? "p-6 space-y-3 border-0" : "p-4 space-y-3"}>
                <div>
                    <Label htmlFor="integrationSelect">Integration Type</Label>
                    <HelpTooltip text="Select from known integrations or choose custom for any other API." />
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
                <div>
                    <div>
                        <Label htmlFor="credentials">Credentials</Label>
                        <HelpTooltip text='API keys or tokens needed for this specific integration. Enter without any prefix like Bearer.' />
                        <div className="w-full max-w-full">
                            <CredentialsManager
                                value={credentials}
                                onChange={setCredentials}
                                className={cn('min-h-20 font-mono text-xs', validationErrors.credentials && inputErrorStyles)}
                            />
                        </div>
                        {validationErrors.credentials && <p className="text-sm text-destructive mt-1">Credentials must be valid JSON.</p>}
                    </div>
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
                                    onChange={e => setId(e.target.value)}
                                    placeholder="e.g., crm-api"
                                    className={cn(validationErrors.id && inputErrorStyles)}
                                />
                                {validationErrors.id && <p className="text-sm text-destructive mt-1">Integration ID is required and must be unique.</p>}
                            </div>
                        )}
                        <div>
                            <Label htmlFor="specificInstructions">Instructions</Label>
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