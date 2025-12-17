"use client"

import { Check, Edit, Loader2, Play, Plus, Square, Trash2, X } from "lucide-react";
import React from 'react';

import { useConfig } from '@/src/app/config-context';
import { useSchedules } from '@/src/app/schedules-context';
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { StatusTooltip } from "@/src/components/ui/status-tooltip";
import { Switch } from "@/src/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { abortExecution, generateUUID, shouldDebounceAbort } from '@/src/lib/client-utils';
import { tokenRegistry } from '@/src/lib/token-registry';
import { SuperglueClient, ToolSchedule } from '@superglue/shared';
import cronstrue from 'cronstrue';
import ToolScheduleModal from './ToolScheduleModal';


const ToolSchedulesList = ({ toolId, refreshTrigger }: { toolId: string, refreshTrigger?: number }) => {
  const config = useConfig();
  const { getSchedulesForTool, isInitiallyLoading, refreshSchedules } = useSchedules();
  const toolSchedules = getSchedulesForTool(toolId);
  
  const [showForm, setShowForm] = React.useState(false);
  const [editingSchedule, setEditingSchedule] = React.useState<ToolSchedule | null>(null);
  const [executingSchedules, setExecutingSchedules] = React.useState<Record<string, 'loading' | 'success' | 'error'>>({});
  const [scheduleStatus, setScheduleStatus] = React.useState<Record<string, { status: 'success' | 'error', message: string }>>({});
  const [currentRunIds, setCurrentRunIds] = React.useState<Record<string, string>>({});
  const lastAbortTimesRef = React.useRef<Record<string, number>>({});

  React.useEffect(() => {
    if (refreshTrigger !== undefined && refreshTrigger > 0) {
      refreshSchedules();
    }
  }, [refreshTrigger]);

  const handleScheduleDelete = async (e: React.MouseEvent, scheduleId: string) => {
    e.stopPropagation();

    const superglueClient = new SuperglueClient({
      endpoint: config.superglueEndpoint,
      apiKey: tokenRegistry.getToken()
    });

    await superglueClient.deleteWorkflowSchedule(scheduleId);
    refreshSchedules();
  };

  const handleScheduleStateToggle = async (newState: boolean, scheduleId: string) => {
    const superglueClient = new SuperglueClient({
      endpoint: config.superglueEndpoint,
      apiKey: tokenRegistry.getToken()
    });

    await superglueClient.upsertWorkflowSchedule({
      id: scheduleId,
      enabled: newState
    });

    refreshSchedules();
  };

  const handleRunNow = async (e: React.MouseEvent, scheduleId: string) => {
    e.stopPropagation();

    const schedule = toolSchedules.find(s => s.id === scheduleId);
    if (!schedule) return;

    const runId = generateUUID();
    setCurrentRunIds(prev => ({ ...prev, [scheduleId]: runId }));
    setExecutingSchedules(prev => ({ ...prev, [scheduleId]: 'loading' }));

    try {
      const superglueClient = new SuperglueClient({
        endpoint: config.superglueEndpoint,
        apiKey: tokenRegistry.getToken()
      });

      const tool = await superglueClient.getWorkflow(schedule.workflowId);
      if (!tool) {
        throw new Error('Workflow not found');
      }

      const result = await superglueClient.executeWorkflow({
        tool: tool,
        payload: schedule.payload || {},
        options: schedule.options || {},
        runId
      });

      if (result.success) {
        setExecutingSchedules(prev => ({ ...prev, [scheduleId]: 'success' }));
        setScheduleStatus(prev => ({ ...prev, [scheduleId]: { status: 'success', message: 'Executed successfully' } }));
      } else {
        throw new Error(result.error || 'Execution failed');
      }

      refreshSchedules();
    } catch (error: any) {
      const errorMessage = error.message || 'Unknown error';
      setExecutingSchedules(prev => ({ ...prev, [scheduleId]: 'error' }));
      setScheduleStatus(prev => ({ ...prev, [scheduleId]: { status: 'error', message: errorMessage } }));
    } finally {
      setCurrentRunIds(prev => {
        const newState = { ...prev };
        delete newState[scheduleId];
        return newState;
      });
    }
  };

  const handleAbortSchedule = async (e: React.MouseEvent, scheduleId: string) => {
    e.stopPropagation();
    
    const lastAbortTime = lastAbortTimesRef.current[scheduleId] || 0;
    if (shouldDebounceAbort(lastAbortTime)) return;
    
    const runId = currentRunIds[scheduleId];
    if (!runId) return;

    lastAbortTimesRef.current[scheduleId] = Date.now();

    const superglueClient = new SuperglueClient({
      endpoint: config.superglueEndpoint,
      apiKey: tokenRegistry.getToken()
    });

    const success = await abortExecution(superglueClient, runId);
    if (success) {
      setExecutingSchedules(prev => {
        const newState = { ...prev };
        delete newState[scheduleId];
        return newState;
      });
      setScheduleStatus(prev => ({ ...prev, [scheduleId]: { status: 'error', message: 'Aborted' } }));
    }
  };

  const handleFormOpen = (schedule?: ToolSchedule) => {
    setEditingSchedule(schedule || null);
    setShowForm(true);
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingSchedule(null);
  };

  const handleFormSave = () => {
    handleFormClose();
    refreshSchedules();
  };

  if (isInitiallyLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (showForm) {
    return (
      <ToolScheduleModal 
      isOpen={true} 
      toolId={toolId} 
      schedule={editingSchedule || undefined} 
      onClose={handleFormClose} 
      onSave={handleFormSave} 
    />
);
  }

  return (
    <div className="">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Schedules</h3>
        <Button size="sm" onClick={() => handleFormOpen()}>
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
              <TableHead className="pl-0 w-[60px]">Active</TableHead>
              <TableHead>Schedule</TableHead>
              <TableHead>On Success</TableHead>
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
                    <StatusTooltip
                      status={scheduleStatus[schedule.id]?.status || null}
                      message={scheduleStatus[schedule.id]?.message}
                      onDismiss={() => {
                        setExecutingSchedules(prev => {
                          const { [schedule.id]: _, ...rest } = prev;
                          return rest;
                        });
                        setScheduleStatus(prev => {
                          const { [schedule.id]: _, ...rest } = prev;
                          return rest;
                        });
                      }}
                    >
                      <span className="inline-block">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={(e) => executingSchedules[schedule.id] === 'loading' ? handleAbortSchedule(e, schedule.id) : handleRunNow(e, schedule.id)}
                          disabled={executingSchedules[schedule.id] === 'success' || executingSchedules[schedule.id] === 'error'}
                        >
                          {executingSchedules[schedule.id] === 'loading' && <Square className="h-4 w-4" />}
                          {executingSchedules[schedule.id] === 'success' && <Check className="h-4 w-4 text-green-500" />}
                          {executingSchedules[schedule.id] === 'error' && <X className="h-4 w-4 text-amber-600" />}
                          {!executingSchedules[schedule.id] && <Play className="h-4 w-4" />}
                        </Button>
                      </span>
                    </StatusTooltip>
                    <Button variant="ghost" size="icon" onClick={() => handleFormOpen(schedule)}>
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
    </div>
  );
};

export default ToolSchedulesList;