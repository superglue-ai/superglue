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
import { integrations as integrationTemplates } from '@/src/lib/integrations';
import { Integration, SuperglueClient } from '@superglue/client';
import { Globe, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { SimpleIcon } from 'simple-icons';
import * as simpleIcons from 'simple-icons';

export default function IntegrationsPage() {
    const superglueConfig = useConfig();
    const client = useMemo(() => new SuperglueClient({
        endpoint: superglueConfig.superglueEndpoint,
        apiKey: superglueConfig.superglueApiKey,
    }), [superglueConfig.superglueEndpoint, superglueConfig.superglueApiKey]);

    const [integrations, setIntegrations] = useState<Integration[]>([]);
    const [initialLoading, setInitialLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingIntegration, setEditingIntegration] = useState<Integration | null>(null);

    const integrationOptions = [
        { value: "custom", label: "Custom", icon: "default" },
        ...Object.entries(integrationTemplates).map(([key, integration]) => ({
            value: key,
            label: key.charAt(0).toUpperCase() + key.slice(1),
            icon: integration.icon || "default"
        }))
    ];
    const [selectedIntegration, setSelectedIntegration] = useState<string>("custom");
    const [integrationDropdownOpen, setIntegrationDropdownOpen] = useState(false);
    const [validationErrors, setValidationErrors] = useState<Record<string, boolean>>({});
    const inputErrorStyles = "border-destructive focus-visible:ring-destructive";
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
    const [editFormId, setEditFormId] = useState<string | null>(null);

    const [page, setPage] = useState(0);
    const PAGE_SIZE = 4;
    const paginatedIntegrations = integrations.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    const totalPages = Math.ceil(integrations.length / PAGE_SIZE);

    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [integrationToDelete, setIntegrationToDelete] = useState<Integration | null>(null);

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
            const { items } = await client.listIntegrations(100, 0);
            setIntegrations(items);
        }
        setInitialLoading(false);
        handleModalClose();
    };

    const handleIntegrationSelect = (value: string) => {
        setSelectedIntegration(value);
    };

    const handleIntegrationFormSave = (integration: Integration) => {
        setAddFormOpen(false);
        setEditingIntegration(null);
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
                                        <div className="flex flex-col">
                                            <span className="font-medium">{integration.id}</span>
                                            <span className="text-sm text-muted-foreground truncate max-w-[300px]">
                                                {integration.urlHost}
                                            </span>
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