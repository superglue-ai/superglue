import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/src/components/ui/select";
import { cn } from '@/src/lib/utils';
import { RotateCw, X, Check, Pencil, ArrowDown, Trash2 } from 'lucide-react';

interface WorkflowStepCardProps {
  step: any;
  isLast: boolean;
  onEdit: (stepId: string, updatedStep: any) => void;
  onRemove: (stepId: string) => void;
}

export function WorkflowStepCard({ step, isLast, onEdit, onRemove }: WorkflowStepCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedStep, setEditedStep] = useState(step);

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

  return (
    <div className="flex flex-col items-center">
      <Card className={cn("w-full", isEditing ? "border-primary" : "bg-muted/50")}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              {editedStep.executionMode === 'LOOP' && (
                <RotateCw className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="font-mono">{step.id}</span>
            </CardTitle>
            <div className="flex items-center gap-2">
              {isEditing && (
                <Select
                  value={editedStep.executionMode}
                  onValueChange={(value) => setEditedStep(prev => ({ ...prev, executionMode: value }))}
                >
                  <SelectTrigger className="h-7 w-24">
                    <SelectValue placeholder="Mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DIRECT">DIRECT</SelectItem>
                    <SelectItem value="LOOP">LOOP</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <div className="flex gap-1">
                {isEditing ? (
                  <>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={handleRemove}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCancel}>
                      <X className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleSave}>
                      <Check className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsEditing(true)}>
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
                  <Label className="text-xs">API Config</Label>
                  <div className="space-y-2 mt-1">
                    <div className="flex gap-2">
                    <Select
                        value={editedStep.apiConfig.method}
                        onValueChange={(value) => setEditedStep(prev => ({
                          ...prev,
                          apiConfig: { ...prev.apiConfig, method: value }
                        }))}
                      >
                        <SelectTrigger className="h-7 flex-1">
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
                  <Label className="text-xs">Headers (JSON)</Label>
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
                  <Label className="text-xs">Query Parameters (JSON)</Label>
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
                  <Label className="text-xs">Body</Label>
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
                      <Label className="text-xs">Loop Selector (JSONata)</Label>
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
                      <Label className="text-xs">Max Iterations</Label>
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
                  <Label className="text-xs">Input Mapping (JSONata)</Label>
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
                  <Label className="text-xs">Response Mapping (JSONata)</Label>
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
                <div className="font-mono text-xs bg-background/50 p-2 rounded mt-1">
                  <div>{editedStep.apiConfig.method || 'GET'} {editedStep.apiConfig.urlHost}{editedStep.apiConfig.urlPath}</div>
                </div>
              </div>
              {editedStep.executionMode === 'LOOP' && editedStep.loopSelector && (
                <div>
                  <Label className="text-xs text-muted-foreground">Loop Over</Label>
                  <div className="font-mono text-xs bg-background/50 p-2 rounded mt-1">
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