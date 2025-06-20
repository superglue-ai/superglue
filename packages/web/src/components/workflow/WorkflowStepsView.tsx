import { Button } from '@/src/components/ui/button';
import { Label } from '@/src/components/ui/label';
import { Switch } from '@/src/components/ui/switch';
import { cn } from '@/src/lib/utils';
import { Integration } from "@superglue/client";
import Prism from 'prismjs';
import 'prismjs/components/prism-json';
import { useEffect, useState } from 'react';
import Editor from 'react-simple-code-editor';
import { WorkflowStepCard } from './WorkflowStepCard';

interface WorkflowStepsViewProps {
  steps: any[];
  onStepsChange: (steps: any[]) => void;
  onStepEdit: (stepId: string, updatedStep: any) => void;
  codeModeOnly?: boolean;
  integrations?: Integration[];
}

const highlightJson = (code: string) => {
  try {
    return Prism.highlight(code, Prism.languages.json, 'json');
  } catch {
    return code; // Return raw code if JSON is invalid
  }
};

export function WorkflowStepsView({ steps, onStepsChange, onStepEdit, codeModeOnly, integrations }: WorkflowStepsViewProps) {
  const [isCodeMode, setIsCodeMode] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [codeValue, setCodeValue] = useState(JSON.stringify(steps, null, 2));

  useEffect(() => {
    setCodeValue(JSON.stringify(steps, null, 2));
  }, [steps]);

  // Initialize from localStorage on mount
  useEffect(() => {
    const savedMode = localStorage?.getItem('workflowStepsCodeMode');
    if (savedMode !== null) {
      setIsCodeMode(savedMode === 'true');
    }
  }, []);

  // Update localStorage when isCodeMode changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('workflowStepsCodeMode', isCodeMode.toString());
    }
  }, [isCodeMode]);

  const handleCodeChange = (newCode: string) => {
    setCodeValue(newCode);
    try {
      const parsedSteps = JSON.parse(newCode);
      onStepsChange(parsedSteps);
      setJsonError(null);
    } catch (e) {
      setJsonError((e as Error).message);
    }
  };

  const handleAddStep = () => {
    const newStep = {
      id: `new-step-${Date.now()}`, // Basic unique ID
      name: "New Step",
      type: "default", // Or some other default type
      apiConfig: {
        id: `new-step-${Date.now()}`,
        method: 'GET',
        urlHost: '',
        urlPath: '',
        headers: {},
        queryParams: {},
        body: ''
      },
      inputMapping: "$",
      responseMapping: "$",
      executionMode: 'DIRECT',
      // Add other default properties for a new step as needed
    };
    const updatedSteps = [...steps, newStep];
    onStepsChange(updatedSteps);
  };

  const handleRemoveStep = (stepIdToRemove: string) => {
    const updatedSteps = steps.filter(step => step.id !== stepIdToRemove);
    onStepsChange(updatedSteps);
  };

  return (
    <div className="space-y-3">
      {!codeModeOnly && (
        <div className="flex justify-end items-center gap-2 -mt-5">
          <Label htmlFor="editorMode" className="text-xs">Code Mode</Label>
          <Switch className="custom-switch" id="stepsEditorMode" checked={isCodeMode} onCheckedChange={setIsCodeMode} />
        </div>
      )}

      {(isCodeMode || codeModeOnly) ? (
        <div className="flex-1 min-h-0 border rounded-md overflow-hidden relative code-editor">
          <Editor
            value={codeValue}
            onValueChange={handleCodeChange}
            highlight={highlightJson}
            padding={10}
            tabSize={2}
            insertSpaces={true}
            className={cn(
              "font-mono text-xs w-full min-h-[200px]",
              jsonError && "border-red-500"
            )}
            style={{
              minHeight: '200px',
            }}
          />
          {jsonError && (
            <div className="absolute bottom-0 left-0 right-0 bg-red-500/10 text-red-500 p-2 text-xs">
              {jsonError}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {steps.map((step, index) => (
            <WorkflowStepCard
              key={step.id || index}
              step={step}
              isLast={index === steps.length - 1}
              onEdit={onStepEdit}
              onRemove={handleRemoveStep}
              integrations={integrations}
            />
          ))}
          <div className="pt-2">
            <Button onClick={handleAddStep} variant="outline" size="sm" className="w-full">
              + Add Step
            </Button>
          </div>
        </div>
      )}
    </div>
  );
} 