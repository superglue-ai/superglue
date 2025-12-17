import { ToolStepConfigurator } from '../../ToolStepConfigurator';
import { useExecution } from '../../context';
import { type CategorizedSources } from '../../templates/tiptap/TemplateContext';

interface StepConfigTabProps {
    step: any;
    stepIndex: number;
    evolvingPayload: any;
    dataSelectorOutput: any | null;
    categorizedSources?: CategorizedSources;
    onEdit?: (stepId: string, updatedStep: any, isUserInitiated?: boolean) => void;
    onEditingChange?: (editing: boolean) => void;
    onOpenFixStepDialog?: () => void;
}

export function StepConfigTab({
    step,
    stepIndex,
    evolvingPayload,
    dataSelectorOutput,
    categorizedSources,
    onEdit,
    onEditingChange,
    onOpenFixStepDialog,
}: StepConfigTabProps) {
    const { canExecuteStep } = useExecution();
    const canExecute = canExecuteStep(stepIndex);
    return (
        <div>
            <ToolStepConfigurator
                step={step}
                isLast={true}
                onEdit={onEdit}
                onRemove={() => {}}
                onEditingChange={onEditingChange}
                stepInput={evolvingPayload}
                dataSelectorOutput={dataSelectorOutput}
                categorizedSources={categorizedSources}
                onOpenFixStepDialog={onOpenFixStepDialog}
                canExecute={canExecute}
            />
        </div>
    );
}
