import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { FileEdit, GitBranch, MoreHorizontal, Zap } from "lucide-react";
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 w-full max-w-4xl">
        {/* Workflow Button with Dropdown */}
        <div className="relative">
          <Button
            onClick={handleWorkflow}
            className="h-auto md:h-80 shadow-md hover:shadow-lg transition-all duration-300 rounded-2xl bg-card border border-primary/20 hover:border-primary/30 flex flex-col justify-center p-6 w-full group"
            variant="outline"
            size="lg"
          >
            <div className="flex flex-col items-center justify-center gap-4 md:gap-7">
              <div className="p-4 md:p-6 rounded-full bg-primary/25 transition-colors duration-300">
                <GitBranch className="h-12 w-12 md:h-16 md:w-16 text-foreground group-hover:text-foreground" strokeWidth={1.5} />
              </div>
              <div className="flex flex-col items-center text-center">
                <span className="text-lg md:text-2xl font-semibold mb-1 md:mb-2 max-w-full">Workflow</span>
                <span className="text-muted-foreground text-xs md:text-sm max-w-full">Execute a series of steps</span>
              </div>
            </div>
          </Button>

          {/* Dropdown Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="absolute top-2 right-2 h-8 w-8 p-0 hover:bg-primary/10"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleWorkflowManual}>
                <FileEdit className="mr-2 h-4 w-4" />
                Create Manual Workflow
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Transform Button */}
        <Button
          onClick={handleTransform}
          className="h-auto md:h-80 shadow-md hover:shadow-lg transition-all duration-300 rounded-2xl bg-card border border-primary/20 hover:border-primary/30 flex flex-col justify-center p-6"
          variant="outline"
          size="lg"
        >
          <div className="flex flex-col items-center justify-center gap-4 md:gap-7">
            <div className="p-4 md:p-6 rounded-full bg-primary/25 transition-colors duration-300">
              <Zap className="h-12 w-12 md:h-16 md:w-16 text-foreground group-hover:text-foreground" strokeWidth={1.5} />
            </div>
            <div className="flex flex-col items-center text-center">
              <span className="text-lg md:text-2xl font-semibold mb-1 md:mb-2 max-w-full">Transform</span>
              <span className="text-muted-foreground text-xs md:text-sm max-w-full">Process and transform data</span>
            </div>
          </div>
        </Button>
      </div>
    </div>
  );
};

export default EmptyStateActions;