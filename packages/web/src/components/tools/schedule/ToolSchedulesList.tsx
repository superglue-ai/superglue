"use client"

import { Check, Edit, Loader2, Play, Plus, Trash2, X } from "lucide-react";
import React from 'react';

import { useConfig } from '@/src/app/config-context';
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Switch } from "@/src/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { useToast } from '@/src/hooks/use-toast';
import { tokenRegistry } from '@/src/lib/token-registry';
import { SuperglueClient, WorkflowSchedule as ToolSchedule } from '@superglue/client';
import cronstrue from 'cronstrue';
import ToolScheduleModal from './ToolScheduleModal';


const ToolSchedulesList = ({ toolId, refreshTrigger }: { toolId: string, refreshTrigger?: number }) => {
  const config = useConfig();
  const { toast } = useToast();
  const [toolSchedules, setToolSchedules] = React.useState<ToolSchedule[]>([]);
  const [loadingSchedules, setLoadingSchedules] = React.useState(false);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [modalSchedule, setModalSchedule] = React.useState<ToolSchedule | null>(null);
  const [executingSchedules, setExecutingSchedules] = React.useState<Record<string, 'loading' | 'success' | 'error'>>({});
  const [scheduleErrors, setScheduleErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    loadSchedules();
  }, [toolId]);

  React.useEffect(() => {
    if (refreshTrigger !== undefined && refreshTrigger > 0) {
      loadSchedules(false);
    }
  }, [refreshTrigger]);

  const loadSchedules = async (showLoading = true) => {
    if (showLoading) {
      setLoadingSchedules(true);
    }

    const superglueClient = new SuperglueClient({
      endpoint: config.superglueEndpoint,
      apiKey: tokenRegistry.getToken()
    });

    const schedules = await superglueClient.listWorkflowSchedules(toolId);

    setToolSchedules(schedules);
    setLoadingSchedules(false);
  };

  const handleScheduleDelete = async (e: React.MouseEvent, scheduleId: string) => {
    e.stopPropagation();

    // optimistic update
    setToolSchedules(prevSchedules =>
      prevSchedules.filter(schedule => schedule.id !== scheduleId)
    );

    const superglueClient = new SuperglueClient({
      endpoint: config.superglueEndpoint,
      apiKey: tokenRegistry.getToken()
    });

    await superglueClient.deleteWorkflowSchedule(scheduleId);

    // make sure server and client state are in sync
    loadSchedules(false);
  };

  const handleScheduleStateToggle = async (newState: boolean, scheduleId: string) => {
    // optimistic update
    setToolSchedules(prevSchedules =>
      prevSchedules.map(schedule =>
        schedule.id === scheduleId
          ? { ...schedule, enabled: newState }
          : schedule
      )
    );

    const superglueClient = new SuperglueClient({
      endpoint: config.superglueEndpoint,
      apiKey: tokenRegistry.getToken()
    });

    await superglueClient.upsertWorkflowSchedule({
      id: scheduleId,
      enabled: newState
    });

    // make sure server and client state are in sync (e.g. for nextRunAt)
    loadSchedules(false);
  };

  const handleRunNow = async (e: React.MouseEvent, scheduleId: string) => {
    e.stopPropagation();

    const schedule = toolSchedules.find(s => s.id === scheduleId);
    if (!schedule) return;

    setExecutingSchedules(prev => ({ ...prev, [scheduleId]: 'loading' }));

    try {
      const superglueClient = new SuperglueClient({
        endpoint: config.superglueEndpoint,
        apiKey: tokenRegistry.getToken()
      });

      const workflow = await superglueClient.getWorkflow(schedule.workflowId);
      if (!workflow) {
        throw new Error('Workflow not found');
      }

      const result = await superglueClient.executeWorkflow({
        workflow,
        payload: schedule.payload || {},
        options: schedule.options || {}
      });

      if (result.success) {
        setExecutingSchedules(prev => ({ ...prev, [scheduleId]: 'success' }));
        
        setTimeout(() => {
          setExecutingSchedules(prev => {
            const { [scheduleId]: _, ...rest } = prev;
            return rest;
          });
        }, 3000);
      } else {
        throw new Error(result.error || 'Execution failed');
      }

      loadSchedules(false);
    } catch (error: any) {
      const errorMessage = error.message || 'Unknown error';
      setExecutingSchedules(prev => ({ ...prev, [scheduleId]: 'error' }));
      setScheduleErrors(prev => ({ ...prev, [scheduleId]: errorMessage }));
      
      setTimeout(() => {
        setExecutingSchedules(prev => {
          const { [scheduleId]: _, ...rest } = prev;
          return rest;
        });
        setScheduleErrors(prev => {
          const { [scheduleId]: _, ...rest } = prev;
          return rest;
        });
      }, 10000);
    }
  };

  const handleModalOpen = (schedule?: ToolSchedule) => {
    setModalSchedule(schedule);
    setModalOpen(true);
  };

  const handleModalClose = () => {
    setModalOpen(false);
    setModalSchedule(null);
  };

  return (loadingSchedules ? (
    <div className="flex items-center justify-center py-8">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  ) : (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Schedules</h3>
        <Button size="sm" onClick={() => handleModalOpen()}>
          <Plus className="h-4 w-4 mr-2" />
          Add Schedule
        </Button>
      </div>
      {toolSchedules.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="text-muted-foreground text-sm mb-4">
            No schedules configured for this tool
          </div>
        </div>
      ) : (
        <div className="w-full overflow-x-auto">
          <Table className="w-full">
          <TableHeader>
            <TableRow className="!border-b">
              <TableHead className="pl-0">Enabled</TableHead>
              <TableHead>Schedule</TableHead>
              <TableHead>Cron</TableHead>
              <TableHead>Timezone</TableHead>
              <TableHead>Webhook</TableHead>
              <TableHead>
                Last Run
                <div className="text-xs text-muted-foreground font-normal">
                  (Local Time)
                </div>
              </TableHead>
              <TableHead>
                Next Run
                <div className="text-xs text-muted-foreground font-normal">
                  (Local Time)
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {toolSchedules.map((schedule) => (
              <TableRow key={schedule.id}>
                <TableCell className="w-[200px] pl-0">
                  <Switch
                    checked={schedule.enabled}
                    onCheckedChange={(newState) => handleScheduleStateToggle(newState, schedule.id)}
                    className="custom-switch"
                  />
                </TableCell>
                <TableCell className="w-[200px]">{cronstrue.toString(schedule.cronExpression)}</TableCell>
                <TableCell className="w-[200px]">{schedule.cronExpression}</TableCell>
                <TableCell className="w-[200px]">{schedule.timezone}</TableCell>
                <TableCell className="max-w-[300px]">
                  {schedule.options?.webhookUrl ? (
                    schedule.options.webhookUrl.startsWith('tool:') ? (
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">Tool</Badge>
                        <span className="text-xs font-mono truncate">{schedule.options.webhookUrl.substring(5)}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">URL</Badge>
                        <span className="text-xs font-mono truncate">{schedule.options.webhookUrl}</span>
                      </div>
                    )
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="w-[300px]">{schedule.lastRunAt ? new Date(schedule.lastRunAt).toLocaleString() : 'Never'}</TableCell>
                <TableCell className="w-[300px]">
                  {!schedule.enabled ? 'Disabled' : (new Date(schedule.nextRunAt).toLocaleString())}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <TooltipProvider delayDuration={0}>
                      <Tooltip open={executingSchedules[schedule.id] === 'success' || executingSchedules[schedule.id] === 'error'}>
                        <TooltipTrigger asChild>
                          <span className="inline-block">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={(e) => handleRunNow(e, schedule.id)}
                              disabled={!schedule.enabled || !!executingSchedules[schedule.id]}
                            >
                              {executingSchedules[schedule.id] === 'loading' && <Loader2 className="h-4 w-4 animate-spin" />}
                              {executingSchedules[schedule.id] === 'success' && <Check className="h-4 w-4 text-green-500" />}
                              {executingSchedules[schedule.id] === 'error' && <X className="h-4 w-4 text-red-500" />}
                              {!executingSchedules[schedule.id] && <Play className="h-4 w-4" />}
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          {executingSchedules[schedule.id] === 'success' && 'Executed successfully'}
                          {executingSchedules[schedule.id] === 'error' && scheduleErrors[schedule.id]}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <Button variant="ghost" size="icon" onClick={() => handleModalOpen(schedule)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost"
                      size="icon"
                      onClick={(e) => handleScheduleDelete(e, schedule.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      )}
      <ToolScheduleModal isOpen={modalOpen} toolId={toolId} schedule={modalSchedule} onClose={handleModalClose} onSave={loadSchedules} />
    </div>
  ));
};

export default ToolSchedulesList;