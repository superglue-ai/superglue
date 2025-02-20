"use client"

import React from 'react';
import { useRouter } from 'next/navigation';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { Button } from "@/src/components/ui/button";
import { Plus, Settings, Play, History } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/src/components/ui/sheet"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/src/components/ui/tooltip"
import ApiConfigDetail from '@/src/app/configs/[id]/page';
import { ApiConfig, ExtractConfig } from '@superglue/client';
import { useConfig } from '@/src/app/config-context';
import { SuperglueClient } from '@superglue/client';
import { Badge } from "@/src/components/ui/badge";

const ConfigTable = () => {
  const router = useRouter();
  const [configs, setConfigs] = React.useState<(ApiConfig | ExtractConfig)[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedConfig, setSelectedConfig] = React.useState<ApiConfig | ExtractConfig | null>(null);
  const [isDetailOpen, setIsDetailOpen] = React.useState(false);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(0);
  const [pageSize] = React.useState(20);
  const config = useConfig();

  React.useEffect(() => {
    const getConfigs = async () => {
      try {
        const superglueClient = new SuperglueClient({
          endpoint: config.superglueEndpoint,
          apiKey: config.superglueApiKey
        });
        
        const [apiConfigs, extractConfigs] = await Promise.all([
          superglueClient.listApis(1000, 0),  // Get up to 1000 configs
          superglueClient.listExtracts(1000, 0)  // Get up to 1000 configs
        ]);

        const combinedConfigs = [
          ...apiConfigs.items.map(item => ({ ...item, type: 'api' })), 
          ...extractConfigs.items.map(item => ({ ...item, type: 'extract' }))
        ]
          .sort((a, b) => {
            const dateA = new Date(a.updatedAt || a.createdAt).getTime();
            const dateB = new Date(b.updatedAt || b.createdAt).getTime();
            return dateB - dateA; // Sort in descending order (newest first)
          });

        // Handle pagination client-side
        const start = page * pageSize;
        const end = start + pageSize;
        setConfigs(combinedConfigs.slice(start, end));
        setTotal(combinedConfigs.length);
      } catch (error) {
        console.error('Error fetching configs:', error);
      } finally {
        setLoading(false);
      }
    };

    getConfigs();
  }, [page, pageSize]);

  const handleRowClick = (config: ApiConfig | ExtractConfig) => {
    if ((config as any).type === 'api') {
      setSelectedConfig(config);
      setIsDetailOpen(true);
    }
  };

  const handleCreateNew = () => {
    router.push('/configs/new');
  };

  const handleCreateNewExtract = () => {
    router.push('/extracts/new');
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

  const handleViewLogs = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    router.push(`/runs/${id}`);
  };

  const totalPages = Math.ceil(total / pageSize);

  if (loading) {
    return "";
  }

  return (
    <div className="p-8 max-w-none w-full min-h-full">
      <div className="flex flex-col lg:flex-row justify-between lg:items-center mb-6 gap-2">
        <h1 className="text-2xl font-bold">Configurations</h1>
        <div className="flex gap-4">
          <Button onClick={handleCreateNewExtract}>
            <Plus className="mr-2 h-4 w-4" />
            New File
          </Button>
          <Button onClick={handleCreateNew}>
            <Plus className="mr-2 h-4 w-4" />
            New API
          </Button>
        </div>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead></TableHead>
              <TableHead>ID</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Instruction</TableHead>
              <TableHead>URL</TableHead>
              <TableHead>Updated At</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {configs.map((config) => (
              <TableRow
                key={config.id}
                onClick={() => handleRowClick(config)}
                className="cursor-pointer hover:bg-secondary"
              >
                <TableCell className="w-[100px]">
                  <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={(e) => (config as any).type === 'extract' ? handlePlayExtract(e, config.id) : handlePlay(e, config.id)}
                        className="gap-2"
                      >
                        <Play className="h-4 w-4" />
                        Run
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Run API</p>
                    </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableCell>
                <TableCell className="font-medium max-w-[100px] truncate">
                  {config.id}
                </TableCell>
                <TableCell>
                  <Badge variant={(config as any).type === 'extract' ? 'default' : 'secondary'}>
                    {(config as any).type === 'extract' ? 'Extract' : 'API'}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-[300px] truncate">
                  {config.instruction}
                </TableCell>
                <TableCell className="font-medium max-w-[200px] truncate">
                  {config.urlHost}
                </TableCell>
                <TableCell className="w-[150px]">
                  {config.updatedAt ? new Date(config.updatedAt).toLocaleDateString() : ''}
                </TableCell>
                <TableCell className="w-[100px]">
                {(config as any).type === 'api' && (
                  <div className="flex gap-2"></div>
                )}
                  {(config as any).type === 'api' && (
                    <div className="flex gap-2">
                      <TooltipProvider>
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
                      </TooltipProvider>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
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

      <Sheet open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <SheetContent side="right" className="w-[800px] max-w-full">
          {selectedConfig && (
            <ApiConfigDetail id={selectedConfig.id} />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default ConfigTable;