import { Button } from "@/src/components/ui/button";
import { GitBranch, Plus, ShoppingBag, FilePlus } from "lucide-react";
import React from "react";

interface EmptyStateActionsProps {
  handleCreateNew: () => void;
  handleCreateNewExtract: () => void;
  handleWorkflow: () => void; // Added handleWorkflow prop
  handleCreateExampleShopify: () => void;
  handleWorkflowManual: () => void;
}

const EmptyStateActions: React.FC<EmptyStateActionsProps> = ({
  handleCreateNew,
  handleCreateNewExtract,
  handleWorkflow,   
  handleCreateExampleShopify,
  handleWorkflowManual,
}) => {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 w-full max-w-4xl">
        {/* Add new Workflow Button */}
        <Button
          onClick={handleWorkflow}
          className="h-auto md:h-64 shadow-md hover:shadow-lg transition-all duration-300 rounded-2xl bg-card border border-primary/20 hover:border-primary/30 flex flex-col justify-center p-6" // Adjusted styles
          variant="outline"
          size="lg"
        >
          <div className="flex flex-col items-center justify-center gap-4 md:gap-7">
            <div className="p-4 md:p-6 rounded-full bg-primary/10 hover:bg-primary/15 transition-colors duration-300">
              <GitBranch className="h-12 w-12 md:h-16 md:w-16 text-primary" strokeWidth={1.5} />
            </div>
            <div className="flex flex-col items-center text-center">
              <span className="text-lg md:text-2xl font-semibold mb-1 md:mb-2 max-w-full">Add new Workflow</span>
              <span className="text-muted-foreground text-xs md:text-sm max-w-full">Connect steps together</span>
            </div>
          </div>
        </Button>
       {/* Add new Workflow Button */}
                <Button
          onClick={handleWorkflowManual}
          className="h-auto md:h-64 shadow-md hover:shadow-lg transition-all duration-300 rounded-2xl bg-card border border-primary/20 hover:border-primary/30 flex flex-col justify-center p-6" // Adjusted styles
          variant="outline"
          size="lg"
        >
          <div className="flex flex-col items-center justify-center gap-4 md:gap-7">
            <div className="p-4 md:p-6 rounded-full bg-primary/10 hover:bg-primary/15 transition-colors duration-300">
              <GitBranch className="h-12 w-12 md:h-16 md:w-16 text-primary" strokeWidth={1.5} />
            </div>
            <div className="flex flex-col items-center text-center">
              <span className="text-lg md:text-2xl font-semibold mb-1 md:mb-2 max-w-full">Add new Workflow (Manual)</span>
              <span className="text-muted-foreground text-xs md:text-sm max-w-full">Connect steps together</span>
            </div>
          </div>
        </Button>
      </div>
    </div>
  );
};

export default EmptyStateActions; // Export the new component