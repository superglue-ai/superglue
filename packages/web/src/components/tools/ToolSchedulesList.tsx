"use client"

import { Edit, Loader2, Plus, Trash2 } from "lucide-react";
import React from 'react';

import { useConfig } from '@/src/app/config-context';
import { tokenRegistry } from '@/src/lib/token-registry';
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
import { SuperglueClient, WorkflowSchedule as ToolSchedule } from '@superglue/client';
import cronstrue from 'cronstrue';
import ToolScheduleModal from './ToolScheduleModal';


const ToolSchedulesList = ({ toolId }: { toolId: string }) => {
  const config = useConfig();
  const [toolSchedules, setToolSchedules] = React.useState<ToolSchedule[]>([]);
  const [loadingSchedules, setLoadingSchedules] = React.useState(false);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [modalSchedule, setModalSchedule] = React.useState<ToolSchedule | null>(null);

  React.useEffect(() => {
    loadSchedules();
  }, [toolId]);

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
      <div className="flex justify-between items-center">
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
        <Table className="mt-1">
          <TableHeader>
            <TableRow className="!border-b">
              <TableHead className="pl-0">Enabled</TableHead>
              <TableHead>Schedule</TableHead>
              <TableHead>Cron</TableHead>
              <TableHead>Timezone</TableHead>
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
                <TableCell className="w-[300px]">{schedule.lastRunAt ? new Date(schedule.lastRunAt).toLocaleString() : 'Never'}</TableCell>
                <TableCell className="w-[300px]">
                  {!schedule.enabled ? 'Disabled' : (new Date(schedule.nextRunAt).toLocaleString())}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
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
      )}
      <ToolScheduleModal isOpen={modalOpen} toolId={toolId} schedule={modalSchedule} onClose={handleModalClose} onSave={loadSchedules} />
    </div>
  ));
};

export default ToolSchedulesList;