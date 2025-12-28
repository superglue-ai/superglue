import { useIntegrations } from '@/src/app/integrations-context';
import { useToast } from '@/src/hooks/use-toast';
import { shouldDebounceAbort } from '@/src/lib/client-utils';
import { Tool } from '@superglue/shared';
import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Button } from '../ui/button';
import { ToolBuilder, type BuildContext } from './ToolBuilder';
import ToolPlayground, { ToolPlaygroundHandle } from './ToolPlayground';
import { SaveToolDialog } from './dialogs/SaveToolDialog';

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
  const [isStopping, setIsStopping] = useState(false);
  const [shouldStopExecution, setShouldStopExecution] = useState(false);
  const [isRebuildingFromPlayground, setIsRebuildingFromPlayground] = useState(false);
  
  const { toast } = useToast();
  const router = useRouter();
  const playgroundRef = useRef<ToolPlaygroundHandle>(null);
  const lastAbortTimeRef = useRef<number>(0);

  const { integrations } = useIntegrations();

  const [currentTool, setCurrentTool] = useState<Tool | null>(null);
  const [buildContext, setBuildContext] = useState<BuildContext | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);
  const [filePayloads, setFilePayloads] = useState<Record<string, any>>({});
  const [showSaveDialog, setShowSaveDialog] = useState(false);
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
    const currentToolState = playgroundRef.current?.getCurrentTool();
    setCurrentTool(currentToolState || tool);
    setShowSaveDialog(true);
  };

  const handleStopExecution = () => {
    if (shouldDebounceAbort(lastAbortTimeRef.current)) return;
    
    lastAbortTimeRef.current = Date.now();
    setShouldStopExecution(true);
    setIsStopping(true);
    toast({
      title: "Execution aborted",
      description: "Tool execution has been aborted",
    });
  };

  const handleToolSaved = (savedTool: Tool) => {
    router.push(`/tools/${savedTool.id}`);
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
                onFilesChange={handleFilesChange}
                onRebuildStart={() => setIsRebuildingFromPlayground(true)}
                onRebuildEnd={() => setIsRebuildingFromPlayground(false)}
              />
              <SaveToolDialog
                tool={currentTool}
                isOpen={showSaveDialog}
                onClose={() => setShowSaveDialog(false)}
                onSaved={handleToolSaved}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}