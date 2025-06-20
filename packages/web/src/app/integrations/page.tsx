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
import { useIntegrationPolling } from '@/src/hooks/use-integration-polling';
import { useToast } from '@/src/hooks/use-toast';
import { needsUIToTriggerDocFetch } from '@/src/lib/client-utils';
import { integrations as integrationTemplates } from '@/src/lib/integrations';
import { composeUrl } from '@/src/lib/utils';
import type { Integration } from '@superglue/client';
import { SuperglueClient, UpsertMode } from '@superglue/client';
import { FileDown, Globe, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { SimpleIcon } from 'simple-icons';
import * as simpleIcons from 'simple-icons';

export default function IntegrationsPage() {
    const config = useConfig();
    const { toast } = useToast();
    const { integrations, pendingDocIds, loading: initialLoading, refreshIntegrations, setPendingDocIds } = useIntegrations();

    const client = useMemo(() => new SuperglueClient({
        endpoint: config.superglueEndpoint,
        apiKey: config.superglueApiKey,
    }), [config.superglueEndpoint, config.superglueApiKey]);

    const { waitForIntegrationReady } = useIntegrationPolling(client);

    const [editingIntegration, setEditingIntegration] = useState<Integration | null>(null);

    const integrationOptions = [
        { value: "custom", label: "Custom", icon: "default" },
        ...Object.entries(integrationTemplates).map(([key, integration]) => ({
            value: key,
            label: key.charAt(0).toUpperCase() + key.slice(1),
            icon: integration.icon || "default"
        }))
    ];

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

    const inputErrorStyles = "border-destructive focus-visible:ring-destructive";

    const handleDelete = async (id: string) => {
        try {
            // Optimistically remove from UI
            await client.deleteIntegration(id);
            // Refresh to ensure consistency
            await refreshIntegrations();
        } catch (error) {
            console.error('Error deleting integration:', error);
            toast({
                title: 'Error Deleting Integration',
                description: error instanceof Error ? error.message : 'Failed to delete integration',
                variant: 'destructive',
            });
        }
    };

    const handleEdit = (integration: Integration) => {
        setEditingIntegration(integration);
        setAddFormOpen(true);
    };
    const handleAdd = () => {
        setEditingIntegration(null);
        setAddFormOpen(true);
    };
    const handleModalClose = () => {
        setAddFormOpen(false);
        setEditingIntegration(null);
    };
    const handleSave = async (integration: Integration) => {
        try {
            if (integration.id) {
                const mode = editingIntegration ? UpsertMode.UPDATE : UpsertMode.CREATE;
                const savedIntegration = await client.upsertIntegration(integration.id, integration, mode)
                const needsDocFetch = needsUIToTriggerDocFetch(savedIntegration, editingIntegration);

                if (needsDocFetch) {
                    // Set pending state for new integrations with doc URLs
                    setPendingDocIds(prev => new Set([...prev, savedIntegration.id]));

                    // Fire-and-forget poller for background doc fetch
                    waitForIntegrationReady([savedIntegration.id], 60000).then(() => {
                        // Remove from pending when done
                        setPendingDocIds(prev => new Set([...prev].filter(id => id !== savedIntegration.id)));
                    }).catch((error) => {
                        console.error('Error waiting for docs:', error);
                        // Remove from pending on error
                        setPendingDocIds(prev => new Set([...prev].filter(id => id !== savedIntegration.id)));
                    });
                }

                // Refresh integrations to ensure UI is updated
                await refreshIntegrations();
            }
        } catch (error) {
            console.error('Error saving integration:', error);
            toast({
                title: 'Error Saving Integration',
                description: error instanceof Error ? error.message : 'Failed to save integration',
                variant: 'destructive',
            });
        } finally {
            handleModalClose();
        }
    };

    // Function to refresh documentation for a specific integration
    const handleRefreshDocs = async (integrationId: string) => {
        // Set pending state immediately
        setPendingDocIds(prev => new Set([...prev, integrationId]));

        try {
            // Get current integration to upsert with documentationPending=true
            const integration = integrations.find(i => i.id === integrationId);
            if (!integration) return;

            // Use documentationPending flag to trigger backend refresh
            const upsertData = {
                id: integration.id,
                urlHost: integration.urlHost,
                urlPath: integration.urlPath,
                documentationUrl: integration.documentationUrl,
                credentials: integration.credentials || {},
                documentationPending: true // Trigger refresh
            };

            await client.upsertIntegration(integrationId, upsertData, UpsertMode.UPDATE);

            // Use proper polling to wait for docs to be ready
            const results = await waitForIntegrationReady([integrationId], 60000);

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

                toast({
                    title: 'Refresh Failed',
                    description: `Failed to refresh documentation for "${integrationId}".`,
                    variant: 'destructive',
                });
            }

        } catch (error) {
            console.error('Error refreshing docs:', error);
            // Reset documentationPending to false on error
            try {
                const integration = integrations.find(i => i.id === integrationId);
                if (integration) {
                    await client.upsertIntegration(integrationId, {
                        id: integration.id,
                        urlHost: integration.urlHost,
                        urlPath: integration.urlPath,
                        documentationUrl: integration.documentationUrl,
                        credentials: integration.credentials || {},
                        documentation: integration.documentation || '',
                        documentationPending: false
                    }, UpsertMode.UPDATE);
                }
            } catch (resetError) {
                console.error('Error resetting documentationPending:', resetError);
            }

            setPendingDocIds(prev => new Set([...prev].filter(id => id !== integrationId)));

            toast({
                title: 'Refresh Failed',
                description: `Failed to refresh documentation for "${integrationId}".`,
                variant: 'destructive',
            });
        }
    };

    // Helper function to determine if integration has documentation
    const hasDocumentation = (integration: Integration) => {
        // Check for direct documentation content or URL
        const hasDirectDocs = !!(integration.documentation || integration.documentationUrl);

        // For direct doc upload scenarios, if there's documentation content, consider it available
        // even if documentationPending might be true (since it's already uploaded)
        if (integration.documentation && integration.documentation.trim()) {
            return true;
        }

        // For URL-based docs, check if not pending and has URL
        if (integration.documentationUrl && !pendingDocIds.has(integration.id)) {
            return true;
        }

        return hasDirectDocs;
    };

    // Helper to get icon for integration
    function getIntegrationIcon(integration: Integration) {
        const match = integrationOptions.find(opt =>
            opt.value !== 'custom' &&
            (integration.id === opt.value || integration.urlHost.includes(opt.value))
        );
        return match ? getSimpleIcon(match.icon) : null;
    }

    return (
        <div className="flex flex-col min-h-full p-8 w-full">
            {initialLoading ? null : (
                <>
                    <h1 className="text-2xl font-semibold mb-6">Integrations</h1>
                    {addFormOpen && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
                            <div className="bg-background rounded-xl max-w-2xl w-full p-0">
                                <IntegrationForm
                                    modal={true}
                                    integration={editingIntegration}
                                    onSave={handleSave}
                                    onCancel={() => setAddFormOpen(false)}
                                    integrationOptions={integrationOptions}
                                    getSimpleIcon={getSimpleIcon}
                                    inputErrorStyles={inputErrorStyles}
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
                            {paginatedIntegrations.map((integration) => (
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
                                            <div className="flex items-center gap-2">
                                                <DocStatus
                                                    pending={pendingDocIds.has(integration.id)}
                                                    hasDocumentation={hasDocumentation(integration)}
                                                />
                                                {(!integration.credentials || Object.keys(integration.credentials).length === 0) && (
                                                    <span className="text-xs text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded">No credentials</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="ml-auto flex gap-2">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                                                onClick={() => handleEdit(integration)}
                                                disabled={pendingDocIds.has(integration.id)}
                                                title={pendingDocIds.has(integration.id) ? "Documentation is being processed" : "Edit integration"}
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-muted-foreground hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed"
                                                onClick={() => handleRefreshDocs(integration.id)}
                                                disabled={!integration.documentationUrl || !integration.documentationUrl.trim() || pendingDocIds.has(integration.id)}
                                                title={integration.documentationUrl && integration.documentationUrl.trim() ? "Refresh documentation from URL" : "No documentation URL to refresh"}
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
                            ))}
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