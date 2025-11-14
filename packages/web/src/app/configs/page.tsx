"use client"

import { useConfig } from '@/src/app/config-context';
import { useIntegrations } from '@/src/app/integrations-context';
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
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { tokenRegistry } from '@/src/lib/token-registry';

import ToolSchedulesList from '@/src/components/tools/schedule/ToolSchedulesList';
import { ToolCreateStepper } from '@/src/components/tools/ToolCreateStepper';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/src/components/ui/tooltip";
import { loadFromCache, saveToCache } from '@/src/lib/cache-utils';
import { getIntegrationIcon as getIntegrationIconName } from '@/src/lib/general-utils';
import { ApiConfig, Integration, SuperglueClient, Workflow as Tool } from '@superglue/client';
import { Calendar, Check, Copy, Filter, Globe, Hammer, History, Loader2, Play, Plus, RotateCw, Search, Settings, Trash2 } from "lucide-react";
import { useRouter } from 'next/navigation';
import React from 'react';
import type { SimpleIcon } from 'simple-icons';
import * as simpleIcons from 'simple-icons';

const CACHE_PREFIX = 'superglue-tools-cache';

interface CachedTools {
  configs: (ApiConfig | Tool)[];
  timestamp: number;
}

const ConfigTable = () => {
  const router = useRouter();
  const [allConfigs, setAllConfigs] = React.useState<(ApiConfig | Tool)[]>([]);
  const [configs, setConfigs] = React.useState<(ApiConfig | Tool)[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(0);
  const [pageSize] = React.useState(20);
  const config = useConfig();
  const { integrations } = useIntegrations();
  const [configToDelete, setConfigToDelete] = React.useState<ApiConfig | Tool | null>(null);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [expandedToolId, setExpandedToolId] = React.useState<string | null>(null);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [selectedIntegration, setSelectedIntegration] = React.useState<string>("all");
  const [showToolStepper, setShowToolStepper] = React.useState(false);
  const [scheduleRefreshTrigger, setScheduleRefreshTrigger] = React.useState(0);


  const refreshConfigs = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      const superglueClient = new SuperglueClient({
        endpoint: config.superglueEndpoint,
        apiKey: tokenRegistry.getToken()
      });

      const [apiConfigs, toolConfigs] = await Promise.all([
        superglueClient.listApis(1000, 0),
        superglueClient.listWorkflows(1000, 0),
      ]);

      const combinedConfigs = [
        ...apiConfigs.items.map(item => ({ ...item, type: 'api' as const })),
        ...toolConfigs.items.map((item: any) => ({ ...item, type: 'tool' as const }))
      ].sort((a, b) => {
        const dateA = new Date(a.updatedAt || a.createdAt).getTime();
        const dateB = new Date(b.updatedAt || b.createdAt).getTime();
        return dateB - dateA;
      });

      setAllConfigs(combinedConfigs);
      setTotal(combinedConfigs.length);
      setPage(0);

      saveToCache(CACHE_PREFIX, {
        configs: combinedConfigs,
        timestamp: Date.now()
      });
      
      // Trigger schedule refresh if a schedule section is open
      if (expandedToolId) {
        setScheduleRefreshTrigger(prev => prev + 1);
      }
    } catch (error) {
      console.error('Error fetching configs:', error);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [config.superglueEndpoint]);

  React.useEffect(() => {
    const cachedData = loadFromCache<CachedTools>(CACHE_PREFIX);
    if (cachedData?.configs) {
      setAllConfigs(cachedData.configs);
      setTotal(cachedData.configs.length);
      setLoading(false);
    }
    refreshConfigs();
  }, [refreshConfigs]);

  React.useEffect(() => {
    const filtered = allConfigs.filter(config => {
      if (!config) return false;

      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const configString = JSON.stringify(config).toLowerCase();
        if (!configString.includes(searchLower)) return false;
      }

      // Integration filter
      if (selectedIntegration !== "all") {
        const configType = (config as any).type;
        const isTool = configType === 'tool';

        if (!isTool) return false;

        const tool = config as Tool;
        const allIntegrationIds = new Set<string>();

        if (tool.integrationIds) {
          tool.integrationIds.forEach(id => allIntegrationIds.add(id));
        }

        if (tool.steps) {
          tool.steps.forEach((step: any) => {
            if (step.integrationId) {
              allIntegrationIds.add(step.integrationId);
            }
          });
        }

        if (!allIntegrationIds.has(selectedIntegration)) return false;
      }

      return true;
    });

    setTotal(filtered.length);

    const start = page * pageSize;
    const end = start + pageSize;
    setConfigs(filtered.slice(start, end));
  }, [page, allConfigs, searchTerm, selectedIntegration, pageSize]);

  React.useEffect(() => {
    if (searchTerm || selectedIntegration !== "all") {
      setPage(0);
    }
  }, [searchTerm, selectedIntegration]);

  const handleTool = () => {
    setShowToolStepper(true);
  };


  const handleEdit = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    router.push(`/configs/${id}/edit`);
  };

  const handlePlay = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    router.push(`/configs/${id}/run`);
  };


  const handleViewLogs = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    router.push(`/runs/${id}`);
  };

  const handlePlayTool = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    // Navigate to the tool page, passing the ID. The user can then run it.
    router.push(`/tools/${encodeURIComponent(id)}`);
  };

  const handleDelete = async () => {
    if (!configToDelete) return;

    try {
      const superglueClient = new SuperglueClient({
        endpoint: config.superglueEndpoint,
        apiKey: tokenRegistry.getToken()
      });

      let deletePromise;

      switch ((configToDelete as any)?.type) {
        case 'api':
          deletePromise = superglueClient.deleteApi(configToDelete.id);
          break;
        case 'tool':
          deletePromise = superglueClient.deleteWorkflow(configToDelete.id);
          break;
        default:
          console.error('Unknown config type for deletion:', (configToDelete as any)?.type);
          return;
      }

      await deletePromise;

      const deletedId = configToDelete.id;
      setConfigToDelete(null);
      setAllConfigs(prev => prev.filter(c => c.id !== deletedId));
      setTotal(prev => prev - 1);
    } catch (error) {
      console.error('Error deleting config:', error);
    }
  };

  const handleCopyId = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const [copiedDetails, setCopiedDetails] = React.useState<string | null>(null);

  const handleCopyDetails = (e: React.MouseEvent, text: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedDetails(text);
    setTimeout(() => setCopiedDetails(null), 2000);
  };

  const handleScheduleClick = async (e: React.MouseEvent, toolId: string) => {
    e.stopPropagation();

    const newExpandedToolId = toolId === expandedToolId ? null : toolId;
    setExpandedToolId(newExpandedToolId);
  };

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

  const getIntegrationIcon = (integration: Integration) => {
    const iconName = getIntegrationIconName(integration);
    return iconName ? getSimpleIcon(iconName) : null;
  };

  const totalPages = Math.ceil(total / pageSize);

  if (showToolStepper) {
    return (
      <div className="max-w-none w-full min-h-full">
        <ToolCreateStepper onComplete={() => {
          setShowToolStepper(false);
          refreshConfigs();
        }} />
      </div>
    )
  }

  if (allConfigs.length === 0 && !loading && !isRefreshing) {
    setShowToolStepper(true);
  }

  return (
    <div className="p-8 max-w-none w-full min-h-full">
      <div className="flex flex-col lg:flex-row justify-between lg:items-center mb-6 gap-2">
        <h1 className="text-2xl font-bold">Tools</h1>
        <div className="flex gap-4">
          <Button onClick={handleTool}>
            <Plus className="mr-2 h-4 w-4" />
            Create
          </Button>
        </div>
      </div>

      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by ID or details..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={selectedIntegration} onValueChange={setSelectedIntegration}>
          <SelectTrigger className="w-[200px]">
            <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
            <SelectValue placeholder="Filter by integration" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Integrations</SelectItem>
            {integrations.map((integration) => (
              <SelectItem key={integration.id} value={integration.id}>
                {integration.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[60px]"></TableHead>
              <TableHead>ID</TableHead>
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
                      <p>Refresh Tools</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && allConfigs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  <Loader2 className="h-6 w-6 animate-spin text-foreground inline-block" />
                </TableCell>
              </TableRow>
            ) : configs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  No results found
                </TableCell>
              </TableRow>
            ) : (
              configs.map((config) => {
                const configType = (config as any).type;
                const isApi = configType === 'api';
                const isTool = configType === 'tool';

                const handleRunClick = (e: React.MouseEvent) => {
                  if (isApi) handlePlay(e, config.id);
                  else if (isTool) handlePlayTool(e, config.id);
                };

                return (
                  <React.Fragment key={`${configType}-${config.id}`}>
                    <TableRow
                      key={`${configType}-${config.id}`}
                      className="hover:bg-secondary"
                    // Consider adding onClick={() => handleRowClick(config)} if needed
                    >
                      <TableCell className="w-[60px]">
                        {isTool && (() => {
                          const tool = config as Tool;
                          const allIntegrationIds = new Set<string>();

                          if (tool.integrationIds) {
                            tool.integrationIds.forEach(id => allIntegrationIds.add(id));
                          }

                          if (tool.steps) {
                            tool.steps.forEach((step: any) => {
                              if (step.integrationId) {
                                allIntegrationIds.add(step.integrationId);
                              }
                            });
                          }

                          const integrationIdsArray = Array.from(allIntegrationIds);

                          return integrationIdsArray.length > 0 ? (
                            <div className="flex items-center justify-center gap-1 flex-shrink-0">
                              {integrationIdsArray.map((integrationId: string) => {
                                const integration = integrations.find(i => i.id === integrationId);
                                if (!integration) return null;
                                const icon = getIntegrationIcon(integration);
                                return icon ? (
                                  <TooltipProvider key={integrationId}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <svg
                                          width="14"
                                          height="14"
                                          viewBox="0 0 24 24"
                                          fill={`#${icon.hex}`}
                                          className="flex-shrink-0"
                                        >
                                          <path d={icon.path} />
                                        </svg>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>{integration.id}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                ) : (
                                  <TooltipProvider key={integrationId}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Globe className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>{integration.id}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                );
                              })}
                            </div>
                          ) : null;
                        })()}
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
                      <TableCell className="max-w-[300px] truncate relative group">
                        <div className="flex items-center space-x-1">
                          <span className="truncate">{config.instruction}</span>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={(e) => handleCopyDetails(e, config.instruction || '')}
                                >
                                  {copiedDetails === config.instruction ? (
                                    <Check className="h-3.5 w-3.5 text-green-500" />
                                  ) : (
                                    <Copy className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <p>{copiedDetails === config.instruction ? "Copied!" : "Copy details"}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </TableCell>
                      <TableCell className="w-[150px]">
                        {config.updatedAt ? new Date(config.updatedAt).toLocaleDateString() : (config.createdAt ? new Date(config.createdAt).toLocaleDateString() : '')}
                      </TableCell>
                      <TableCell className="w-[100px]">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="default"
                            size="sm"
                            onClick={handleRunClick}
                            className="gap-2"
                          >
                            {isTool ? <Hammer className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                            View
                          </Button>
                          {isTool && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => handleScheduleClick(e, config.id)}
                              className="gap-2"
                            >
                              <Calendar className="h-4 w-4" />
                              Schedules
                            </Button>
                          )}
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

                            {isApi && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => handleEdit(e, config.id)}
                                  >
                                    <Settings className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Edit Configuration</p>
                                </TooltipContent>
                              </Tooltip>
                            )}

                            {/* Delete Action (Available for all types) */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
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
                                <p>Delete {isApi ? 'Configuration' : 'Tool'}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </TableCell>
                    </TableRow>

                    {/* Expanded Details Row */}
                    {expandedToolId === config.id && (
                      <TableRow>
                        <TableCell colSpan={5} className="p-4">
                          <ToolSchedulesList toolId={config.id} refreshTrigger={scheduleRefreshTrigger} />
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })
            )}
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