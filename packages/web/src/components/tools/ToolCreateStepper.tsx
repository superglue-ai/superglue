import { useSystems } from "@/src/app/systems-context";
import { useToast } from "@/src/hooks/use-toast";
import { shouldDebounceAbort } from "@/src/lib/client-utils";
import { System, Tool } from "@superglue/shared";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "../ui/button";
import { ToolBuilder, type BuildContext } from "./ToolBuilder";
import ToolPlayground, { ToolPlaygroundHandle } from "./ToolPlayground";
import { SaveToolDialog } from "./dialogs/SaveToolDialog";

type ToolCreateStep = "build" | "run";
type ToolBuilderView = "systems" | "instructions";

interface ToolCreateStepperProps {
  onComplete?: () => void;
  initialSystemIds?: string[];
  initialView?: ToolBuilderView;
}

export function ToolCreateStepper({
  onComplete,
  initialSystemIds = [],
  initialView = "systems",
}: ToolCreateStepperProps) {
  const [step, setStep] = useState<ToolCreateStep>("build");
  const [shouldStopExecution, setShouldStopExecution] = useState(false);

  const { toast } = useToast();
  const router = useRouter();
  const playgroundRef = useRef<ToolPlaygroundHandle>(null);
  const lastAbortTimeRef = useRef<number>(0);

  const { systems } = useSystems();

  const [currentTool, setCurrentTool] = useState<Tool | null>(null);
  const [buildContext, setBuildContext] = useState<BuildContext | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);
  const [filePayloads, setFilePayloads] = useState<Record<string, any>>({});
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const saveResolveRef = useRef<((success: boolean) => void) | null>(null);

  const handleToolBuilt = (tool: Tool, context: BuildContext) => {
    setCurrentTool(tool);
    setBuildContext(context);
    setUploadedFiles(context.uploadedFiles);
    setFilePayloads(context.filePayloads);
    setStep("run");
  };

  const handleFilesChange = (files: any[], payloads: Record<string, any>) => {
    setUploadedFiles(files);
    setFilePayloads(payloads);
  };

  const handleSaveTool = (tool: Tool, _payload: Record<string, any>): Promise<void> => {
    return new Promise((resolve, reject) => {
      const currentToolState = playgroundRef.current?.getCurrentTool();
      setCurrentTool(currentToolState || tool);
      saveResolveRef.current = (success: boolean) =>
        success ? resolve() : reject(new Error("cancelled"));
      setShowSaveDialog(true);
    });
  };

  const handleStopExecution = () => {
    if (shouldDebounceAbort(lastAbortTimeRef.current)) return;

    lastAbortTimeRef.current = Date.now();
    setShouldStopExecution(true);
    toast({
      title: "Execution aborted",
      description: "Tool execution has been aborted",
    });
  };

  const handleToolSaved = (savedTool: Tool) => {
    saveResolveRef.current?.(true);
    saveResolveRef.current = null;
    router.push(`/tools/${savedTool.id}`);
  };

  const handleSaveDialogClose = () => {
    saveResolveRef.current?.(false);
    saveResolveRef.current = null;
    setShowSaveDialog(false);
  };
  return (
    <div className="flex-1 flex flex-col h-full p-6">
      <div className="flex justify-end mb-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onComplete}
          className="h-8 w-8 rounded-full hover:bg-muted"
          title="Close"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="overflow-y-auto px-1 min-h-0" style={{ scrollbarGutter: "stable" }}>
          {step === "build" && (
            <ToolBuilder
              initialView={initialView}
              initialSystemIds={initialSystemIds}
              onToolBuilt={handleToolBuilt}
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
                systems={systems}
                onSave={handleSaveTool}
                shouldStopExecution={shouldStopExecution}
                onStopExecution={handleStopExecution}
                uploadedFiles={uploadedFiles}
                filePayloads={filePayloads}
                onFilesChange={handleFilesChange}
              />
              <SaveToolDialog
                tool={currentTool}
                isOpen={showSaveDialog}
                onClose={handleSaveDialogClose}
                onSaved={handleToolSaved}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
