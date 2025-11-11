import { useConfig } from '@/src/app/config-context';
import { useIntegrations } from '@/src/app/integrations-context';
import { useToast } from '@/src/hooks/use-toast';
import { createSuperglueClient } from '@/src/lib/client-utils';
import { Workflow as Tool } from '@superglue/client';
import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Button } from '../ui/button';
import { ToolBuilder, type BuildContext } from './ToolBuilder';
import ToolPlayground, { ToolPlaygroundHandle } from './ToolPlayground';
import { ToolDeployModal } from './deploy/ToolDeployModal';

type ToolCreateStep = 'build' | 'run';
type ToolBuilderView = 'integrations' | 'instructions';

interface ToolCreateStepperProps {
  onComplete?: () => void;
  initialIntegrationIds?: string[];
  initialView?: ToolBuilderView;
}

export function ToolCreateStepper({ 
  onComplete,
  initialIntegrationIds = [],
  initialView = 'integrations'
}: ToolCreateStepperProps) {
  const [step, setStep] = useState<ToolCreateStep>('build');
  const [isSaving, setIsSaving] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [shouldStopExecution, setShouldStopExecution] = useState(false);
  const [isRebuildingFromPlayground, setIsRebuildingFromPlayground] = useState(false);
  
  const { toast } = useToast();
  const router = useRouter();
  const superglueConfig = useConfig();
  const playgroundRef = useRef<ToolPlaygroundHandle>(null);

  const { integrations } = useIntegrations();

  const [currentTool, setCurrentTool] = useState<Tool | null>(null);
  const [buildContext, setBuildContext] = useState<BuildContext | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);
  const [filePayloads, setFilePayloads] = useState<Record<string, any>>({});
  const [toolPayload, setToolPayload] = useState<Record<string, any>>({});
  const [showDeployModal, setShowDeployModal] = useState(false);
  const [hasDeployModalBeenShown, setHasDeployModalBeenShown] = useState(false);
  const [userSelectedIntegrations, setUserSelectedIntegrations] = useState<string[]>(initialIntegrationIds);

  const handleToolBuilt = (tool: Tool, context: BuildContext) => {
    setCurrentTool(tool);
    setBuildContext(context);
    setUploadedFiles(context.uploadedFiles);
    setFilePayloads(context.filePayloads);
    setUserSelectedIntegrations(context.integrationIds);
    setStep('run');
  };

  const handleFilesChange = (files: any[], payloads: Record<string, any>) => {
    setUploadedFiles(files);
    setFilePayloads(payloads);
  };

  const handleSaveTool = async (tool: Tool, payload: Record<string, any>) => {
    try {
      setIsSaving(true);
      const currentToolState = playgroundRef.current?.getCurrentTool();
      const toolToSave = currentToolState || tool;

      const client = createSuperglueClient(superglueConfig.superglueEndpoint);
      const saved = await client.upsertWorkflow(toolToSave.id, toolToSave as any);
      if (!saved) throw new Error('Failed to save tool');

      toast({
        title: 'Tool saved',
        description: `"${saved.id}" saved successfully`
      });

      setCurrentTool(saved);
      setToolPayload(payload);

      if(!hasDeployModalBeenShown) {
        setHasDeployModalBeenShown(true);
        setShowDeployModal(true);
      }
    } catch (e: any) {
      toast({
        title: 'Error saving tool',
        description: e.message || 'Unknown error',
        variant: 'destructive'
      });
      throw e;
    } finally {
      setIsSaving(false);
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
    if (isRebuildingFromPlayground) {
      playgroundRef.current?.closeRebuild();
      setIsRebuildingFromPlayground(false);
      return;
    }
    
    if (onComplete) {
      onComplete();
    } else {
      router.push('/');
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full p-6">
      <div className="flex-none mb-4">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">
            Create New Tool
          </h1>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-200/50 hover:border-blue-300/50 text-blue-600 hover:text-blue-700 text-sm px-4 py-1 h-8 rounded-full animate-pulse shrink-0"
              onClick={() =>
                window.open("https://cal.com/superglue/onboarding", "_blank")
              }
            >
              ✨ Get help from our team
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={handleClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <div
          className="overflow-y-auto px-1 min-h-0"
          style={{ scrollbarGutter: "stable" }}
        >
          {step === "build" && (
            <ToolBuilder
              initialView={initialView}
              initialIntegrationIds={initialIntegrationIds}
              onToolBuilt={handleToolBuilt}
              onCancel={handleClose}
            />
          )}

          {step === "run" && currentTool && buildContext && (
            <div className="w-full">
              <ToolPlayground
                ref={playgroundRef}
                embedded={true}
                initialTool={currentTool}
                initialPayload={buildContext.payload}
                initialInstruction={buildContext.instruction}
                integrations={integrations}
                onSave={handleSaveTool}
                onInstructionEdit={() => setStep("build")}
                shouldStopExecution={shouldStopExecution}
                onStopExecution={handleStopExecution}
                uploadedFiles={uploadedFiles}
                filePayloads={filePayloads}
                onFilesChange={handleFilesChange}
                userSelectedIntegrationIds={userSelectedIntegrations}
                onRebuildStart={() => setIsRebuildingFromPlayground(true)}
                onRebuildEnd={() => setIsRebuildingFromPlayground(false)}
              />
              <ToolDeployModal
                currentTool={currentTool}
                payload={toolPayload}
                isOpen={showDeployModal}
                onClose={() => setShowDeployModal(false)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}