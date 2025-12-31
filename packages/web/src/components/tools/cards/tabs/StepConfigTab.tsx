import { Integration } from "@superglue/shared";
import { ToolStepConfigurator } from "../../ToolStepConfigurator";
import { type CategorizedSources } from "../../templates/tiptap/TemplateContext";

interface StepConfigTabProps {
  step: any;
  evolvingPayload: any;
  dataSelectorOutput: any | null;
  categorizedSources?: CategorizedSources;
  canExecute: boolean;
  integrations?: Integration[];
  onEdit?: (stepId: string, updatedStep: any, isUserInitiated?: boolean) => void;
  onEditingChange?: (editing: boolean) => void;
  onOpenFixStepDialog?: () => void;
  sourceDataVersion?: number;
}

export function StepConfigTab({
  step,
  evolvingPayload,
  dataSelectorOutput,
  categorizedSources,
  canExecute,
  integrations,
  onEdit,
  onEditingChange,
  onOpenFixStepDialog,
  sourceDataVersion,
}: StepConfigTabProps) {
  return (
    <div>
      <ToolStepConfigurator
        step={step}
        isLast={true}
        onEdit={onEdit}
        onRemove={() => {}}
        integrations={integrations}
        onEditingChange={onEditingChange}
        stepInput={evolvingPayload}
        dataSelectorOutput={dataSelectorOutput}
        categorizedSources={categorizedSources}
        onOpenFixStepDialog={onOpenFixStepDialog}
        canExecute={canExecute}
        sourceDataVersion={sourceDataVersion}
      />
    </div>
  );
}
