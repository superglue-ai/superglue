"use client"

import { useConfig } from '@/src/app/config-context';
import { ConfigCreateStepper } from '@/src/components/api/ConfigCreateStepper';
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
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/src/components/ui/tooltip";
import EmptyStateActions from '@/src/components/utils/EmptyStateActions';
import { ApiConfig, ExecutionStep, ExtractConfig, SuperglueClient, TransformConfig, Workflow } from '@superglue/client';
import { Check, Copy, GitBranch, History, Loader2, Play, Plus, RotateCw, Settings, Trash2, Zap } from "lucide-react";
import { useRouter } from 'next/navigation';
import React from 'react';

const ConfigTable = () => {
  const router = useRouter();
  const [configs, setConfigs] = React.useState<(ApiConfig | ExtractConfig | Workflow | TransformConfig)[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(0);
  const [pageSize] = React.useState(20);
  const config = useConfig();
  const [configToDelete, setConfigToDelete] = React.useState<ApiConfig | ExtractConfig | Workflow | TransformConfig | null>(null);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [showConfigStepper, setShowConfigStepper] = React.useState(false);
  const [configStepperProps, setConfigStepperProps] = React.useState<{ prefillData?: any }>({});
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const refreshConfigs = React.useCallback(async () => {
    setShowConfigStepper(false);
    setIsRefreshing(true);
    setLoading(true);
    try {
      const superglueClient = new SuperglueClient({
        endpoint: config.superglueEndpoint,
        apiKey: config.superglueApiKey
      });

      // Fetch APIs, Extracts, Transforms, and Workflows concurrently
      const [apiConfigs, extractConfigs, transformConfigs, workflowConfigs] = await Promise.all([
        superglueClient.listApis(1000, 0),
        superglueClient.listExtracts(1000, 0),
        superglueClient.listTransforms(1000, 0),
        superglueClient.listWorkflows(1000, 0),
      ]);

      const combinedConfigs = [
        ...apiConfigs.items.map(item => ({ ...item, type: 'api' as const })),
        ...extractConfigs.items.map(item => ({ ...item, type: 'extract' as const })),
        ...transformConfigs.items.map(item => ({ ...item, type: 'transform' as const })),
        ...workflowConfigs.items.map((item: any) => ({ ...item, type: 'workflow' as const }))
      ].sort((a, b) => {
        // Use updatedAt first, fallback to createdAt
        const dateA = new Date(a.updatedAt || a.createdAt).getTime();
        const dateB = new Date(b.updatedAt || b.createdAt).getTime();
        return dateB - dateA; // Sort descending (newest first)
      });

      const start = page * pageSize;
      const end = start + pageSize;
      setConfigs(combinedConfigs.slice(start, end));
      setTotal(combinedConfigs.length);
    } catch (error) {
      console.error('Error fetching configs:', error);
      // Consider setting an error state to show in the UI
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [config, page, pageSize]);

  React.useEffect(() => {
    refreshConfigs();
  }, [refreshConfigs]);

  const handleWorkflow = () => {
    router.push('/workflows');
  };
  const handleWorkflowManual = () => {
    router.push('/workflows/manual');
  };

  const handleTransform = () => {
    router.push('/transforms');
  };


  const handleEdit = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    router.push(`/configs/${id}/edit`);
  };

  const handlePlay = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    router.push(`/configs/${id}/run`);
  };

  const handlePlayExtract = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    router.push(`/extracts/${id}/run`);
  };

  const handlePlayTransform = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    router.push(`/transforms/${id}`);
  };

  const handleViewLogs = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    router.push(`/runs/${id}`);
  };

  const handleEditWorkflow = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    // Navigate to the workflow page, passing the ID as a query param
    // The workflow page should be updated to potentially load based on this param
    router.push(`/workflows/${encodeURIComponent(id)}`);
  };

  const handlePlayWorkflow = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    // Navigate to the workflow page, passing the ID. The user can then run it.
    router.push(`/workflows/${encodeURIComponent(id)}`);
  };

  const handleDelete = async () => {
    if (!configToDelete) return;

    try {
      const superglueClient = new SuperglueClient({
        endpoint: config.superglueEndpoint,
        apiKey: config.superglueApiKey
      });

      let deletePromise;

      switch ((configToDelete as any)?.type) {
        case 'api':
          deletePromise = superglueClient.deleteApi(configToDelete.id);
          break;
        case 'extract':
          deletePromise = superglueClient.deleteExtraction(configToDelete.id);
          break;
        case 'transform':
          deletePromise = superglueClient.deleteTransformation(configToDelete.id);
          break;
        case 'workflow':
          // Manual fetch for deleting workflow
          deletePromise = fetch(`${config.superglueEndpoint}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${config.superglueApiKey}`,
            },
            body: JSON.stringify({
              query: `
                mutation DeleteWorkflow($id: ID!) {
                  deleteWorkflow(id: $id)
                }
              `,
              variables: { id: configToDelete.id },
            }),
          }).then(async response => {
            const json = await response.json();
            if (!response.ok || json.errors) {
              throw new Error(`Failed to delete workflow: ${json.errors?.[0]?.message || response.statusText}`);
            }
            return json.data.deleteWorkflow;
          });
          break;
        default:
          console.error('Unknown config type for deletion:', (configToDelete as any)?.type);
          return;
      }

      await deletePromise;

      setConfigToDelete(null);
      // Optimization: remove locally instead of full refresh? For simplicity, refresh:
      refreshConfigs();
    } catch (error) {
      console.error('Error deleting config:', error);
      // Add user feedback, e.g., toast notification
    }
  };

  const handleCopyId = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const totalPages = Math.ceil(total / pageSize);

  if (loading) {
    return (
      <div className="p-8 max-w-none w-full min-h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
    );
  }
  else if (showConfigStepper) {
    return (
      <div className="p-8 max-w-none w-full min-h-full">
        <ConfigCreateStepper
          mode="create"
          onComplete={refreshConfigs}
          prefillData={configStepperProps.prefillData}
        />
      </div>
    )
  }
  else if (configs.length === 0) {
    return (
      <div className="p-8 max-w-none w-full min-h-full">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Configurations</h1>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={refreshConfigs}
                  className="transition-transform"
                >
                  <RotateCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Refresh Configurations</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <EmptyStateActions
          handleWorkflow={handleWorkflow}
          handleWorkflowManual={handleWorkflowManual}
          handleTransform={handleTransform}
        />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-none w-full min-h-full">
      <div className="flex flex-col lg:flex-row justify-between lg:items-center mb-6 gap-2">
        <h1 className="text-2xl font-bold">Configurations</h1>
        <div className="flex gap-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuItem onClick={handleTransform} className='p-4'>
                <Zap className="mr-2 h-4 w-4" />
                Transform
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleWorkflow} className='p-4'>
                <GitBranch className="mr-2 h-4 w-4" />
                Workflow
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleWorkflowManual} className='p-4'>
                <GitBranch className="mr-2 h-4 w-4" />
                Workflow (Manual)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead></TableHead>
              <TableHead>ID</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Details</TableHead>
              <TableHead>Updated At</TableHead>
              <TableHead className="text-right">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={refreshConfigs}
                        className="transition-transform"
                      >
                        <RotateCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Refresh Configurations</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {configs.map((config) => {
              const configType = (config as any).type;
              const isApi = configType === 'api';
              const isExtract = configType === 'extract';
              const isTransform = configType === 'transform';
              const isWorkflow = configType === 'workflow';

              const handleRunClick = (e: React.MouseEvent) => {
                if (isApi) handlePlay(e, config.id);
                else if (isExtract) handlePlayExtract(e, config.id);
                else if (isTransform) handlePlayTransform(e, config.id);
                else if (isWorkflow) handlePlayWorkflow(e, config.id);
              };

              return (
                <TableRow
                  key={`${configType}-${config.id}`}
                  className="hover:bg-secondary"
                // Consider adding onClick={() => handleRowClick(config)} if needed
                >
                  <TableCell className="w-[100px]">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleRunClick}
                      className="gap-2"
                    >
                      {isWorkflow ? <GitBranch className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      Run
                    </Button>
                  </TableCell>
                  <TableCell className="font-medium max-w-[200px] truncate relative group">
                    <div className="flex items-center space-x-1">
                      <span className="truncate">{config.id}</span>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => handleCopyId(e, config.id)}
                            >
                              {copiedId === config.id ? (
                                <Check className="h-3.5 w-3.5 text-green-500" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p>{copiedId === config.id ? "Copied!" : "Copy ID"}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </TableCell>
                  <TableCell className="w-[100px]">
                    {/* Use different variants or specific names */}
                    <Badge variant={isApi ? 'secondary' : isExtract ? 'default' : isTransform ? 'outline' : 'outline'}>
                      {isApi ? 'API' : isExtract ? 'Extract' : isTransform ? 'Transform' : 'Workflow'}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[300px] truncate">
                    {configType === 'api' || configType === 'extract' || configType === 'transform' ?
                      (config as ApiConfig | ExtractConfig | TransformConfig).instruction :
                      (config as Workflow).steps.map((step: ExecutionStep) => step.id).join(' => ')
                    }
                  </TableCell>
                  <TableCell className="w-[150px]">
                    {config.updatedAt ? new Date(config.updatedAt).toLocaleDateString() : (config.createdAt ? new Date(config.createdAt).toLocaleDateString() : '')}
                  </TableCell>
                  <TableCell className="w-[100px]">
                    <div className="flex justify-end gap-1"> {/* Reduced gap */}
                      <TooltipProvider>
                        {/* Common Actions */}
                        {isApi && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => handleViewLogs(e, config.id)}
                              >
                                <History className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>View Run History</p>
                            </TooltipContent>
                          </Tooltip>
                        )}

                        {(isApi || isWorkflow) && ( // Edit for API and Workflow
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => isApi ? handleEdit(e, config.id) : handleEditWorkflow(e, config.id)}
                              >
                                <Settings className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{isApi ? 'Edit Configuration' : 'Edit Workflow'}</p>
                            </TooltipContent>
                          </Tooltip>
                        )}

                        {/* Delete Action (Available for all types) */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              className="text-destructive"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfigToDelete(config);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Delete {isApi ? 'Configuration' : isExtract ? 'Configuration' : isTransform ? 'Transform' : 'Workflow'}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-center space-x-2 py-4">
        <Button
          variant="outline"
          onClick={() => setPage(p => Math.max(0, p - 1))}
          disabled={page === 0}
        >
          Previous
        </Button>
        <div className="text-sm">
          Page {page + 1} of {totalPages}
        </div>
        <Button
          variant="outline"
          onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
          disabled={page >= totalPages - 1}
        >
          Next
        </Button>
      </div>

      <AlertDialog open={!!configToDelete} onOpenChange={(open) => !open && setConfigToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this configuration. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ConfigTable;