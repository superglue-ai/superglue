"use client";

import React from "react";
import { useSchedules } from "@/src/app/schedules-context";
import { useConfig } from "@/src/app/config-context";
import { tokenRegistry } from "@/src/lib/token-registry";
import { ToolSchedule } from "@superglue/shared";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Switch } from "@/src/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { Dialog, DialogContent, DialogTitle } from "@/src/components/ui/dialog";
import { Clock, Edit, Loader2, RefreshCw, Trash2 } from "lucide-react";
import cronstrue from "cronstrue";
import { EESuperglueClient } from "@/src/lib/ee-superglue-client";
import ToolScheduleModal from "@/src/components/tools/deploy/ToolScheduleModal";

export function SchedulesView() {
  const { schedules, isInitiallyLoading, isRefreshing, refreshSchedules } = useSchedules();
  const config = useConfig();
  const [togglingSchedules, setTogglingSchedules] = React.useState<Record<string, boolean>>({});
  const [editingSchedule, setEditingSchedule] = React.useState<ToolSchedule | null>(null);

  // Sort schedules by nextRunAt for upcoming section
  const enabledSchedules = schedules.filter((s) => s.enabled);
  const upcomingSchedules = [...enabledSchedules]
    .sort((a, b) => new Date(a.nextRunAt).getTime() - new Date(b.nextRunAt).getTime())
    .slice(0, 10);

  // All schedules sorted by tool ID
  const allSchedules = [...schedules].sort((a, b) => a.toolId.localeCompare(b.toolId));

  const handleToggleSchedule = async (schedule: ToolSchedule, enabled: boolean) => {
    setTogglingSchedules((prev) => ({ ...prev, [schedule.id]: true }));

    try {
      const client = new EESuperglueClient({
        endpoint: config.superglueEndpoint,
        apiKey: tokenRegistry.getToken(),
        apiEndpoint: config.apiEndpoint,
      });

      await client.updateToolSchedule(schedule.toolId, schedule.id, { enabled });
      await refreshSchedules();
    } catch (error) {
      console.error("Error toggling schedule:", error);
    } finally {
      setTogglingSchedules((prev) => ({ ...prev, [schedule.id]: false }));
    }
  };

  const handleEditSchedule = (schedule: ToolSchedule) => {
    setEditingSchedule(schedule);
  };

  const handleCloseModal = () => {
    setEditingSchedule(null);
  };

  const handleSaveSchedule = async () => {
    await refreshSchedules();
    setEditingSchedule(null);
  };

  const [deletingSchedules, setDeletingSchedules] = React.useState<Record<string, boolean>>({});

  const handleDeleteSchedule = async (schedule: ToolSchedule) => {
    if (!confirm(`Are you sure you want to delete this schedule for ${schedule.toolId}?`)) {
      return;
    }

    setDeletingSchedules((prev) => ({ ...prev, [schedule.id]: true }));

    try {
      const client = new EESuperglueClient({
        endpoint: config.superglueEndpoint,
        apiKey: tokenRegistry.getToken(),
        apiEndpoint: config.apiEndpoint,
      });

      await client.deleteToolSchedule(schedule.toolId, schedule.id);
      await refreshSchedules();
    } catch (error) {
      console.error("Error deleting schedule:", error);
    } finally {
      setDeletingSchedules((prev) => ({ ...prev, [schedule.id]: false }));
    }
  };

  if (isInitiallyLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading schedules...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-8">
      <h1 className="text-2xl font-bold">Schedules</h1>

      {/* Upcoming Executions */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Upcoming Executions</h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refreshSchedules()}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {upcomingSchedules.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm border rounded-lg">
            No upcoming scheduled executions.
          </div>
        ) : (
          <div className="border rounded-lg divide-y">
            {upcomingSchedules.map((schedule) => {
              const nextRun = new Date(schedule.nextRunAt);
              const now = new Date();
              const diffMs = nextRun.getTime() - now.getTime();
              const diffMins = Math.floor(diffMs / (1000 * 60));
              const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

              let timeLabel = "";
              if (diffMins < 0) {
                timeLabel = "overdue";
              } else if (diffMins < 60) {
                timeLabel = `in ${diffMins} min`;
              } else if (diffHours < 24) {
                timeLabel = `in ${diffHours} hours`;
              } else {
                timeLabel = nextRun.toLocaleDateString();
              }

              return (
                <div
                  key={schedule.id}
                  className="flex items-center justify-between px-4 py-3 hover:bg-muted/50"
                >
                  <div className="flex items-center gap-4">
                    <div className="text-sm font-medium w-24">{timeLabel}</div>
                    <span className="font-mono text-sm">{schedule.toolId}</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {cronstrue.toString(schedule.cronExpression)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* All Schedulers */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-lg font-semibold">All Schedulers ({schedules.length})</h2>
        </div>

        {allSchedules.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm border rounded-lg">
            No schedulers configured.
          </div>
        ) : (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">Active</TableHead>
                  <TableHead className="w-[260px]">Tool</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead className="w-[180px]">Last Run</TableHead>
                  <TableHead className="w-[180px]">Next Run</TableHead>
                  <TableHead className="w-[90px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allSchedules.map((schedule) => (
                  <TableRow key={schedule.id}>
                    <TableCell>
                      <Switch
                        checked={schedule.enabled}
                        disabled={togglingSchedules[schedule.id]}
                        onCheckedChange={(checked) => handleToggleSchedule(schedule, checked)}
                      />
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-sm">{schedule.toolId}</span>
                    </TableCell>
                    <TableCell>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-sm">
                              {cronstrue.toString(schedule.cronExpression)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <code>{schedule.cronExpression}</code>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {schedule.lastRunAt ? new Date(schedule.lastRunAt).toLocaleString() : "Never"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {schedule.enabled ? (
                        new Date(schedule.nextRunAt).toLocaleString()
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditSchedule(schedule)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteSchedule(schedule)}
                          disabled={deletingSchedules[schedule.id]}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          {deletingSchedules[schedule.id] ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* Edit Schedule Modal */}
      <Dialog open={!!editingSchedule} onOpenChange={(open) => !open && handleCloseModal()}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogTitle className="sr-only">Edit Schedule</DialogTitle>
          {editingSchedule && (
            <ToolScheduleModal
              toolId={editingSchedule.toolId}
              isOpen={true}
              schedule={editingSchedule}
              onClose={handleCloseModal}
              onSave={handleSaveSchedule}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
