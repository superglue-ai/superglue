import { useConfig } from '@/src/app/config-context';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/src/components/ui/select";
import { useToast } from '@/src/hooks/use-toast';
import { integrations as integrationTemplates } from '@/src/lib/integrations';
import { cn } from '@/src/lib/utils';
import { Integration, SuperglueClient } from "@superglue/client";
import { ArrowDown, Check, Globe, Pencil, RotateCw, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { SimpleIcon } from 'simple-icons';
import * as simpleIcons from 'simple-icons';
import { Badge } from "../ui/badge";
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { HelpTooltip } from '../utils/HelpTooltip';

interface WorkflowStepCardProps {
  step: any;
  isLast: boolean;
  onEdit: (stepId: string, updatedStep: any) => void;
  onRemove: (stepId: string) => void;
  integrations?: Integration[];
  onCreateIntegration?: () => void;
}

export function WorkflowStepCard({ step, isLast, onEdit, onRemove, integrations: propIntegrations, onCreateIntegration }: WorkflowStepCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedStep, setEditedStep] = useState(step);
  const [localIntegrations, setLocalIntegrations] = useState<Integration[]>([]);
  const [loadingIntegrations, setLoadingIntegrations] = useState(false);

  const config = useConfig();
  const { toast } = useToast();

  const client = useMemo(() => new SuperglueClient({
    endpoint: config.superglueEndpoint,
    apiKey: config.superglueApiKey,
  }), [config.superglueEndpoint, config.superglueApiKey]);

  const loadIntegrations = async () => {
    if (localIntegrations.length > 0) return; // Already loaded

    try {
      setLoadingIntegrations(true);
      const result = await client.listIntegrations(100, 0);
      setLocalIntegrations(result.items);
    } catch (error: any) {
      console.error("Error loading integrations:", error);
      toast({
        title: "Error loading integrations",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoadingIntegrations(false);
    }
  };

  // Load integrations when editing starts
  useEffect(() => {
    if (isEditing) {
      loadIntegrations();
    }
  }, [isEditing]);

  // Use prop integrations if provided, otherwise use locally loaded ones
  const integrations = propIntegrations || localIntegrations;

  // Helper function for icon handling
  const getSimpleIcon = (name: string): SimpleIcon | null => {
    if (!name || name === "default") return null;
    const formatted = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
    const iconKey = `si${formatted}`;
    try {
      // @ts-ignore
      let icon = simpleIcons[iconKey];
      return icon || null;
    } catch (e) {
      return null;
    }
  };

  const integrationOptions = [
    { value: "custom", label: "Custom", icon: "default" },
    ...Object.entries(integrationTemplates).map(([key, integration]) => ({
      value: key,
      label: key.charAt(0).toUpperCase() + key.slice(1),
      icon: (integration as any).icon || "default"
    }))
  ];

  const getIntegrationIcon = (integration: Integration) => {
    const match = integrationOptions.find(opt =>
      opt.value !== 'custom' &&
      (integration.id === opt.value || integration.urlHost?.includes(opt.value))
    );
    return match ? getSimpleIcon(match.icon) : null;
  };

  // Sync editedStep with step prop changes
  useEffect(() => {
    setEditedStep(step);
  }, [step]);

  const handleSave = () => {
    onEdit(step.id, editedStep);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditedStep(step);
    setIsEditing(false);
  };

  const handleRemove = () => {
    onRemove(step.id);
  };

  // Find matching integration based on integrationId or urlHost
  const linkedIntegration = integrations?.find(integration => {
    // First try direct ID match from both editedStep and original step
    if ((editedStep.integrationId && integration.id === editedStep.integrationId) ||
      (step.integrationId && integration.id === step.integrationId)) {
      return true;
    }
    // Fallback to URL host matching
    return step.apiConfig?.urlHost && integration.urlHost &&
      step.apiConfig.urlHost.includes(integration.urlHost.replace(/^https?:\/\//, ''));
  });

  // Sync integrationId with linked integration
  useEffect(() => {
    if (linkedIntegration && !editedStep.integrationId) {
      setEditedStep(prev => ({
        ...prev,
        integrationId: linkedIntegration.id
      }));
    }
  }, [linkedIntegration, editedStep.integrationId, step.integrationId]);
  return (
    <div className="flex flex-col items-center">
      <Card className={cn("w-full", isEditing ? "border-primary" : "bg-muted/50")}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between min-w-0">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <CardTitle className="text-sm font-medium flex items-center gap-2 min-w-0">
                {editedStep.executionMode === 'LOOP' && (
                  <RotateCw className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                )}
                <span className="font-mono truncate">{step.id}</span>
                {linkedIntegration && !isEditing && (
                  <Badge variant="outline" className="text-xs flex-shrink-0">
                    <div className="text-xs flex items-center gap-1">
                      {getIntegrationIcon(linkedIntegration) ? (
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill={`#${getIntegrationIcon(linkedIntegration)?.hex}`}
                          className="flex-shrink-0"
                        >
                          <path d={getIntegrationIcon(linkedIntegration)?.path || ''} />
                        </svg>
                      ) : (
                        <Globe className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate">{linkedIntegration.id}</span>
                    </div>
                  </Badge>
                )}
              </CardTitle>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {isEditing && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Label className="text-xs whitespace-nowrap">Mode</Label>
                  <HelpTooltip text="DIRECT: Execute once with input data. LOOP: Execute multiple times iterating over an array from previous steps." />
                  <Select
                    value={editedStep.executionMode}
                    onValueChange={(value) => setEditedStep(prev => ({ ...prev, executionMode: value }))}
                  >
                    <SelectTrigger className="h-7 w-24 flex-shrink-0">
                      <SelectValue placeholder="Mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DIRECT">DIRECT</SelectItem>
                      <SelectItem value="LOOP">LOOP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex gap-1 flex-shrink-0">
                {isEditing ? (
                  <>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive flex-shrink-0" onClick={handleRemove}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={handleCancel}>
                      <X className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={handleSave}>
                      <Check className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={() => setIsEditing(true)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {isEditing ? (
            <>
              <div className="space-y-2">
                <div>
                  <Label className="text-xs flex items-center gap-1">
                    Step Instruction
                    <HelpTooltip text="AI-generated instruction for this step. This describes what the step does and how it should behave." />
                  </Label>
                  <div className="text-xs text-muted-foreground bg-muted/30 p-2 rounded mt-1">
                    {editedStep.apiConfig.instruction || <span className="italic">No instruction provided</span>}
                  </div>
                </div>

                <div>
                  <Label className="text-xs flex items-center gap-1">
                    Integration
                    <HelpTooltip text="Select an integration to link this step to. This will pre-fill the API configuration with the integration's base URL and credentials." />
                  </Label>
                  <Select
                    value={editedStep.integrationId || step.integrationId}
                    onValueChange={(value) => {
                      if (value === "CREATE_NEW") {
                        onCreateIntegration?.();
                      } else {
                        const selectedIntegration = integrations?.find(integration => integration.id === value);
                        setEditedStep(prev => ({
                          ...prev,
                          integrationId: value,
                          apiConfig: {
                            ...prev.apiConfig,
                            // Pre-fill API config from selected integration
                            urlHost: selectedIntegration?.urlHost || prev.apiConfig.urlHost,
                            urlPath: selectedIntegration?.urlPath || prev.apiConfig.urlPath,
                            headers: selectedIntegration?.credentials ?
                              Object.entries(selectedIntegration.credentials).reduce((acc, [key, value]) => ({
                                ...acc,
                                [key]: value
                              }), {}) : prev.apiConfig.headers
                          }
                        }));
                      }
                    }}
                  >
                    <SelectTrigger className="h-9 mt-1">
                      <SelectValue placeholder="Select integration" />
                    </SelectTrigger>
                    <SelectContent>
                      {integrations?.map(integration => (
                        <SelectItem key={integration.id} value={integration.id}>
                          <div className="flex items-center gap-2 w-full">
                            {getIntegrationIcon(integration) ? (
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill={`#${getIntegrationIcon(integration)?.hex}`}
                                className="flex-shrink-0"
                              >
                                <path d={getIntegrationIcon(integration)?.path || ''} />
                              </svg>
                            ) : (
                              <Globe className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                            )}
                            <span className="flex-grow">{integration.id}</span>
                            {integration.urlHost && (
                              <span className="text-muted-foreground text-xs ml-auto">({integration.urlHost})</span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                      {onCreateIntegration && (
                        <SelectItem value="CREATE_NEW" className="text-primary">
                          + Add New Integration
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs flex items-center gap-1">
                    API Config
                    <HelpTooltip text="Configure the HTTP method, host, and endpoint path for this API call. Use variables like {variable} to reference previous step outputs." />
                  </Label>
                  <div className="space-y-2 mt-1">
                    <div className="flex gap-2">
                      <Select
                        value={editedStep.apiConfig.method}
                        onValueChange={(value) => setEditedStep(prev => ({
                          ...prev,
                          apiConfig: { ...prev.apiConfig, method: value }
                        }))}
                      >
                        <SelectTrigger className="h-9 flex-1">
                          <SelectValue placeholder="Method" />
                        </SelectTrigger>
                        <SelectContent>
                          {['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map(method => (
                            <SelectItem key={method} value={method}>{method}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        value={editedStep.apiConfig.urlHost}
                        onChange={(e) => setEditedStep(prev => ({
                          ...prev,
                          apiConfig: { ...prev.apiConfig, urlHost: e.target.value }
                        }))}
                        className="text-xs flex-1"
                        placeholder="Host"
                      />
                      <Input
                        value={editedStep.apiConfig.urlPath}
                        onChange={(e) => setEditedStep(prev => ({
                          ...prev,
                          apiConfig: { ...prev.apiConfig, urlPath: e.target.value }
                        }))}
                        className="text-xs flex-1"
                        placeholder="Path"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <Label className="text-xs flex items-center gap-1">
                    Headers (JSON)
                    <HelpTooltip text="HTTP headers to include with the request. Use JSON format. Common headers include Content-Type, Authorization, etc." />
                  </Label>
                  <Textarea
                    value={JSON.stringify(editedStep.apiConfig.headers || {}, null, 2)}
                    onChange={(e) => {
                      try {
                        const headers = JSON.parse(e.target.value);
                        setEditedStep(prev => ({
                          ...prev,
                          apiConfig: { ...prev.apiConfig, headers }
                        }));
                      } catch (error) {
                        // Handle invalid JSON
                      }
                    }}
                    className="font-mono text-xs h-20 mt-1"
                  />
                </div>

                <div>
                  <Label className="text-xs flex items-center gap-1">
                    Query Parameters (JSON)
                    <HelpTooltip text='URL query parameters to append to the request. Use JSON format like {"param1": "value1", "param2": "value2"}' />
                  </Label>
                  <Textarea
                    value={JSON.stringify(editedStep.apiConfig.queryParams || {}, null, 2)}
                    onChange={(e) => {
                      try {
                        const queryParams = JSON.parse(e.target.value);
                        setEditedStep(prev => ({
                          ...prev,
                          apiConfig: { ...prev.apiConfig, queryParams }
                        }));
                      } catch (error) {
                        // Handle invalid JSON
                      }
                    }}
                    className="font-mono text-xs h-20 mt-1"
                  />
                </div>

                <div>
                  <Label className="text-xs flex items-center gap-1">
                    Body
                    <HelpTooltip text="Request body content. Can be JSON, form data, or plain text. Use JSONata expressions to transform data from previous steps." />
                  </Label>
                  <Textarea
                    value={editedStep.apiConfig.body || ''}
                    onChange={(e) => setEditedStep(prev => ({
                      ...prev,
                      apiConfig: { ...prev.apiConfig, body: e.target.value }
                    }))}
                    className="font-mono text-xs h-20 mt-1"
                  />
                </div>

                {editedStep.executionMode === 'LOOP' && (
                  <>
                    <div>
                      <Label className="text-xs flex items-center gap-1">
                        Loop Selector (JSONata)
                        <HelpTooltip text="JSONata expression to select an array from previous step outputs. The step will execute once for each item. Example: $.items or $.data[*]" />
                      </Label>
                      <Input
                        value={editedStep.loopSelector || ''}
                        onChange={(e) => setEditedStep(prev => ({
                          ...prev,
                          loopSelector: e.target.value
                        }))}
                        className="text-xs mt-1"
                        placeholder="e.g., $.items"
                      />
                    </div>
                    <div>
                      <Label className="text-xs flex items-center gap-1">
                        Max Iterations
                        <HelpTooltip text="Maximum number of loop iterations to prevent infinite loops. Leave empty for no limit." />
                      </Label>
                      <Input
                        type="number"
                        value={editedStep.loopMaxIters || ''}
                        onChange={(e) => setEditedStep(prev => ({
                          ...prev,
                          loopMaxIters: parseInt(e.target.value) || undefined
                        }))}
                        className="text-xs mt-1 w-32"
                      />
                    </div>
                  </>
                )}

                <div>
                  <Label className="text-xs flex items-center gap-1">
                    Input Mapping (JSONata)
                    <HelpTooltip text='Transform and map data from previous steps before sending to this API. Use JSONata expressions to reshape data. Example: {"name": $.user.fullName, "email": $.user.email}' />
                  </Label>
                  <Textarea
                    value={editedStep.inputMapping || ''}
                    onChange={(e) => setEditedStep(prev => ({
                      ...prev,
                      inputMapping: e.target.value
                    }))}
                    className="font-mono text-xs h-20 mt-1"
                    placeholder="Transform input before sending to API"
                  />
                </div>

                <div>
                  <Label className="text-xs flex items-center gap-1">
                    Response Mapping (JSONata)
                    <HelpTooltip text="Transform the API response before passing to the next step. Use JSONata expressions to extract and reshape data. Example: $.data.results[*].{id: id, name: title}" />
                  </Label>
                  <Textarea
                    value={editedStep.responseMapping || ''}
                    onChange={(e) => setEditedStep(prev => ({
                      ...prev,
                      responseMapping: e.target.value
                    }))}
                    className="font-mono text-xs h-20 mt-1"
                    placeholder="Transform API response"
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <div className="font-mono text-xs bg-background/50 p-2 rounded mt-1 overflow-x-auto">
                  <div>{editedStep.apiConfig.method || 'GET'} {editedStep.apiConfig.urlHost}{editedStep.apiConfig.urlPath}</div>
                </div>
              </div>
              {editedStep.executionMode === 'LOOP' && editedStep.loopSelector && (
                <div>
                  <Label className="text-xs text-muted-foreground">Loop Over</Label>
                  <div className="font-mono text-xs bg-background/50 p-2 rounded mt-1 overflow-x-auto">
                    {editedStep.loopSelector}
                    {editedStep.loopMaxIters && ` (max ${editedStep.loopMaxIters} iterations)`}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
      {!isLast && (
        <div className="my-2 text-muted-foreground">
          <ArrowDown className="h-4 w-4" />
        </div>
      )}
    </div>
  );
} 