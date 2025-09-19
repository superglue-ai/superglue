import { WorkflowSchedule } from '@superglue/client';
import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Input } from '../ui/input';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Check, ChevronsUpDown, CheckCircle, XCircle } from 'lucide-react';
import { cn, getGroupedTimezones } from '@/src/lib/utils';
import { Switch } from "@/src/components/ui/switch";
import Editor from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/components/prism-json';

const DEFAULT_SCHEDULES = [
  { value: '*/2 * * * *', label: 'Every 2 minutes' },
  { value: '*/15 * * * *', label: 'Every 15 minutes' },
  { value: '*/30 * * * *', label: 'Every 30 minutes' },
  { value: '0 * * * *', label: 'Hourly' },
  { value: '0 0 * * *', label: 'Daily' },
  { value: '0 0 * * 0', label: 'Weekly' },
  { value: '0 0 1 * *', label: 'Monthly' },
];

interface WorkflowScheduleModalProps {
  workflowId: string;
  isOpen: boolean;
  schedule?: WorkflowSchedule
  onClose: () => void;
}

const WorkflowScheduleModal = ({ workflowId, isOpen, schedule, onClose }: WorkflowScheduleModalProps) => {
  const [enabled, setEnabled] = useState(true);
  const [scheduleSelectedItem, setScheduleSelectedItem] = React.useState<string>('0 0 * * *'); // default to daily
  const [customCronExpression, setCustomCronExpression] = React.useState<string>('');
  const [customCronValidationError, setCustomCronValidationError] = React.useState<string | null>(null);
  const [timezoneOpen, setTimezoneOpen] = useState(false);
  const [selectedTimezone, setTimezone] = useState<{value: string, label: string}>({
    value: 'Europe/Berlin',
    label: 'Europe/Berlin'
  });
  const [schedulePayload, setPayload] = useState<string>('{}');
  const [isJsonValid, setIsJsonValid] = useState(true);

  const groupedTimezones = useMemo(() => getGroupedTimezones(), []); // only once

  React.useEffect(() => {
    if(!schedule) {
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
  }, [schedule]);

  const validateJson = (jsonString: string) => {
    try {
      JSON.parse(jsonString);
      setIsJsonValid(true);
    } catch {
      setIsJsonValid(false);
    }
  };

  const handleSubmit = () => {
    console.log('submit');
  }

  const onCustomCronChange = (newValue: string) => {
    setCustomCronExpression(newValue);

    if (false) { // todo: validate cron expression
      setCustomCronValidationError(null);
    } else {
      setCustomCronValidationError('Invalid cron expression');
    }
  }

  const handleEnabledChange = (newState: boolean) => {
    setEnabled(newState);
  }

  const handlePayloadChange = (code: string) => {
    setPayload(code);
    validateJson(code);
  };

  const highlightJson = (code: string) => {
    if (!code) return '';
    return Prism.highlight(code, Prism.languages.json, 'json');
  };

  return (
    isOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <div className="bg-background rounded-xl max-w-2xl w-full p-0">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Add Schedule for Workflow: {workflowId}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              {/* enabled switch */}
              <div className="flex items-center gap-3">
                <Label htmlFor="enabled">Enable schedule</Label>
                <Switch
                  id="enabled"
                  checked={enabled}
                  onCheckedChange={handleEnabledChange}
                />
              </div>
              
              {/* frequency select */}
              <div className="flex flex-col gap-2">
                <Label htmlFor="frequency">Frequency</Label>
                <Select
                  value={scheduleSelectedItem}
                  onValueChange={setScheduleSelectedItem}
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
                    <Input
                      id="cronExpression"
                      placeholder="Enter a custom cron expression"
                      value={customCronExpression}
                      onChange={(e) => onCustomCronChange(e.target.value)}
                    />
                    {customCronValidationError && (
                      <p className="text-sm text-destructive mt-1">
                        {customCronValidationError}
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
                <Label htmlFor="payload">JSON Payload (Optional)</Label>
                <div className="border rounded-md p-3 bg-muted/50">
                  <Editor
                    value={schedulePayload}
                    padding={10}
                    tabSize={2}
                    highlight={highlightJson}
                    onValueChange={handlePayloadChange}
                    insertSpaces={true}
                    className="font-mono text-sm min-h-[120px] [&_textarea]:outline-none [&_textarea]:w-full [&_textarea]:resize-none [&_textarea]:p-0 [&_textarea]:border-0 [&_textarea]:bg-transparent"
                  />
                </div>
                <div className="flex items-center gap-2 text-sm">
                  {isJsonValid ? (
                    <>
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-green-600">Valid JSON</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 text-red-600" />
                      <span className="text-red-600">Invalid JSON</span>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <div className="flex justify-end gap-2 w-full">
                <Button variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={!isJsonValid}>
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

export default WorkflowScheduleModal;
