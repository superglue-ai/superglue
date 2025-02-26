"use client"

import { useConfig } from '@/src/app/config-context';
import ApiConfigDetail from '@/src/app/configs/[id]/page';
import { ConfigCreateStepper } from '@/src/components/config-stepper/ConfigCreateStepper';
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
  Sheet,
  SheetContent
} from "@/src/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/src/components/ui/tooltip";
import { ApiConfig, ExtractConfig, SuperglueClient } from '@superglue/client';
import { History, Play, Plus, RotateCw, Settings, ShoppingBag, Trash2 } from "lucide-react";
import { useRouter } from 'next/navigation';
import React from 'react';

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
  const [configToDelete, setConfigToDelete] = React.useState<ApiConfig | ExtractConfig | null>(null);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [showConfigStepper, setShowConfigStepper] = React.useState(false);
  const [configStepperProps, setConfigStepperProps] = React.useState({});

  const refreshConfigs = React.useCallback(async () => {
    setIsRefreshing(true);
    setLoading(true);
    try {
      const superglueClient = new SuperglueClient({
        endpoint: config.superglueEndpoint,
        apiKey: config.superglueApiKey
      });
      
      const [apiConfigs, extractConfigs] = await Promise.all([
        superglueClient.listApis(1000, 0),
        superglueClient.listExtracts(1000, 0)
      ]);

      const combinedConfigs = [
        ...apiConfigs.items.map(item => ({ ...item, type: 'api' })), 
        ...extractConfigs.items.map(item => ({ ...item, type: 'extract' }))
      ].sort((a, b) => {
        const dateA = new Date(a.updatedAt || a.createdAt).getTime();
        const dateB = new Date(b.updatedAt || b.createdAt).getTime();
        return dateB - dateA;
      });

      const start = page * pageSize;
      const end = start + pageSize;
      setConfigs(combinedConfigs.slice(start, end));
      setTotal(combinedConfigs.length);
    } catch (error) {
      console.error('Error fetching configs:', error);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [config, page, pageSize]);

  React.useEffect(() => {
    refreshConfigs();
  }, [refreshConfigs]);

  const handleCreateNew = () => {
    router.push('/configs/new');
  };

  const handleCreateNewExtract = () => {
    router.push('/extracts/new');
  };

  const handleCreateExampleShopify = () => {
    // Create detailed prefill configuration with the Shopify example values
    const shopifyPrefillData = {
      fullUrl: 'https://timbuk2.com',
      instruction: 'get me all products with name and price',
      documentationUrl: ''
    };
    
    // Set prefill data in configStepperProps
    setConfigStepperProps({
      prefillData: shopifyPrefillData
    });
    
    // Reset any existing config states to ensure a clean start
    setShowConfigStepper(false);
    
    // Short timeout to ensure state changes are processed before opening
    setTimeout(() => {
      setShowConfigStepper(true);
    }, 50); // Increased timeout to ensure state updates are processed
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

  const handleDelete = async () => {
    if (!configToDelete) return;
    
    try {
      const superglueClient = new SuperglueClient({
        endpoint: config.superglueEndpoint,
        apiKey: config.superglueApiKey
      });

      if ((configToDelete as any)?.type === 'api') {
        await superglueClient.deleteApi(configToDelete.id);
      } else if ((configToDelete as any)?.type === 'extract') {
        await superglueClient.deleteExtraction(configToDelete.id);
      }

      setConfigToDelete(null);
      refreshConfigs();
    } catch (error) {
      console.error('Error deleting config:', error);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  if (loading) {
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
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  if (configs.length === 0) {
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

        <div className="flex flex-col items-center justify-center py-16">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 w-full max-w-4xl">
            <Button 
              onClick={handleCreateNew} 
              className="h-64 shadow-md hover:shadow-lg transition-all duration-300 rounded-2xl bg-card border border-primary/20 hover:border-primary/30"
              variant="outline"
              size="lg"
            >
              <div className="flex flex-col items-center justify-center gap-7">
                <div className="p-6 rounded-full bg-primary/10 hover:bg-primary/15 transition-colors duration-300">
                  <Plus className="h-16 w-16 text-primary" strokeWidth={1.5} />
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-2xl font-semibold mb-2">Add new API</span>
                  <span className="text-muted-foreground text-sm max-w-[12rem] text-center">One click connect to any API</span>
                </div>
              </div>
            </Button>
            
            <Button 
              onClick={handleCreateNewExtract} 
              className="h-64 shadow-md hover:shadow-lg transition-all duration-300 rounded-2xl bg-card border border-primary/20 hover:border-primary/30"
              variant="outline"
              size="lg"
            >
              <div className="flex flex-col items-center justify-center gap-7">
                <div className="p-6 rounded-full bg-primary/10 hover:bg-primary/15 transition-colors duration-300">
                  <Plus className="h-16 w-16 text-primary" strokeWidth={1.5} />
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-2xl font-semibold mb-2">Add new File</span>
                  <span className="text-muted-foreground text-sm max-w-[12rem] text-center">Map any file to your structure</span>
                </div>
              </div>
            </Button>
            
            <Button 
              onClick={handleCreateExampleShopify}
              className="h-40 md:col-span-2 shadow-md hover:shadow-lg transition-all duration-300 rounded-2xl bg-card border border-primary/20 hover:border-primary/30"
              variant="outline"
              size="lg"
            >
              <div className="flex items-center justify-center gap-10">
                <div className="p-6 rounded-full bg-primary/10 hover:bg-primary/15 transition-colors duration-300">
                  <ShoppingBag className="h-16 w-16 text-primary" strokeWidth={1.5} />
                </div>
                <div className="flex flex-col items-start">
                  <span className="text-2xl font-semibold mb-2">Create Example Shopify API</span>
                  <span className="text-muted-foreground text-sm max-w-[16rem]">Get product data with one click in your format</span>
                </div>
              </div>
            </Button>
          </div>
        </div>
        
        {showConfigStepper && (
          <ConfigCreateStepper
            open={showConfigStepper}
            onOpenChange={setShowConfigStepper}
            mode="create"
            onComplete={refreshConfigs}
            {...configStepperProps}
          />
        )}
      </div>
    );
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
            {configs.map((config) => (
              <TableRow
                key={config.id}
                className="hover:bg-secondary"
              >
                <TableCell className="w-[100px]">
                <Button
                        variant="secondary"
                        size="sm"
                        onClick={(e) => (config as any).type === 'extract' ? handlePlayExtract(e, config.id) : handlePlay(e, config.id)}
                        className="gap-2"
                      >
                        <Play className="h-4 w-4" />
                        Run
                </Button>
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
                  <div className="flex justify-end gap-2">
                    <TooltipProvider>
                      {(config as any).type === 'api' && (
                        <>
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
                        </>
                      )}

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
                          <p>Delete Configuration</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
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

      {showConfigStepper && (
        <ConfigCreateStepper
          open={showConfigStepper}
          onOpenChange={setShowConfigStepper}
          mode="create"
          onComplete={refreshConfigs}
          {...configStepperProps}
        />
      )}
    </div>
  );
};

export default ConfigTable;