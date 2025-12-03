import { Integration } from '@superglue/shared';
import { ToolStepConfigurator } from '../../ToolStepConfigurator';
import { type CategorizedSources } from '../../templates/tiptap/TemplateContext';

interface StepConfigTabProps {
    step: any;
    evolvingPayload: any;
    loopItems: any | null;
    categorizedSources?: CategorizedSources;
    canExecute: boolean;
    integrations?: Integration[];
    onEdit?: (stepId: string, updatedStep: any, isUserInitiated?: boolean) => void;
    onEditingChange?: (editing: boolean) => void;
    onOpenFixStepDialog?: () => void;
}

export function StepConfigTab({
    step,
    evolvingPayload,
    loopItems,
    categorizedSources,
    canExecute,
    integrations,
    onEdit,
    onEditingChange,
    onOpenFixStepDialog,
}: StepConfigTabProps) {
    return (
        <div className="mt-1">
            <ToolStepConfigurator
                step={step}
                isLast={true}
                onEdit={onEdit}
                onRemove={() => {}}
                integrations={integrations}
                onEditingChange={onEditingChange}
                stepInput={evolvingPayload}
                loopItems={loopItems}
                categorizedSources={categorizedSources}
                onOpenFixStepDialog={onOpenFixStepDialog}
                canExecute={canExecute}
            />
        </div>
    );
}

