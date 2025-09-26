"use client";
import { useConfig } from '@/src/app/config-context';
import { useIntegrations } from '@/src/app/integrations-context';
import { IntegrationForm } from '@/src/components/integrations/IntegrationForm';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/src/components/ui/alert-dialog";
import { Button } from '@/src/components/ui/button';
import { DocStatus } from '@/src/components/utils/DocStatusSpinner';
import { useToast } from '@/src/hooks/use-toast';
import { needsUIToTriggerDocFetch } from '@/src/lib/client-utils';
import { createOAuthErrorHandler, triggerOAuthFlow } from '@/src/lib/oauth-utils';
import { composeUrl, getIntegrationIcon as getIntegrationIconName } from '@/src/lib/utils';
import type { Integration } from '@superglue/client';
import { SuperglueClient, UpsertMode } from '@superglue/client';
import { integrationOptions } from '@superglue/shared';
import { waitForIntegrationProcessing } from '@superglue/shared/utils';
import { Clock, FileDown, Globe, Key, Pencil, Plus, RotateCw, Sparkles, Trash2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { SimpleIcon } from 'simple-icons';
import * as simpleIcons from 'simple-icons';

// Single source of truth for auth type detection
export const detectAuthType = (credentials: any): 'oauth' | 'apikey' | 'none' => {
    if (!credentials || Object.keys(credentials).length === 0) return 'none';

    // Define OAuth-specific fields
    const oauthSpecificFields = ['client_id', 'client_secret', 'auth_url', 'token_url', 'access_token', 'refresh_token', 'scopes', 'expires_at', 'token_type', 'grant_type'];

    // Get all credential keys
    const allKeys = Object.keys(credentials);

    // Check if any OAuth-specific fields are present
    const hasOAuthFields = allKeys.some(key => oauthSpecificFields.includes(key));

    if (hasOAuthFields) {
        // It's OAuth-related, now check the status
        const grantType = credentials.grant_type || 'authorization_code';

        if (grantType === 'client_credentials') {
            // For client credentials, only access_token is needed
            if (credentials.access_token) {
                return 'oauth'; // Will be shown as configured
            } else if (credentials.client_id || credentials.client_secret) {
                return 'oauth'; // Will be shown as pending
            } else {
                return 'none'; // Only has meta fields like token_url, scopes, etc.
            }
        } else {
            // Authorization code flow - needs both access_token and refresh_token
            if (credentials.access_token && credentials.refresh_token) {
                return 'oauth'; // Will be shown as configured
            } else if (credentials.client_id || credentials.client_secret) {
                return 'oauth'; // Will be shown as pending
            } else {
                return 'none'; // Only has meta fields like auth_url, scopes, etc.
            }
        }
    }

    // No OAuth fields present, so it's API key
    return 'apikey';
};

// Helper to determine auth badge status
export const getAuthBadge = (integration: Integration): {
    type: 'oauth-configured' | 'oauth-incomplete' | 'apikey' | 'none',
    label: string,
    color: 'blue' | 'amber' | 'green',
    icon: 'key' | 'clock'
} => {
    const creds = integration.credentials || {};
    const authType = detectAuthType(creds);

    if (authType === 'none') {
        return { type: 'none', label: 'No auth', color: 'amber', icon: 'key' };
    }

    if (authType === 'oauth') {
        const grantType = creds.grant_type || 'authorization_code';

        let isConfigured = false;
        if (grantType === 'client_credentials') {
            // For client credentials, only access_token is needed
            isConfigured = !!creds.access_token;
        } else {
            // For authorization code, both access_token AND refresh_token are needed
            isConfigured = !!(creds.access_token && creds.refresh_token);
        }

        return isConfigured
            ? { type: 'oauth-configured', label: 'OAuth configured', color: 'blue', icon: 'key' }
            : { type: 'oauth-incomplete', label: 'OAuth incomplete', color: 'amber', icon: 'clock' };
    }

    // Must be API key
    return { type: 'apikey', label: 'API Key', color: 'green', icon: 'key' };
};

export default function IntegrationsPage() {
    const config = useConfig();
    const { toast } = useToast();
    const searchParams = useSearchParams();
    const router = useRouter();
    const { integrations, pendingDocIds, loading: initialLoading, refreshIntegrations, setPendingDocIds } = useIntegrations();

    const client = useMemo(() => new SuperglueClient({
        endpoint: config.superglueEndpoint,
        apiKey: config.superglueApiKey,
    }), [config.superglueEndpoint, config.superglueApiKey]);

    // Handle OAuth callback messages from URL params
    useEffect(() => {
        const success = searchParams.get('success');
        const error = searchParams.get('error');
        const integration = searchParams.get('integration');
        const message = searchParams.get('message');
        const description = searchParams.get('description');

        if (success === 'oauth_completed' && integration) {
            toast({
                title: 'OAuth Connection Successful',
                description: `Successfully connected to ${integration}`,
            });
            // Clear the URL params
            window.history.replaceState({}, '', '/integrations');
            // Refresh integrations to show updated OAuth status
            refreshIntegrations();
        } else if (error) {
            const errorMessage = description || message || 'Failed to complete OAuth connection';
            const handleOAuthError = createOAuthErrorHandler(integration || 'unknown', toast);
            handleOAuthError(errorMessage);

            // Clear the URL params
            window.history.replaceState({}, '', '/integrations');
        }
    }, [searchParams, toast, refreshIntegrations]);

    const { waitForIntegrationReady } = useMemo(() => ({
        waitForIntegrationReady: (integrationIds: string[]) => {
            // Create adapter for SuperglueClient to work with shared utility
            const clientAdapter = {
                getIntegration: (id: string) => client.getIntegration(id)
            };
            return waitForIntegrationProcessing(clientAdapter, integrationIds);
        }
    }), [client]);

    const [editingIntegration, setEditingIntegration] = useState<Integration | null>(null);

    // Handle OAuth callback messages from popup windows
    useEffect(() => {
        const handleMessage = async (event: MessageEvent) => {
            // Verify origin matches
            if (event.origin !== window.location.origin) return;

            if (event.data.type === 'oauth-success') {
                const integrationId = event.data.integrationId;
                const tokens = event.data.tokens;

                // Wait a moment for the backend to finish updating
                await new Promise(resolve => setTimeout(resolve, 1000));

                // Refresh integrations and get the updated list
                await refreshIntegrations();

                // We need to fetch the integration directly since the state might not be updated yet
                try {
                    const updatedIntegration = await client.getIntegration(integrationId);
                    const grantType = updatedIntegration?.credentials?.grant_type || 'authorization_code';

                    let hasValidTokens = false;
                    if (grantType === 'client_credentials') {
                        // For client credentials, only access_token is needed
                        hasValidTokens = !!updatedIntegration?.credentials?.access_token;
                    } else {
                        // For authorization code, both access_token and refresh_token are needed
                        hasValidTokens = !!(updatedIntegration?.credentials?.access_token && updatedIntegration?.credentials?.refresh_token);
                    }

                    if (hasValidTokens) {
                        toast({
                            title: 'OAuth Connection Successful',
                            description: `Successfully connected to ${integrationId}`,
                        });


                        if (editingIntegration?.id === integrationId) {
                            const currentCreds = JSON.stringify(editingIntegration.credentials || {});
                            const newCreds = JSON.stringify(updatedIntegration.credentials || {});
                            if (currentCreds !== newCreds) {
                                setEditingIntegration(updatedIntegration);
                            }
                        }
                    } else {
                        toast({
                            title: 'OAuth Connection Failed',
                            description: 'OAuth flow completed but tokens were not saved. Please try again.',
                            variant: 'destructive',
                        });
                    }
                } catch (error) {
                    toast({
                        title: 'OAuth Connection Failed',
                        description: 'Failed to verify OAuth connection. Please refresh the page.',
                        variant: 'destructive',
                    });
                }
            } else if (event.data.type === 'oauth-error') {
                const errorMessage = event.data.message || 'Failed to complete OAuth connection';
                const handleOAuthError = createOAuthErrorHandler(event.data.integrationId || 'unknown', toast);
                handleOAuthError(errorMessage);
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [client, refreshIntegrations, toast, editingIntegration]);

    const getSimpleIcon = (name: string): SimpleIcon | null => {
        if (!name || name === "default") return null;
        const formatted = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
        const iconKey = `si${formatted}`;
        try {
            // @ts-ignore
            let icon = simpleIcons[iconKey];
            return icon || null;
        } catch (e) {
            return null;
        }
    };

    const [addFormOpen, setAddFormOpen] = useState(false);

    const [page, setPage] = useState(0);
    const PAGE_SIZE = 10;
    const paginatedIntegrations = integrations?.sort((a, b) => a.id.localeCompare(b.id)).slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) || [];
    const totalPages = Math.ceil(integrations.length / PAGE_SIZE);

    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [integrationToDelete, setIntegrationToDelete] = useState<Integration | null>(null);

    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleDelete = async (id: string) => {
        try {
            // Optimistically remove from UI
            await client.deleteIntegration(id);
            // Refresh to ensure consistency
            await refreshIntegrations();
        } catch (error) {
            console.error('Error deleting integration:', error);
            toast({
                title: 'Error',
                description: 'Failed to delete integration',
                variant: 'destructive',
            });
        }
    };

    const handleEdit = async (integration: Integration) => {
        setEditingIntegration(integration);
        setAddFormOpen(true);
    };
    const handleAdd = () => {
        setEditingIntegration(null);
        setAddFormOpen(true);
    };

    const handleCompleteOAuth = (integration: Integration) => {
        const grantType = integration.credentials?.grant_type || 'authorization_code';

        if (grantType === 'client_credentials') {
            // For client credentials, the OAuth flow is handled automatically by the backend
            // when the integration is saved. We just need to trigger a refresh by updating
            // one of the OAuth fields to force the backend to re-run the OAuth flow
            toast({
                title: 'OAuth Processing',
                description: 'Client credentials OAuth flow is being processed in the background. The integration will be updated automatically.',
            });
            // Save the integration to trigger the backend OAuth flow
            handleSave(integration);
        } else {
            // For authorization code flow, use the existing popup logic
            const oauthFields = {
                access_token: integration.credentials?.access_token,
                refresh_token: integration.credentials?.refresh_token,
                client_id: integration.credentials?.client_id,
                client_secret: integration.credentials?.client_secret,
                scopes: integration.credentials?.scopes,
                auth_url: integration.credentials?.auth_url,
                token_url: integration.credentials?.token_url,
                grant_type: grantType,
            };

            // Determine auth type dynamically (defensive programming)
            const authType = detectAuthType(integration.credentials || {});

            // Enhanced error handling using centralized utility
            const handleOAuthError = createOAuthErrorHandler(integration.id, toast);

            // Trigger OAuth flow with error handling
            const cleanup = triggerOAuthFlow(
                integration.id,
                oauthFields,
                integration.id, // Use integration ID as selectedIntegration
                config.superglueApiKey,
                authType,
                handleOAuthError,
                true // Force OAuth
            );

            if (cleanup) {
            }
        }
    };

    const cleanIntegrationForInput = (integration: Integration) => {
        return {
            id: integration.id,
            urlHost: integration.urlHost,
            urlPath: integration.urlPath,
            documentationUrl: integration.documentationUrl,
            documentation: integration.documentation,
            specificInstructions: integration.specificInstructions,
            credentials: integration.credentials,
            // Include documentationPending if it exists (for refresh docs functionality)
            ...(integration.documentationPending !== undefined && { documentationPending: integration.documentationPending }),
        };
    };

    const handleSave = async (integration: Integration, isOAuthConnect?: boolean): Promise<Integration | null> => {
        try {
            if (integration.id) {
                // Determine mode based on whether integration exists, not edit mode
                const existingIntegration = integrations.find(i => i.id === integration.id);
                const mode = existingIntegration ? UpsertMode.UPDATE : UpsertMode.CREATE;
                const cleanedIntegration = cleanIntegrationForInput(integration);
                const savedIntegration = await client.upsertIntegration(integration.id, cleanedIntegration, mode);
                const willTriggerDocFetch = needsUIToTriggerDocFetch(savedIntegration, existingIntegration);

                if (willTriggerDocFetch) {
                    setPendingDocIds(prev => new Set([...prev, savedIntegration.id]));

                    // Fire-and-forget poller for background doc fetch
                    waitForIntegrationReady([savedIntegration.id]).then(() => {
                        // Remove from pending when done
                        setPendingDocIds(prev => new Set([...prev].filter(id => id !== savedIntegration.id)));
                    }).catch((error) => {
                        console.error('Error waiting for docs:', error);
                        // Remove from pending on error
                        setPendingDocIds(prev => new Set([...prev].filter(id => id !== savedIntegration.id)));
                    });
                }


                if (isOAuthConnect) {
                    const currentCreds = JSON.stringify(editingIntegration?.credentials || {});
                    const newCreds = JSON.stringify(savedIntegration.credentials || {});
                    if (currentCreds !== newCreds) {
                        setEditingIntegration(savedIntegration);
                    }
                } else {
                    setEditingIntegration(null);
                    setAddFormOpen(false);
                }

                await refreshIntegrations();

                return savedIntegration; // Return the saved integration with correct ID
            }
            return null;
        } catch (error) {
            console.error('Error saving integration:', error);
            toast({
                title: 'Error',
                description: 'Failed to save integration',
                variant: 'destructive',
            });
            throw error; // Re-throw so the form can handle the error
        }
    };

    // Function to refresh documentation for a specific integration
    const handleRefreshDocs = async (integrationId: string) => {
        // Get current integration
        const integration = integrations.find(i => i.id === integrationId);
        if (!integration) return;
        // Set pending state immediately
        setPendingDocIds(prev => new Set([...prev, integrationId]));

        try {
            // Use documentationPending flag to trigger backend refresh
            const upsertData = cleanIntegrationForInput({
                ...integration,
                documentationPending: true // Trigger refresh
            });

            await client.upsertIntegration(integrationId, upsertData, UpsertMode.UPDATE);

            // Use proper polling to wait for docs to be ready
            const results = await waitForIntegrationReady([integrationId]);

            if (results.length > 0 && results[0]?.documentation) {
                // Success - docs are ready
                setPendingDocIds(prev => new Set([...prev].filter(id => id !== integrationId)));

                toast({
                    title: 'Documentation Ready',
                    description: `Documentation for integration "${integrationId}" is now ready!`,
                    variant: 'default',
                });
            } else {
                // Polling failed - reset documentationPending to false
                await client.upsertIntegration(integrationId, {
                    ...upsertData,
                    documentationPending: false
                }, UpsertMode.UPDATE);

                setPendingDocIds(prev => new Set([...prev].filter(id => id !== integrationId)));
            }

        } catch (error) {
            console.error('Error refreshing docs:', error);
            // Reset documentationPending to false on error
            try {
                const integration = integrations.find(i => i.id === integrationId);
                if (integration) {
                    const resetData = cleanIntegrationForInput({
                        ...integration,
                        documentation: integration.documentation || '',
                        documentationPending: false
                    });
                    await client.upsertIntegration(integrationId, resetData, UpsertMode.UPDATE);
                }
            } catch (resetError) {
                console.error('Error resetting documentationPending:', resetError);
            }

            setPendingDocIds(prev => new Set([...prev].filter(id => id !== integrationId)));
        }
    };

    // Helper function to determine if integration has documentation
    const hasDocumentation = (integration: Integration) => {
        // Check if integration has documentation URL and is not pending
        return !!(integration.documentationUrl?.trim() && !pendingDocIds.has(integration.id));
    };

    // Helper to get icon for integration
    function getIntegrationIcon(integration: Integration) {
        const iconName = getIntegrationIconName(integration);
        return iconName ? getSimpleIcon(iconName) : null;
    }




    const handleRefresh = async () => {
        setIsRefreshing(true);
        await refreshIntegrations();
        setIsRefreshing(false);
    };

    return (
        <div className="flex flex-col min-h-full p-8 w-full">
            {initialLoading ? null : (
                <>
                    <div className="flex justify-between items-center mb-6">
                        <h1 className="text-2xl font-semibold">Integrations</h1>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleRefresh}
                            className="transition-transform"
                        >
                            <RotateCw className={`h-5 w-5 ${isRefreshing ? 'animate-spin' : ''}`} />
                        </Button>
                    </div>
                    {addFormOpen && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
                            <div className="bg-background rounded-xl max-w-2xl w-full p-0">
                                <IntegrationForm
                                    modal={true}
                                    integration={editingIntegration}
                                    onSave={handleSave}
                                    onCancel={() => {
                                        setAddFormOpen(false);
                                        setEditingIntegration(null);
                                    }}
                                    integrationOptions={integrationOptions}
                                    getSimpleIcon={getSimpleIcon}
                                />
                            </div>
                        </div>
                    )}
                    {integrations.length === 0 && !addFormOpen ? (
                        <div className="flex flex-col items-center justify-center flex-1 py-24">
                            <Globe className="h-12 w-12 text-muted-foreground mb-4" />
                            <p className="text-lg text-muted-foreground mb-2">No integrations added yet.</p>
                            <p className="text-sm text-muted-foreground mb-6">Integrations let you connect to APIs and data sources for your workflows.</p>
                            <Button variant="outline" size="sm" onClick={handleAdd}>
                                <Plus className="mr-2 h-4 w-4" /> Add Integration
                            </Button>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4 w-full">
                            <div className="flex justify-end mb-2">
                                <Button variant="outline" size="sm" onClick={handleAdd}>
                                    <Plus className="mr-2 h-4 w-4" /> Add Integration
                                </Button>
                            </div>
                            {paginatedIntegrations.map((integration) => {
                                const badge = getAuthBadge(integration);
                                return (
                                    <div key={integration.id} className="relative">
                                        <div className="flex items-center gap-3 border rounded-lg p-4 bg-card">
                                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                                {getIntegrationIcon(integration) ? (
                                                    <svg
                                                        width="20"
                                                        height="20"
                                                        viewBox="0 0 24 24"
                                                        fill={`#${getIntegrationIcon(integration)?.hex}`}
                                                        className="flex-shrink-0"
                                                    >
                                                        <path d={getIntegrationIcon(integration)?.path || ''} />
                                                    </svg>
                                                ) : (
                                                    <Globe className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                                                )}
                                                <div className="flex flex-col min-w-0">
                                                    <span className="font-medium truncate max-w-[200px]">{integration.id}</span>
                                                    <span className="text-sm text-muted-foreground truncate max-w-[240px]">
                                                        {composeUrl(integration.urlHost, integration.urlPath) || 'No API endpoint'}
                                                    </span>
                                                </div>
                                                {/* status badges moved to the right cluster */}
                                            </div>
                                            <div className="ml-auto flex items-center gap-3">
                                                <div className="flex items-center gap-2">
                                                    <DocStatus
                                                        pending={pendingDocIds.has(integration.id)}
                                                        hasDocumentation={hasDocumentation(integration)}
                                                    />
                                                    {(() => {
                                                        const colorClasses = {
                                                            blue: 'text-blue-600 dark:text-blue-300 bg-blue-500/10',
                                                            amber: 'text-amber-800 dark:text-amber-300 bg-amber-500/10',
                                                            green: 'text-green-800 dark:text-green-300 bg-green-500/10'
                                                        };

                                                        return (
                                                            <span className={`text-xs ${colorClasses[badge.color]} px-2 py-0.5 rounded flex items-center gap-1`}>
                                                                {badge.icon === 'clock' ? <Clock className="h-3 w-3" /> : <Key className="h-3 w-3" />}
                                                                {badge.label}
                                                            </span>
                                                        );
                                                    })()}
                                                </div>
                                                <div className="flex gap-2">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="text-muted-foreground hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed"
                                                        onClick={() => badge.type === 'oauth-incomplete' ? handleCompleteOAuth(integration) : router.push(`/workflows?integration=${integration.id}`)}
                                                        title={badge.type === 'oauth-incomplete' ? "Start OAuth flow to complete configuration" : "Build workflow with this integration"}
                                                        disabled={false}
                                                    >
                                                        {badge.type === 'oauth-incomplete' ? (
                                                            <>
                                                                <Key className="h-4 w-4 mr-2" />
                                                                Complete OAuth
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Sparkles className="h-4 w-4 mr-2" />
                                                                Build Workflow
                                                            </>
                                                        )}
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                                                        onClick={() => handleEdit(integration)}
                                                        title="Edit integration"
                                                    >
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-muted-foreground hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed"
                                                        onClick={() => handleRefreshDocs(integration.id)}
                                                        disabled={
                                                            !integration.documentationUrl ||
                                                            !integration.documentationUrl.trim() ||
                                                            (pendingDocIds.has(integration.id) && Date.now() - new Date(integration.updatedAt).getTime() < 60000) ||
                                                            integration.documentationUrl.startsWith('file://')
                                                        }
                                                        title={
                                                            pendingDocIds.has(integration.id)
                                                                ? "Documentation is already being processed"
                                                                : integration.documentationUrl?.startsWith('file://')
                                                                    ? "Cannot refresh file uploads"
                                                                    : !integration.documentationUrl || !integration.documentationUrl.trim()
                                                                        ? "No documentation URL to refresh"
                                                                        : "Refresh documentation from URL"
                                                        }
                                                    >
                                                        <FileDown className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-destructive hover:text-destructive"
                                                        onClick={() => {
                                                            setIntegrationToDelete(integration);
                                                            setDeleteDialogOpen(true);
                                                        }}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            <div className="flex justify-between items-center mt-4">
                                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>Previous</Button>
                                <span className="text-sm text-muted-foreground">Page {page + 1} of {totalPages}</span>
                                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>Next</Button>
                            </div>
                        </div>
                    )}
                    <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Delete Integration?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Are you sure you want to delete the integration "{integrationToDelete?.id}"? This action cannot be undone.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel onClick={() => setDeleteDialogOpen(false)}>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={async () => {
                                    if (integrationToDelete) {
                                        await handleDelete(integrationToDelete.id);
                                        setDeleteDialogOpen(false);
                                        setIntegrationToDelete(null);
                                    }
                                }}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </>)}
        </div>
    );
} 