"use client";

import { Edit, Loader2, Play, Plus, RefreshCw, Square, Trash2 } from "lucide-react";
import React, { useCallback, useEffect } from "react";

import { useConfig } from "@/src/app/config-context";
import { useSchedules } from "@/src/app/schedules-context";
import { RunsList } from "@/src/components/runs/RunsList";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Switch } from "@/src/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import {
  createSuperglueClient,
  generateUUID,
  abortExecution,
  shouldDebounceAbort,
} from "@/src/lib/client-utils";
import { tokenRegistry } from "@/src/lib/token-registry";
import { Run, ToolSchedule } from "@superglue/shared";
import cronstrue from "cronstrue";
import { EESuperglueClient } from "../../../lib/ee-superglue-client";
import ToolScheduleModal from "./ToolScheduleModal";

const ToolSchedulesList = ({
  toolId,
  refreshTrigger,
}: {
  toolId: string;
  refreshTrigger?: number;
}) => {
  const config = useConfig();
  const { getSchedulesForTool, isInitiallyLoading, refreshSchedules } = useSchedules();
  const toolSchedules = getSchedulesForTool(toolId);

  const [showForm, setShowForm] = React.useState(false);
  const [editingSchedule, setEditingSchedule] = React.useState<ToolSchedule | null>(null);
  const [executingSchedules, setExecutingSchedules] = React.useState<Record<string, boolean>>({});
  const [currentRunIds, setCurrentRunIds] = React.useState<Record<string, string>>({});
  const lastAbortTimesRef = React.useRef<Record<string, number>>({});

  // Recent runs state
  const [recentRuns, setRecentRuns] = React.useState<Run[]>([]);
  const [runsLoading, setRunsLoading] = React.useState(false);
  const [runsError, setRunsError] = React.useState<string | null>(null);
  const [runsLastUpdated, setRunsLastUpdated] = React.useState<Date | null>(null);

  useEffect(() => {
    if (refreshTrigger !== undefined && refreshTrigger > 0) {
      refreshSchedules();
    }
  }, [refreshTrigger]);

  const fetchRecentRuns = useCallback(async () => {
    setRunsLoading(true);
    setRunsError(null);
    try {
      const client = createSuperglueClient(config.superglueEndpoint);
      const result = await client.listRuns({
        toolId: toolId,
        requestSources: ["scheduler", "frontend"],
        limit: 20,
      });
      const allRuns = result.items.sort(
        (a, b) =>
          new Date(b.metadata?.startedAt ?? 0).getTime() -
          new Date(a.metadata?.startedAt ?? 0).getTime(),
      );
      setRecentRuns(allRuns.slice(0, 10));
      setRunsLastUpdated(new Date());
    } catch (err: any) {
      setRunsError(err.message || "Failed to fetch runs");
    } finally {
      setRunsLoading(false);
    }
  }, [config.superglueEndpoint, toolId]);

  useEffect(() => {
    if (!runsLastUpdated) {
      fetchRecentRuns();
    }
  }, [fetchRecentRuns, runsLastUpdated]);

  const handleScheduleDelete = async (e: React.MouseEvent, scheduleId: string) => {
    e.stopPropagation();

    const superglueClient = new EESuperglueClient({
      endpoint: config.superglueEndpoint,
      apiKey: tokenRegistry.getToken(),
      apiEndpoint: config.apiEndpoint,
    });

    await superglueClient.deleteToolSchedule(toolId, scheduleId);
    refreshSchedules();
  };

  const handleScheduleStateToggle = async (newState: boolean, scheduleId: string) => {
    const superglueClient = new EESuperglueClient({
      endpoint: config.superglueEndpoint,
      apiKey: tokenRegistry.getToken(),
      apiEndpoint: config.apiEndpoint,
    });

    await superglueClient.updateToolSchedule(toolId, scheduleId, {
      enabled: newState,
    });

    refreshSchedules();
  };

  const handleRunNow = async (e: React.MouseEvent, scheduleId: string) => {
    e.stopPropagation();

    const schedule = toolSchedules.find((s) => s.id === scheduleId);
    if (!schedule) return;

    const runId = generateUUID();
    setCurrentRunIds((prev) => ({ ...prev, [scheduleId]: runId }));
    setExecutingSchedules((prev) => ({ ...prev, [scheduleId]: true }));

    try {
      const superglueClient = new EESuperglueClient({
        endpoint: config.superglueEndpoint,
        apiKey: tokenRegistry.getToken(),
        apiEndpoint: config.apiEndpoint,
      });

      const tool = await superglueClient.getWorkflow(schedule.toolId);
      if (!tool) {
        throw new Error("Tool not found");
      }

      await superglueClient.executeWorkflow({
        tool: tool,
        payload: schedule.payload || {},
        options: schedule.options || {},
        runId,
      });

      refreshSchedules();
    } catch (error: any) {
      console.error("Failed to run schedule:", error);
    } finally {
      setExecutingSchedules((prev) => ({ ...prev, [scheduleId]: false }));
      setCurrentRunIds((prev) => {
        const newState = { ...prev };
        delete newState[scheduleId];
        return newState;
      });
      // Refresh runs list to show the new run (success or failure)
      fetchRecentRuns();
    }
  };

  const handleAbortSchedule = async (e: React.MouseEvent, scheduleId: string) => {
    e.stopPropagation();

    const lastAbortTime = lastAbortTimesRef.current[scheduleId] || 0;
    if (shouldDebounceAbort(lastAbortTime)) return;

    const runId = currentRunIds[scheduleId];
    if (!runId) return;

    lastAbortTimesRef.current[scheduleId] = Date.now();

    const superglueClient = new EESuperglueClient({
      endpoint: config.superglueEndpoint,
      apiKey: tokenRegistry.getToken(),
      apiEndpoint: config.apiEndpoint,
    });

    const success = await abortExecution(superglueClient, runId);
    if (success) {
      setExecutingSchedules((prev) => ({ ...prev, [scheduleId]: false }));
      setCurrentRunIds((prev) => {
        const newState = { ...prev };
        delete newState[scheduleId];
        return newState;
      });
      fetchRecentRuns();
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
        <Button variant="outline" className="h-9 px-4" onClick={() => handleFormOpen()}>
          <Plus className="h-4 w-4" />
          Add Schedule
        </Button>
      </div>
      {toolSchedules.length === 0 ? (
        <div className="flex items-center justify-center py-4 text-center">
          <div className="text-muted-foreground text-sm">No schedules configured for this tool</div>
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
                  <div className="text-xs text-muted-foreground font-normal">(Local Time)</div>
                </TableHead>
                <TableHead>
                  Next Run
                  <div className="text-xs text-muted-foreground font-normal">(Local Time)</div>
                </TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {toolSchedules.map((schedule) => (
                <TableRow key={schedule.id}>
                  <TableCell className="w-[200px] pl-0">
                    <Switch
                      checked={schedule.enabled}
                      onCheckedChange={(newState) =>
                        handleScheduleStateToggle(newState, schedule.id)
                      }
                      className="custom-switch"
                    />
                  </TableCell>
                  <TableCell className="w-[200px]">
                    {cronstrue.toString(schedule.cronExpression)}
                  </TableCell>
                  <TableCell className="max-w-[300px]">
                    {schedule.options?.webhookUrl ? (
                      schedule.options.webhookUrl.startsWith("tool:") ? (
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">Tool</Badge>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-xs font-mono truncate">
                                  {schedule.options.webhookUrl.substring(5)}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{schedule.options.webhookUrl.substring(5)}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">URL</Badge>
                          <span className="text-xs font-mono truncate">
                            {schedule.options.webhookUrl}
                          </span>
                        </div>
                      )
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="w-[300px]">
                    {schedule.lastRunAt ? new Date(schedule.lastRunAt).toLocaleString() : "Never"}
                  </TableCell>
                  <TableCell className="w-[300px]">
                    {!schedule.enabled ? "Disabled" : new Date(schedule.nextRunAt).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) =>
                          executingSchedules[schedule.id]
                            ? handleAbortSchedule(e, schedule.id)
                            : handleRunNow(e, schedule.id)
                        }
                      >
                        {executingSchedules[schedule.id] ? (
                          <Square className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleFormOpen(schedule)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => handleScheduleDelete(e, schedule.id)}
                      >
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

      {/* Recent Runs Section */}
      <div className="space-y-2 pt-4 mt-4 border-t border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Recent Runs</span>
            {runsLastUpdated && (
              <span className="text-[10px] text-muted-foreground/70">
                Updated {runsLastUpdated.toLocaleTimeString()}
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchRecentRuns()}
            disabled={runsLoading}
            className="h-6 px-2"
          >
            <RefreshCw className={`h-3 w-3 ${runsLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {runsError ? (
          <div className="text-xs text-destructive bg-destructive/10 rounded-md p-2">
            {runsError}
          </div>
        ) : (
          <RunsList runs={recentRuns} loading={runsLoading} emptyMessage="No runs yet." />
        )}
      </div>
    </div>
  );
};

export default ToolSchedulesList;
