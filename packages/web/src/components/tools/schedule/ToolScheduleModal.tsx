import { useConfig } from '@/src/app/config-context';
import { Switch } from "@/src/components/ui/switch";
import { useToast } from '@/src/hooks/use-toast';
import { createSuperglueClient } from '@/src/lib/client-utils';
import { cn, getGroupedTimezones } from '@/src/lib/general-utils';
import { tokenRegistry } from '@/src/lib/token-registry';
import { SuperglueClient, Workflow as Tool, WorkflowSchedule as ToolSchedule } from '@superglue/client';
import { validateCronExpression } from '@superglue/shared';
import { Check, ChevronRight, ChevronsUpDown, Loader2 } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { JsonCodeEditor } from '../../editors/JsonCodeEditor';
import { Button } from '../../ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '../../ui/card';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../../ui/command';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { HelpTooltip } from '../../utils/HelpTooltip';

const DEFAULT_SCHEDULES = [
  { value: '*/5 * * * *', label: 'Every 5 minutes' },
  { value: '*/30 * * * *', label: 'Every 30 minutes' },
  { value: '0 * * * *', label: 'Hourly' },
  { value: '0 0 * * *', label: 'Daily at midnight' },
  { value: '0 0 * * 0', label: 'Weekly on Sunday at midnight' },
  { value: '0 0 1 * *', label: 'Monthly on the 1st' },
];

interface ToolScheduleModalProps {
  toolId: string;
  isOpen: boolean;
  schedule?: ToolSchedule;
  onClose: () => void;
  onSave?: () => void;
}

const ToolScheduleModal = ({ toolId, isOpen, schedule, onClose, onSave }: ToolScheduleModalProps) => {
  const [enabled, setEnabled] = useState(true);
  const [scheduleSelectedItem, setScheduleSelectedItem] = React.useState<string>('0 0 * * *'); // default to daily
  const [customCronExpression, setCustomCronExpression] = React.useState<string>('');
  const [isCustomCronValid, setIsCustomCronValid] = React.useState(true);
  const [timezoneOpen, setTimezoneOpen] = useState(false);
  const [selectedTimezone, setTimezone] = useState<{ value: string, label: string }>({
    value: 'Europe/Berlin',
    label: 'Europe/Berlin'
  });
  const [schedulePayload, setPayload] = useState<string>('{}');
  const [isJsonValid, setIsJsonValid] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selfHealing, setSelfHealing] = useState<string>('DISABLED');
  const [retries, setRetries] = useState<string>('');
  const [isRetriesValid, setIsRetriesValid] = useState(true);
  const [timeout, setTimeout] = useState<string>('');
  const [webhookUrl, setWebhookUrl] = useState<string>('');
  const [webhookType, setWebhookType] = useState<'url' | 'tool'>('url');
  const [selectedWebhookTool, setSelectedWebhookTool] = useState<string>('');
  const [tools, setTools] = useState<Tool[]>([]);
  const [loadingTools, setLoadingTools] = useState(false);
  const [toolDropdownOpen, setToolDropdownOpen] = useState(false);

  const config = useConfig();
  const { toast } = useToast();
  const groupedTimezones = useMemo(() => getGroupedTimezones(), []);

  React.useEffect(() => {
    if (!schedule) {
      return;
    }

    setEnabled(schedule.enabled ?? true);

    if (DEFAULT_SCHEDULES.some((s) => s.value === schedule.cronExpression)) {
      setScheduleSelectedItem(schedule.cronExpression);
    } else {
      setScheduleSelectedItem('custom');
      setCustomCronExpression(schedule.cronExpression);
    }

    const payload = schedule.payload ? JSON.stringify(schedule.payload, null, 2) : '{}';
    setPayload(payload);
    validateJson(payload);

    setSelfHealing(schedule.options?.selfHealing || 'DISABLED');
    setRetries(schedule.options?.retries?.toString() || '');
    setTimeout(schedule.options?.timeout?.toString() || '');
    
    const savedWebhook = schedule.options?.webhookUrl || '';
    if (savedWebhook.startsWith('tool:')) {
      setWebhookType('tool');
      setSelectedWebhookTool(savedWebhook.substring(5));
      setWebhookUrl('');
    } else {
      setWebhookType('url');
      setWebhookUrl(savedWebhook);
      setSelectedWebhookTool('');
    }

    if (schedule.options && (schedule.options.selfHealing !== 'DISABLED' || schedule.options.retries || schedule.options.timeout || schedule.options.webhookUrl)) {
      setShowAdvanced(true);
    }
  }, [schedule]);

  React.useEffect(() => {
    if (scheduleSelectedItem === 'custom') {
      if (customCronExpression === '') {
        setIsCustomCronValid(true);
      } else {
        setIsCustomCronValid(validateCronExpression(customCronExpression));
      }
    } else {
      setIsCustomCronValid(true);
    }
  }, [scheduleSelectedItem, customCronExpression]);

  const loadTools = async () => {
    if (tools.length > 0) return;
    setLoadingTools(true);
    try {
      const client = createSuperglueClient(config.superglueEndpoint);
      const result = await client.listWorkflows(1000, 0);
      setTools(result.items?.filter(tool => tool.steps?.length > 0) || []);
    } catch (error) {
      console.error('Error loading tools:', error);
    } finally {
      setLoadingTools(false);
    }
  };

  const validateJson = (jsonString: string) => {
    try {
      JSON.parse(jsonString);
      setIsJsonValid(true);
    } catch {
      setIsJsonValid(false);
    }
  };

  const handleSubmit = async () => {
    if (!isJsonValid) {
      toast({
        title: "Invalid JSON",
        description: "Please fix the JSON payload before saving.",
        variant: "destructive"
      });
      return;
    }

    if (scheduleSelectedItem === 'custom' && !isCustomCronValid) {
      toast({
        title: "Invalid Cron Expression",
        description: "Please fix the cron expression before saving.",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const superglueClient = new SuperglueClient({
        endpoint: config.superglueEndpoint,
        apiKey: tokenRegistry.getToken()
      });

      const cronExpression = scheduleSelectedItem === 'custom' ? customCronExpression : scheduleSelectedItem;
      const payload = schedulePayload.trim() === '{}' ? null : JSON.parse(schedulePayload);

      const options: any = {
        selfHealing
      };
      if (retries) options.retries = parseInt(retries);
      if (timeout) options.timeout = parseInt(timeout);
      
      if (webhookType === 'tool' && selectedWebhookTool) {
        options.webhookUrl = `tool:${selectedWebhookTool}`;
      } else if (webhookType === 'url' && webhookUrl.trim()) {
        options.webhookUrl = webhookUrl.trim();
      }

      await superglueClient.upsertWorkflowSchedule({
        id: schedule?.id,
        workflowId: toolId,
        cronExpression,
        timezone: selectedTimezone.value,
        enabled,
        payload,
        options
      });

      toast({
        title: "Schedule saved",
        description: schedule ? "Schedule updated successfully." : "Schedule created successfully."
      });

      onClose();
      onSave?.();
    } catch (error) {
      console.error('Failed to save schedule:', error);
      toast({
        title: "Error",
        description: "Failed to save schedule. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const onCustomCronChange = (newValue: string) => {
    setCustomCronExpression(newValue);

    if (newValue.trim() === '') {
      setIsCustomCronValid(true);
    } else {
      setIsCustomCronValid(validateCronExpression(newValue));
    }
  }

  const handleEnabledChange = (newState: boolean) => {
    setEnabled(newState);
  }

  const handlePayloadChange = (code: string) => {
    setPayload(code);
    validateJson(code);
  };

  const handleRetriesChange = (value: string) => {
    setRetries(value);
    if (value === '') {
      setIsRetriesValid(true);
    } else {
      const numValue = parseInt(value);
      setIsRetriesValid(!isNaN(numValue) && numValue >= 0 && numValue <= 10);
    }
  };


  return (
    isOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
        <div className="bg-background rounded-xl max-w-2xl w-full max-h-full flex flex-col overflow-hidden">
          <Card className="flex flex-col h-full overflow-hidden">
            <CardHeader className="flex-shrink-0">
              <CardTitle className="text-lg">
                Add Schedule for: {toolId}
              </CardTitle>
            </CardHeader>
            <div className="flex-1 overflow-y-auto">
              <CardContent className="flex flex-col gap-6">
                {/* enabled switch */}
                <div className="flex items-center gap-3">
                  <Label htmlFor="enabled">Enable schedule</Label>
                  <Switch
                    id="enabled"
                    checked={enabled}
                    onCheckedChange={handleEnabledChange}
                    className="custom-switch"
                  />
                </div>

                {/* frequency select */}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="frequency">Frequency</Label>
                  <Select
                    value={scheduleSelectedItem}
                    onValueChange={(value) => {
                      setScheduleSelectedItem(value);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      {DEFAULT_SCHEDULES.map((schedule) => (
                        <SelectItem key={schedule.value} value={schedule.value}>
                          {schedule.label}
                        </SelectItem>
                      ))}
                      <SelectItem key="custom" value="custom">
                        Custom cron
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {/* custom cron */}
                  {scheduleSelectedItem === "custom" && (
                    <div>
                      <div className="flex items-center gap-2">
                        <Label htmlFor="cronExpression" className="text-sm">
                          Cron Expression
                        </Label>
                        <HelpTooltip text="Cron expressions use 5 fields: minute (0-59), hour (0-23), day of month (1-31), month (1-12), day of week (0-6). Use * for any value, / for intervals, and , for lists. Example: '0 9 * * 1-5' runs weekdays at 9 AM. Learn more at crontab.guru" />
                      </div>
                      <Input
                        id="cronExpression"
                        placeholder="Enter a custom cron expression (e.g., '0 9 * * 1-5')"
                        value={customCronExpression}
                        onChange={(e) => onCustomCronChange(e.target.value)}
                      />
                      {!isCustomCronValid && (
                        <p className="text-sm text-destructive mt-1">
                          Invalid cron expression
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* timezone */}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Popover open={timezoneOpen} onOpenChange={setTimezoneOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={timezoneOpen}
                        className="w-full justify-between font-normal"
                      >
                        {selectedTimezone
                          ? selectedTimezone.label
                          : "Select timezone..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                      <Command>
                        <CommandInput placeholder="Search timezone..." />
                        <CommandList>
                          <CommandEmpty>No timezone found.</CommandEmpty>
                          {Object.entries(groupedTimezones).map(
                            ([groupName, timezones]) => (
                              <CommandGroup key={groupName} heading={groupName}>
                                {timezones.map((timezone) => (
                                  <CommandItem
                                    key={timezone.value}
                                    value={timezone.value}
                                    onSelect={(currentValue) => {
                                      setTimezone(
                                        currentValue === selectedTimezone?.value
                                          ? selectedTimezone
                                          : timezone
                                      );
                                      setTimezoneOpen(false);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        selectedTimezone?.value === timezone.value
                                          ? "opacity-100"
                                          : "opacity-0"
                                      )}
                                    />
                                    {timezone.label}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            )
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* payload */}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="payload">JSON Input (Optional)</Label>
                  <JsonCodeEditor
                    value={schedulePayload}
                    onChange={handlePayloadChange}
                    minHeight="120px"
                    maxHeight="120px"
                    showValidation={true}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Label>Webhook</Label>
                      <HelpTooltip text="Send execution results to an external URL or trigger another tool." />
                    </div>
                    
                    <div className="inline-flex h-8 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground">
                      <button
                        type="button"
                        onClick={() => setWebhookType('url')}
                        className={cn(
                          "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                          webhookType === 'url' 
                            ? "bg-background text-foreground shadow" 
                            : "hover:bg-background/50"
                        )}
                      >
                        URL
                      </button>
                      <button
                        type="button"
                        onClick={() => setWebhookType('tool')}
                        className={cn(
                          "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                          webhookType === 'tool' 
                            ? "bg-background text-foreground shadow" 
                            : "hover:bg-background/50"
                        )}
                      >
                        Tool
                      </button>
                    </div>
                  </div>

                  {webhookType === 'url' ? (
                    <Input
                      type="url"
                      placeholder="https://example.com/webhook"
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                    />
                  ) : (
                    <Popover open={toolDropdownOpen} onOpenChange={setToolDropdownOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={toolDropdownOpen}
                          className="w-full justify-between font-normal"
                          onClick={() => !toolDropdownOpen && loadTools()}
                        >
                          {selectedWebhookTool || "Select tool..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                        <Command>
                          <CommandInput placeholder="Search tools..." />
                          <CommandList>
                            {loadingTools ? (
                              <div className="flex items-center justify-center py-6">
                                <Loader2 className="h-5 w-5 animate-spin" />
                              </div>
                            ) : (
                              <>
                                <CommandEmpty>No tools found.</CommandEmpty>
                                <CommandGroup>
                                  {tools.filter(tool => tool.id !== toolId).map((tool) => (
                                    <CommandItem
                                      key={tool.id}
                                      value={tool.id}
                                      onSelect={() => {
                                        setSelectedWebhookTool(tool.id);
                                        setToolDropdownOpen(false);
                                      }}
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-4 w-4",
                                          selectedWebhookTool === tool.id ? "opacity-100" : "opacity-0"
                                        )}
                                      />
                                      <div className="flex flex-col overflow-hidden w-full">
                                        <div className="font-medium truncate">{tool.id}</div>
                                        {tool.instruction && (
                                          <div className="text-xs text-muted-foreground truncate">
                                            {tool.instruction}
                                          </div>
                                        )}
                                      </div>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </>
                            )}
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>

                {/* advanced options */}
                <div className="flex flex-col gap-4 border-t pt-4">
                  <div
                    role="button"
                    aria-expanded={showAdvanced}
                    tabIndex={0}
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setShowAdvanced(!showAdvanced);
                      }
                    }}
                    className="flex items-center gap-2 text-sm text-muted-foreground select-none cursor-pointer outline-none focus:outline-none"
                  >
                    <ChevronRight className={cn("h-4 w-4 transition-transform", showAdvanced && "rotate-90")} />
                    <span>Advanced Options</span>
                  </div>

                  {showAdvanced && (
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <Label htmlFor="selfHealing">Self-Healing</Label>
                          <HelpTooltip text="When enabled, superglue automatically retries and fixes API configuration errors. ENABLED: fixes both requests and transforms. REQUEST_ONLY: only fixes API calls. TRANSFORM_ONLY: only fixes data transforms. DISABLED: no automatic fixes." />
                        </div>
                        <Select value={selfHealing} onValueChange={setSelfHealing}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="DISABLED">Disabled</SelectItem>
                            <SelectItem value="ENABLED">Enabled</SelectItem>
                            <SelectItem value="TRANSFORM_ONLY">Transform Only</SelectItem>
                            <SelectItem value="REQUEST_ONLY">Request Only</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <Label htmlFor="retries">Retries</Label>
                            <HelpTooltip text="Number of retry attempts for failed API calls (max 10). Higher values increase reliability but may slow execution." />
                          </div>
                          <Input
                            id="retries"
                            type="number"
                            min="0"
                            max="10"
                            placeholder="Default: 1"
                            value={retries}
                            onChange={(e) => handleRetriesChange(e.target.value)}
                          />
                          {!isRetriesValid && (
                            <p className="text-sm text-destructive mt-1">
                              Maximum 10 retries allowed
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <Label htmlFor="timeout">Timeout (ms)</Label>
                            <HelpTooltip text="Maximum time to wait for API responses in milliseconds. Increase for slow APIs. Default: 60000ms (1 minute)." />
                          </div>
                          <Input
                            id="timeout"
                            type="number"
                            min="1000"
                            placeholder="Default: 60000"
                            value={timeout}
                            onChange={(e) => setTimeout(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </div>
            <CardFooter className="flex-shrink-0">
              <div className="flex justify-end gap-2 w-full">
                <Button variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={!isJsonValid || isSubmitting || !isCustomCronValid || !isRetriesValid || (scheduleSelectedItem === 'custom' && customCronExpression.trim() === '')}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {schedule ? "Save Changes" : "Add Schedule"}
                </Button>
              </div>
            </CardFooter>
          </Card>
        </div>
      </div>
    )
  );
};

export default ToolScheduleModal;
