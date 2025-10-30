import { useIntegrations } from '@/src/app/integrations-context';
import { tokenRegistry } from '@/src/lib/token-registry';
import { useToast } from '@/src/hooks/use-toast';
import { SuperglueClient, Workflow as Tool } from '@superglue/client';
import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { Button } from '../ui/button';
import { ToolBuilder, type BuildContext } from './ToolBuilder';
import ToolPlayground, { ToolPlaygroundHandle } from './ToolPlayground';
import { useConfig } from '@/src/app/config-context';

type ToolCreateStep = 'build' | 'run' | 'publish';

interface ToolCreateStepperProps {
  onComplete?: () => void;
}

export function ToolCreateStepper({ onComplete }: ToolCreateStepperProps) {
  const [step, setStep] = useState<ToolCreateStep>('build');
  const [isSaving, setIsSaving] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [shouldStopExecution, setShouldStopExecution] = useState(false);
  const [selfHealingEnabled, setSelfHealingEnabled] = useState(true);
  
  const { toast } = useToast();
  const router = useRouter();
  const superglueConfig = useConfig();
  const playgroundRef = useRef<ToolPlaygroundHandle>(null);

  const { integrations } = useIntegrations();

  const [currentTool, setCurrentTool] = useState<Tool | null>(null);
  const [buildContext, setBuildContext] = useState<BuildContext | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);
  const [filePayloads, setFilePayloads] = useState<Record<string, any>>({});

  const client = useMemo(() => new SuperglueClient({
    endpoint: superglueConfig.superglueEndpoint,
    apiKey: tokenRegistry.getToken(),
  }), [superglueConfig.superglueEndpoint]);

  const handleToolBuilt = (tool: Tool, context: BuildContext) => {
    setCurrentTool(tool);
    setBuildContext(context);
    setUploadedFiles(context.uploadedFiles);
    setFilePayloads(context.filePayloads);
    setStep('run');
  };

  const handleFilesChange = (files: any[], payloads: Record<string, any>) => {
    setUploadedFiles(files);
    setFilePayloads(payloads);
  };

  const handleSaveTool = async (tool: Tool) => {
    try {
      setIsSaving(true);
      const currentToolState = playgroundRef.current?.getCurrentTool();
      const toolToSave = currentToolState || tool;

      const saved = await client.upsertWorkflow(toolToSave.id, toolToSave as any);
      if (!saved) throw new Error('Failed to save tool');

      toast({
        title: 'Tool published',
        description: `"${saved.id}" published successfully`
      });

      setCurrentTool(saved);
      setStep('publish');
    } catch (e: any) {
      toast({
        title: 'Error publishing tool',
        description: e.message || 'Unknown error',
        variant: 'destructive'
      });
      throw e;
    } finally {
      setIsSaving(false);
    }
  };

  const handleExecuteTool = async () => {
    try {
      setIsExecuting(true);
      setShouldStopExecution(false);
      setIsStopping(false);
      await playgroundRef.current?.executeTool({ selfHealing: selfHealingEnabled });
    } finally {
      setIsExecuting(false);
      setIsStopping(false);
    }
  };

  const handleStopExecution = () => {
    setShouldStopExecution(true);
    setIsStopping(true);
    toast({
      title: "Stopping tool",
      description: "Tool will stop after the current step completes",
    });
  };

  const handleClose = () => {
    if (onComplete) {
      onComplete();
    } else {
      router.push('/');
    }
  };

  const handleSuccessPageAction = (action: 'view-tool' | 'view-all') => {
    if (action === 'view-tool' && currentTool) {
      router.push(`/tools/${currentTool.id}`);
    } else {
      router.push('/');
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full p-6">
      <div className="flex-none mb-4">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">
            {step === 'publish' ? 'Tool Created!' : 'Create New Tool'}
          </h1>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-200/50 hover:border-blue-300/50 text-blue-600 hover:text-blue-700 text-sm px-4 py-1 h-8 rounded-full animate-pulse shrink-0"
              onClick={() => window.open('https://cal.com/superglue/onboarding', '_blank')}
            >
              ✨ Get help from our team
            </Button>
            <Button variant="ghost" size="icon" className="shrink-0" onClick={handleClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="overflow-y-auto px-1 min-h-0" style={{ scrollbarGutter: 'stable' }}>
          {step === 'build' && (
            <ToolBuilder
              onToolBuilt={handleToolBuilt}
              onCancel={handleClose}
            />
          )}

          {step === 'run' && currentTool && buildContext && (
            <div className="w-full">
              <ToolPlayground
                ref={playgroundRef}
                embedded={true}
                initialTool={currentTool}
                initialPayload={buildContext.payload}
                initialInstruction={buildContext.instruction}
                integrations={integrations}
                onSave={handleSaveTool}
                onInstructionEdit={() => setStep('build')}
                selfHealingEnabled={selfHealingEnabled}
                onSelfHealingChange={setSelfHealingEnabled}
                shouldStopExecution={shouldStopExecution}
                onStopExecution={handleStopExecution}
                uploadedFiles={uploadedFiles}
                filePayloads={filePayloads}
                onFilesChange={handleFilesChange}
              />
            </div>
          )}

          {step === 'publish' && currentTool && (
            <div className="w-full">
              <ToolPlayground
                embedded={true}
                initialTool={currentTool}
                integrations={integrations}
                showSuccessPage={true}
                onSuccessPageAction={handleSuccessPageAction}
                readOnly={true}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
