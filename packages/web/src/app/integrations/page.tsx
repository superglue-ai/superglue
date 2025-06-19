"use client";
import { useConfig } from '@/src/app/config-context';
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
import { integrations as integrationTemplates } from '@/src/lib/integrations';
import { composeUrl } from '@/src/lib/utils';
import { Integration, SuperglueClient } from '@superglue/client';
import { Globe, Pencil, Plus, RotateCw, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { SimpleIcon } from 'simple-icons';
import * as simpleIcons from 'simple-icons';

export default function IntegrationsPage() {
    const superglueConfig = useConfig();
    const { toast } = useToast();
    const client = useMemo(() => new SuperglueClient({
        endpoint: superglueConfig.superglueEndpoint,
        apiKey: superglueConfig.superglueApiKey,
    }), [superglueConfig.superglueEndpoint, superglueConfig.superglueApiKey]);

    const [integrations, setIntegrations] = useState<Integration[]>([]);
    const [initialLoading, setInitialLoading] = useState(true);
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
    const PAGE_SIZE = 5;
    const paginatedIntegrations = integrations.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    const totalPages = Math.ceil(integrations.length / PAGE_SIZE);

    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [integrationToDelete, setIntegrationToDelete] = useState<Integration | null>(null);

    const inputErrorStyles = "border-destructive focus-visible:ring-destructive";

    // Get integration IDs for polling
    const integrationIds = useMemo(() => integrations.map(i => i.id), [integrations]);

    // Track previous pending IDs to detect completion
    const previousPendingIdsRef = useRef<Set<string>>(new Set());

    // Poll for documentation status
    const { pendingIds, isPolling, hasPending } = useIntegrationPolling({
        client,
        integrationIds,
        enabled: integrations.length > 0
    });

    // Detect when documentation processing completes and show toast
    useEffect(() => {
        const currentPendingIds = new Set(pendingIds);
        const previousPendingIds = previousPendingIdsRef.current;

        // Find integrations that were pending before but are no longer pending
        const completedIds = Array.from(previousPendingIds).filter(id => !currentPendingIds.has(id));

        if (completedIds.length > 0) {
            completedIds.forEach(id => {
                const integration = integrations.find(i => i.id === id);
                if (integration) {
                    toast({
                        title: 'Documentation Ready',
                        description: `Documentation for integration "${integration.id}" is now ready!`,
                        variant: 'default',
                    });
                }
            });
        }

        // Update the ref for next comparison
        previousPendingIdsRef.current = currentPendingIds;
    }, [pendingIds, integrations, toast]);

    // Function to wait for integration docs to be ready (one-time polling)
    const waitForIntegrationReady = async (integrationId: string, timeoutMs = 60000) => {
        const start = Date.now();
        let activeIds = [integrationId];

        while (Date.now() - start < timeoutMs && activeIds.length > 0) {
            let settled = await Promise.allSettled(
                activeIds.map(async (id) => {
                    try {
                        return await client.getIntegration(id);
                    } catch (e) {
                        return null;
                    }
                })
            );
            settled = settled.filter(r => r !== null);
            const results = settled.map(r => r.status === 'fulfilled' ? r.value : null);

            // Remove deleted integrations from polling
            activeIds = activeIds.filter((id, idx) => results[idx] !== null);

            // Check if any integration is still pending
            const notReady = results.find(i => i && (i.documentationPending === true || !i.documentation));
            if (!notReady) return results.filter(Boolean);

            await new Promise(res => setTimeout(res, 4000));
        }

        return [];
    };

    // Function to refresh documentation for a specific integration
    const handleRefreshDocs = async (integrationId: string) => {
        try {
            const integration = integrations.find(i => i.id === integrationId);
            if (!integration) return;

            // Trigger manual documentation refresh by upserting with only required fields
            // Don't pass existing documentation to avoid large payloads
            // Note: documentationPending is set by the backend, not the client
            await client.upsertIntegration(integrationId, {
                id: integration.id,
                urlHost: integration.urlHost,
                urlPath: integration.urlPath,
                documentationUrl: integration.documentationUrl,
                credentials: integration.credentials || {},
            });

            // Refresh the integrations list to update doc status
            const { items } = await client.listIntegrations(100, 0);
            setIntegrations(items);
        } catch (error) {
            console.error('Error refreshing docs:', error);
            toast({
                title: 'Error Refreshing Docs',
                description: 'Failed to refresh documentation. Please try again.',
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
        if (integration.documentationUrl && !pendingIds.includes(integration.id)) {
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

    useEffect(() => {
        let ignore = false;
        setInitialLoading(true);
        client.listIntegrations(100, 0)
            .then(({ items }) => {
                if (!ignore) setIntegrations(items);
            })
            .finally(() => { if (!ignore) setInitialLoading(false); });
        return () => { ignore = true; };
    }, [client]);

    const handleDelete = async (id: string) => {
        // Optimistically remove from UI
        setIntegrations(prev => prev.filter(i => i.id !== id));
        await client.deleteIntegration(id);
        // Optionally re-fetch to ensure consistency
        const { items } = await client.listIntegrations(100, 0);
        setIntegrations(items);
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
        setInitialLoading(true);
        if (integration.id) {
            await client.upsertIntegration(integration.id, integration);

            // Only trigger doc polling if there's a documentation URL (not raw text)
            const hasDocUrl = integration.documentationUrl && integration.documentationUrl.trim();
            const needsDocFetch = hasDocUrl && (!editingIntegration ||
                editingIntegration.urlHost !== integration.urlHost ||
                editingIntegration.urlPath !== integration.urlPath ||
                editingIntegration.documentationUrl !== integration.documentationUrl);

            if (needsDocFetch) {
                // Fire-and-forget poller for background doc fetch
                waitForIntegrationReady(integration.id, 60000).catch(console.error);
            }

            // Refresh the integrations list to get updated data including documentation
            const { items } = await client.listIntegrations(100, 0);
            setIntegrations(items);
        }
        setInitialLoading(false);
        handleModalClose();
    };

    return (
        <div className="flex flex-col h-full p-8 w-full">
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
                                                    pending={pendingIds.includes(integration.id)}
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
                                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                                onClick={() => handleEdit(integration)}
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-muted-foreground hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed"
                                                onClick={() => handleRefreshDocs(integration.id)}
                                                disabled={!integration.documentationUrl || !integration.documentationUrl.trim() || pendingIds.includes(integration.id)}
                                                title={integration.documentationUrl && integration.documentationUrl.trim() ? "Refresh documentation from URL" : "No documentation URL to refresh"}
                                            >
                                                <RotateCw className="h-4 w-4" />
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