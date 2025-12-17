"use client"

import { useIntegrations } from '@/src/app/integrations-context';
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";

import { ToolDeployModal } from '@/src/components/tools/deploy/ToolDeployModal';
import { FolderSelector, useFolderFilter } from '@/src/components/tools/FolderSelector';
import { InlineFolderPicker } from '@/src/components/tools/InlineFolderPicker';
import { CopyButton } from '@/src/components/tools/shared/CopyButton';
import { ToolActionsMenu } from '@/src/components/tools/ToolActionsMenu';
import { ToolCreateStepper } from '@/src/components/tools/ToolCreateStepper';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/src/components/ui/tooltip";
import { getIntegrationIcon as getIntegrationIconName } from '@/src/lib/general-utils';
import { Integration, Tool } from '@superglue/shared';
import { ArrowDown, ArrowUp, ArrowUpDown, CloudUpload, Globe, Hammer, Loader2, Plus, RotateCw, Search } from "lucide-react";
import { useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useState } from 'react';
import type { SimpleIcon } from 'simple-icons';
import * as simpleIcons from 'simple-icons';
import { useTools } from '../tools-context';

type SortColumn = 'id' | 'folder' | 'instruction' | 'updatedAt';
type SortDirection = 'asc' | 'desc';

const ConfigTable = () => {
  const router = useRouter();
  const {tools, isInitiallyLoading, isRefreshing, refreshTools} = useTools();
  const { integrations } = useIntegrations();

  const [currentConfigs, setCurrentConfigs] = useState<Tool[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(20);

  const [deployToolId, setDeployToolId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [manuallyOpenedStepper, setManuallyOpenedStepper] = useState(false);

  const [hasCompletedInitialLoad, setHasCompletedInitialLoad] = useState(false);
  const [sortColumn, setSortColumn] = useState<SortColumn>('updatedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const { selectedFolder, setSelectedFolder, filteredByFolder } = useFolderFilter(tools);

  const refreshConfigs = useCallback(async () => { 
      refreshTools();
  }, [refreshTools]);

  useEffect(() => {
    refreshConfigs();
  }, [refreshConfigs]);

  useEffect(() => {
    let filtered = filteredByFolder.filter(config => {
      if (!config) return false;

      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const configString = JSON.stringify(config).toLowerCase();
        if (!configString.includes(searchLower)) return false;
      }

      return true;
    });

    filtered = [...filtered].sort((a, b) => {
      const dir = sortDirection === 'asc' ? 1 : -1;
      switch (sortColumn) {
        case 'id':
          return dir * a.id.localeCompare(b.id);
        case 'folder':
          return dir * (a.folder || '').localeCompare(b.folder || '');
        case 'instruction':
          return dir * (a.instruction || '').localeCompare(b.instruction || '');
        case 'updatedAt':
          return dir * (new Date(a.updatedAt || a.createdAt).getTime() - new Date(b.updatedAt || b.createdAt).getTime());
        default:
          return 0;
      }
    });

    setTotal(filtered.length);

    const start = page * pageSize;
    const end = start + pageSize;
    setCurrentConfigs(filtered.slice(start, end));
  }, [page, filteredByFolder, searchTerm, sortColumn, sortDirection, pageSize]);

  useEffect(() => {
    setPage(0);
  }, [searchTerm, selectedFolder]);

  const handleTool = () => {
    setManuallyOpenedStepper(true);
  };

  const handlePlayTool = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    // Navigate to the tool page, passing the ID. The user can then run it.
    router.push(`/tools/${encodeURIComponent(id)}`);
  };

  const handleDeployClick = (e: React.MouseEvent, toolId: string) => {
    e.stopPropagation();
    setDeployToolId(toolId);
  };

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection(column === 'updatedAt' ? 'desc' : 'asc');
    }
  };

  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />;
    return sortDirection === 'asc' 
      ? <ArrowUp className="ml-1 h-3 w-3" /> 
      : <ArrowDown className="ml-1 h-3 w-3" />;
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

  useEffect(() => {
    if (!isInitiallyLoading && !hasCompletedInitialLoad) {
      setHasCompletedInitialLoad(true);
    }
  }, [isInitiallyLoading, hasCompletedInitialLoad]);

  const shouldShowStepper = manuallyOpenedStepper || (
    hasCompletedInitialLoad && 
    tools.length === 0
  );

  if (shouldShowStepper) {
    return (
      <div className="max-w-none w-full min-h-full">
        <ToolCreateStepper onComplete={() => {
          setManuallyOpenedStepper(false);
          refreshConfigs();
        }} />
      </div>
    )
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

      <div className="flex flex-wrap gap-3 mb-4">
        <FolderSelector 
          tools={tools}
          selectedFolder={selectedFolder}
          onFolderChange={setSelectedFolder}
        />
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by ID or details..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[60px]"></TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/50 select-none"
                onClick={() => handleSort('id')}
              >
                <div className="flex items-center">
                  ID
                  <SortIcon column="id" />
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/50 select-none"
                onClick={() => handleSort('folder')}
              >
                <div className="flex items-center">
                  Folder
                  <SortIcon column="folder" />
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/50 select-none"
                onClick={() => handleSort('instruction')}
              >
                <div className="flex items-center">
                  Instructions
                  <SortIcon column="instruction" />
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/50 select-none"
                onClick={() => handleSort('updatedAt')}
              >
                <div className="flex items-center">
                  Updated At
                  <SortIcon column="updatedAt" />
                </div>
              </TableHead>
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
            {isInitiallyLoading && tools.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  <Loader2 className="h-6 w-6 animate-spin text-foreground inline-block" />
                </TableCell>
              </TableRow>
            ) : currentConfigs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <span>{selectedFolder !== 'all' ? 'No tools in this folder' : 'No results found'}</span>
                    {selectedFolder !== 'all' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedFolder('all')}
                      >
                        Show all tools
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              currentConfigs.map((tool) => {
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

                return (
                  <TableRow
                    key={tool.id}
                    className="hover:bg-secondary"
                  >
                    <TableCell className="w-[60px]">
                      {integrationIdsArray.length > 0 ? (
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
                      ) : null}
                    </TableCell>
                    <TableCell className="font-medium max-w-[200px] truncate relative group">
                      <div className="flex items-center space-x-1">
                        <span className="truncate">{tool.id}</span>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <CopyButton text={tool.id} />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="w-[200px] min-w-[200px] max-w-[400px]">
                      <InlineFolderPicker tool={tool} />
                    </TableCell>
                    <TableCell className="max-w-[300px] truncate relative group">
                      <div className="flex items-center space-x-1">
                        <span className="truncate">{tool.instruction}</span>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <CopyButton text={tool.instruction || ''} />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="w-[150px]">
                      {tool.updatedAt ? new Date(tool.updatedAt).toLocaleDateString() : (tool.createdAt ? new Date(tool.createdAt).toLocaleDateString() : '')}
                    </TableCell>
                    <TableCell className="w-[140px]">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="default"
                          size="sm"
                          onClick={(e) => handlePlayTool(e, tool.id)}
                          className="gap-2"
                        >
                          <Hammer className="h-4 w-4" />
                          View
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => handleDeployClick(e, tool.id)}
                          className="gap-2"
                        >
                          <CloudUpload className="h-4 w-4" />
                          Deploy
                        </Button>
                        <ToolActionsMenu tool={tool} />
                      </div>
                    </TableCell>
                  </TableRow>
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

      {deployToolId && (
        <ToolDeployModal
          currentTool={tools.find(c => c.id === deployToolId) as Tool}
          payload={{}}
          isOpen={!!deployToolId}
          onClose={() => setDeployToolId(null)}
        />
      )}
    </div>
  );
};

export default ConfigTable;