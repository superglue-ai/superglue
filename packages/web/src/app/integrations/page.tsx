"use client";

import { useConfig } from '@/src/app/config-context';
import { tokenRegistry } from '@/src/lib/token-registry';
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
import { Input } from '@/src/components/ui/input';
import { DocStatus } from '@/src/components/utils/DocStatusSpinner';
import { useToast } from '@/src/hooks/use-toast';
import { createSuperglueClient, needsUIToTriggerDocFetch } from '@/src/lib/client-utils';
import { composeUrl, getIntegrationIcon as getIntegrationIconName } from '@/src/lib/general-utils';
import { buildOAuthFieldsFromIntegration, createOAuthErrorHandler, triggerOAuthFlow } from '@/src/lib/oauth-utils';
import type { Integration } from '@superglue/shared';
import { UpsertMode } from '@superglue/shared';
import { integrationOptions } from '@superglue/shared';
import { waitForIntegrationProcessing } from '@superglue/shared/utils';
import { Clock, FileDown, Globe, Key, Pencil, Plus, RotateCw, Sparkles, Trash2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { SimpleIcon } from 'simple-icons';
import * as simpleIcons from 'simple-icons';

export const detectAuthType = (credentials: any): 'oauth' | 'apikey' | 'none' => {
    if (!credentials || Object.keys(credentials).length === 0) return 'none';

    const oauthSpecificFields = ['client_id', 'client_secret', 'auth_url', 'token_url', 'access_token', 'refresh_token', 'scopes', 'expires_at', 'token_type'];

    const allKeys = Object.keys(credentials);

    const hasOAuthFields = allKeys.some(key => oauthSpecificFields.includes(key));

    if (hasOAuthFields) return 'oauth';

    return 'apikey';
};

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
        const hasAccess = !!creds.access_token;
        const hasClientConfig = !!creds.client_id || !!creds.client_secret;

        return hasAccess
            ? { type: 'oauth-configured', label: 'OAuth configured', color: 'blue', icon: 'key' }
            : hasClientConfig
                ? { type: 'oauth-incomplete', label: 'OAuth incomplete', color: 'amber', icon: 'clock' }
                : { type: 'none', label: 'No auth', color: 'amber', icon: 'key' };
    }

    return { type: 'apikey', label: 'API Key', color: 'green', icon: 'key' };
};

export default function IntegrationsPage() {
    const config = useConfig();
    const { toast } = useToast();
    const searchParams = useSearchParams();
    const router = useRouter();
    const { integrations, pendingDocIds, loading: initialLoading, isRefreshing, refreshIntegrations, setPendingDocIds } = useIntegrations();

    useEffect(() => {
        refreshIntegrations();
    }, [refreshIntegrations]);

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
        } else if (error) {
            const errorMessage = description || message || 'Failed to complete OAuth connection';
            const handleOAuthError = createOAuthErrorHandler(integration || 'unknown', toast);
            handleOAuthError(errorMessage);
        }
    }, [searchParams, toast]);

    const { waitForIntegrationReady } = useMemo(() => ({
        waitForIntegrationReady: (integrationIds: string[]) => {
            // Create adapter for SuperglueClient to work with shared utility
            const clientAdapter = {
                getIntegration: (id: string) => {
                    const client = createSuperglueClient(config.superglueEndpoint);
                    return client.getIntegration(id);
                }
            };
            return waitForIntegrationProcessing(clientAdapter, integrationIds);
        }
    }), []);

    const [editingIntegration, setEditingIntegration] = useState<Integration | null>(null);


    // OAuth flows now use callbacks directly, no need for message listener

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
    const [searchQuery, setSearchQuery] = useState('');

    const [page, setPage] = useState(0);
    const PAGE_SIZE = 10;

    const filteredIntegrations = integrations?.filter(integration => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
            integration.id.toLowerCase().includes(query) ||
            integration.urlHost?.toLowerCase().includes(query) ||
            integration.urlPath?.toLowerCase().includes(query)
        );
    }).sort((a, b) => a.id.localeCompare(b.id)) || [];

    const paginatedIntegrations = filteredIntegrations.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    const totalPages = Math.ceil(filteredIntegrations.length / PAGE_SIZE);

    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [integrationToDelete, setIntegrationToDelete] = useState<Integration | null>(null);

    const handleDelete = async (id: string) => {
        try {
            const client = createSuperglueClient(config.superglueEndpoint);
            await client.deleteIntegration(id);
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
        const oauthFields = buildOAuthFieldsFromIntegration(integration);

        // Determine auth type dynamically
        const authType = detectAuthType(integration.credentials || {});

        const handleOAuthError = createOAuthErrorHandler(integration.id, toast);

        const handleOAuthSuccess = (tokens: any) => {
            if (tokens) {
                toast({
                    title: 'OAuth Connection Successful',
                    description: `Successfully connected to ${integration.id}`,
                });


                if (editingIntegration?.id === integration.id) {
                    const updatedIntegration = {
                        ...editingIntegration,
                        credentials: {
                            ...editingIntegration.credentials,
                            ...tokens
                        }
                    };
                    setEditingIntegration(updatedIntegration);
                }
            }
        };

        // Trigger OAuth flow with callbacks
        triggerOAuthFlow(
            integration.id,
            oauthFields,
            integration.id,
            tokenRegistry.getToken(),
            authType,
            handleOAuthError,
            true,
            undefined,
            handleOAuthSuccess,
            config.superglueEndpoint
        );
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

                const client = createSuperglueClient(config.superglueEndpoint);
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

            const client = createSuperglueClient(config.superglueEndpoint);
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

                    const client = createSuperglueClient(config.superglueEndpoint);
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
        await refreshIntegrations();
    };

    const blockAllContent = initialLoading && !addFormOpen;

    return (
        <div className="flex flex-col min-h-full p-8 w-full">
            {blockAllContent ? null : (
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
                            <p className="text-sm text-muted-foreground mb-6">Integrations let you connect to APIs and data sources for your tools.</p>
                            <Button variant="outline" size="sm" onClick={handleAdd}>
                                <Plus className="mr-2 h-4 w-4" /> Add Integration
                            </Button>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4 w-full">
                            <div className="flex items-center gap-3 mb-2">
                                <Input
                                    placeholder="Search integrations..."
                                    value={searchQuery}
                                    onChange={(e) => {
                                        setSearchQuery(e.target.value);
                                        setPage(0);
                                    }}
                                    className="flex-1 h-8"
                                />
                                <Button variant="outline" size="sm" onClick={handleAdd} className="hidden sm:inline-flex">
                                    <Plus className="mr-2 h-4 w-4" /> Add Integration
                                </Button>
                            </div>
                            {paginatedIntegrations.map((integration) => {
                                const badge = getAuthBadge(integration);
                                return (
                                    <div key={integration.id} className="relative">
                                        <div className="flex items-center gap-3 border rounded-lg p-4 bg-card">
                                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                                {(() => {
                                                    const icon = getIntegrationIcon(integration);
                                                    return icon ? (
                                                        <svg
                                                            width="20"
                                                            height="20"
                                                            viewBox="0 0 24 24"
                                                            fill={`#${icon.hex}`}
                                                            className="flex-shrink-0"
                                                        >
                                                            <path d={icon.path || ''} />
                                                        </svg>
                                                    ) : (
                                                        <Globe className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                                                    );
                                                })()}
                                                <div className="flex flex-col min-w-0 flex-1">
                                                    <span className="font-medium truncate">{integration.id}</span>
                                                    <span className="text-sm text-muted-foreground truncate">
                                                        {composeUrl(integration.urlHost, integration.urlPath) || 'No API endpoint'}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="hidden sm:flex flex-row items-center gap-3 ml-auto">
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
                                                            <span className={`text-xs ${colorClasses[badge.color]} px-2 py-0.5 rounded flex items-center gap-1 whitespace-nowrap`}>
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
                                                        onClick={() => badge.type === 'oauth-incomplete' ? handleCompleteOAuth(integration) : router.push(`/tools?integration=${integration.id}`)}
                                                        title={badge.type === 'oauth-incomplete' ? "Start OAuth flow to complete configuration" : "Build a tool with this integration"}
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
                                                                Build Tool
                                                            </>
                                                        )}
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="text-muted-foreground hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed"
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
                                                        <FileDown className="h-4 w-4 mr-2" />
                                                        Refresh Docs
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                                                        onClick={() => handleEdit(integration)}
                                                    >
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8"
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