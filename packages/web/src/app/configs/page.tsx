"use client"

import React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Image from 'next/image';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { Button } from "@/src/components/ui/button";
import { Plus, Settings, Play } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/src/components/ui/sheet"
import ApiConfigDetail from '@/src/app/configs/[id]/page';
import { ApiConfig } from '@superglue/shared';
import { useConfig } from '@/src/app/config-context';
import { SuperglueClient } from '@superglue/superglue';
const ConfigTable = () => {
  const router = useRouter();
  const [configs, setConfigs] = React.useState<ApiConfig[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedConfig, setSelectedConfig] = React.useState<ApiConfig | null>(null);
  const [isDetailOpen, setIsDetailOpen] = React.useState(false);
  const config = useConfig();

  React.useEffect(() => {
    const getConfigs = async () => {
      try {
        const superglueClient = new SuperglueClient({
          endpoint: config.superglueEndpoint,
          apiKey: config.superglueApiKey
        })
        const apiConfigs = await superglueClient.listApis(50, 0);
        setConfigs(apiConfigs.items);
      } catch (error) {
        console.error('Error fetching configs:', error);
      } finally {
        setLoading(false);
      }
    };

    getConfigs();
  }, []);

  const handleRowClick = (config: ApiConfig) => {
    setSelectedConfig(config);
    setIsDetailOpen(true);
  };

  const handleCreateNew = () => {
    router.push('/configs/new');
  };

  const handleEdit = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    router.push(`/configs/${id}/edit`);
  };

  const handlePlay = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    router.push(`/configs/${id}/run`);
  };

  if (loading) {
    return "";
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">API Configurations</h1>
          <Button onClick={handleCreateNew}>
            <Plus className="mr-2 h-4 w-4" />
            Create New
          </Button>
        </div>

        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Instruction</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Method</TableHead>
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
                  <TableCell className="font-medium max-w-[100px] truncate">
                    {config.id}
                  </TableCell>
                  <TableCell className="max-w-[300px] truncate">
                    {config.instruction}
                  </TableCell>
                  <TableCell className="font-medium max-w-[200px] truncate">
                    {config.urlHost}
                  </TableCell>
                  <TableCell className="w-[100px]">{config.method}</TableCell>
                  <TableCell className="w-[150px]">
                    {config.updatedAt ? new Date(config.updatedAt).toLocaleDateString() : ''}
                  </TableCell>
                  <TableCell className="w-[100px]">
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => handlePlay(e, config.id)}
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => handleEdit(e, config.id)}
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Sheet open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <SheetContent side="right" className="w-[800px] sm:max-w-[600px]">
          <SheetHeader>
            <SheetTitle>API Configuration Details</SheetTitle>
          </SheetHeader>
          {selectedConfig && (
            <ApiConfigDetail id={selectedConfig.id} />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default ConfigTable;