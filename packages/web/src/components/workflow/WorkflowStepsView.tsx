import { useState, useEffect } from 'react';
import { Button } from '@/src/components/ui/button';
import { Switch } from '@/src/components/ui/switch';
import { Label } from '@/src/components/ui/label';
import { Textarea } from '@/src/components/ui/textarea';
import { WorkflowStepCard } from './WorkflowStepCard';
import Editor from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/components/prism-json';
import { cn } from '@/src/lib/utils';

interface WorkflowStepsViewProps {
  steps: any[];
  onStepsChange: (steps: any[]) => void;
  onStepEdit: (stepId: string, updatedStep: any) => void;
}

const highlightJson = (code: string) => {
  try {
    return Prism.highlight(code, Prism.languages.json, 'json');
  } catch {
    return code; // Return raw code if JSON is invalid
  }
};

export function WorkflowStepsView({ steps, onStepsChange, onStepEdit }: WorkflowStepsViewProps) {
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
        method: 'GET',
        urlHost: '',
        urlPath: '',
        headers: {},
        queryParams: {},
        body: ''
      },
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
      <div className="flex justify-end items-center gap-2 -mt-5">
        <Label htmlFor="editorMode" className="text-xs">Code Mode</Label>
        <Switch id="stepsEditorMode" checked={isCodeMode} onCheckedChange={setIsCodeMode} />
      </div>

      {isCodeMode ? (
        <div className="flex-1 min-h-0 border rounded-md overflow-hidden relative">
          <Editor
            value={codeValue}
            onValueChange={handleCodeChange}
            highlight={highlightJson}
            padding={10}
            tabSize={2}
            insertSpaces={true}
            className={cn(
              "min-h-[200px] h-full text-xs [&_textarea]:outline-none [&_textarea]:w-full [&_textarea]:h-full [&_textarea]:resize-none [&_textarea]:p-0 [&_textarea]:border-0 [&_textarea]:bg-transparent dark:[&_textarea]:text-white",
              jsonError && "border-red-500"
            )}
            style={{
              fontFamily: 'var(--font-mono)',
              minHeight: '200px', // Ensure a minimum height for the editor
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
              key={step.id || index} // Use step.id if available, otherwise index
              step={step}
              isLast={index === steps.length - 1}
              onEdit={onStepEdit}
              onRemove={handleRemoveStep}
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