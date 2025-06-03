import { Button } from "@/src/components/ui/button";
import { FileEdit, GitBranch, Zap } from "lucide-react";
import React from "react";

interface EmptyStateActionsProps {
  handleWorkflow: () => void;
  handleTransform: () => void;
  handleWorkflowManual: () => void;
}

const EmptyStateActions: React.FC<EmptyStateActionsProps> = ({
  handleWorkflow,
  handleTransform,
  handleWorkflowManual,
}) => {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 w-full max-w-4xl mb-6">
        {/* Workflow Button */}
        <Button
          onClick={handleWorkflow}
          className="h-auto md:h-64 shadow-md hover:shadow-lg transition-all duration-300 rounded-2xl bg-card border border-primary/20 hover:border-primary/30 flex flex-col justify-center p-6"
          variant="outline"
          size="lg"
        >
          <div className="flex flex-col items-center justify-center gap-4 md:gap-7">
            <div className="p-4 md:p-6 rounded-full bg-primary/10 hover:bg-primary/15 transition-colors duration-300">
              <GitBranch className="h-12 w-12 md:h-16 md:w-16 text-primary" strokeWidth={1.5} />
            </div>
            <div className="flex flex-col items-center text-center">
              <span className="text-lg md:text-2xl font-semibold mb-1 md:mb-2 max-w-full">Workflow</span>
              <span className="text-muted-foreground text-xs md:text-sm max-w-full">Connect steps together</span>
            </div>
          </div>
        </Button>

        {/* Transform Button */}
        <Button
          onClick={handleTransform}
          className="h-auto md:h-64 shadow-md hover:shadow-lg transition-all duration-300 rounded-2xl bg-card border border-primary/20 hover:border-primary/30 flex flex-col justify-center p-6"
          variant="outline"
          size="lg"
        >
          <div className="flex flex-col items-center justify-center gap-4 md:gap-7">
            <div className="p-4 md:p-6 rounded-full bg-primary/10 hover:bg-primary/15 transition-colors duration-300">
              <Zap className="h-12 w-12 md:h-16 md:w-16 text-primary" strokeWidth={1.5} />
            </div>
            <div className="flex flex-col items-center text-center">
              <span className="text-lg md:text-2xl font-semibold mb-1 md:mb-2 max-w-full">Transform</span>
              <span className="text-muted-foreground text-xs md:text-sm max-w-full">Process and transform data</span>
            </div>
          </div>
        </Button>
      </div>

      {/* Manual Workflow - Smaller Option */}
      <Button
        onClick={handleWorkflowManual}
        className="h-auto shadow-sm hover:shadow-md transition-all duration-300 rounded-xl bg-card border border-muted hover:border-primary/20 flex items-center gap-3 p-4"
        variant="outline"
        size="sm"
      >
        <FileEdit className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
        <span className="text-sm font-medium">Create Manual Workflow</span>
      </Button>
    </div>
  );
};

export default EmptyStateActions;