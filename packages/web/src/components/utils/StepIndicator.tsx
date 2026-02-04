import { cn } from "@/src/lib/general-utils";
import { Check } from "lucide-react";

export type StepperStep = "basic" | "try_and_output" | "save";
export type ToolCreateStep = "systems" | "build" | "run" | "save";

interface StepConfig {
  id: StepperStep | ToolCreateStep;
  title: string;
}

export const API_CREATE_STEPS: StepConfig[] = [
  {
    id: "basic",
    title: "Basic Info",
  },
  {
    id: "try_and_output",
    title: "Try It!",
  },
  {
    id: "save",
    title: "Complete",
  },
];

export const TOOL_CREATE_STEPS: StepConfig[] = [
  {
    id: "systems",
    title: "Systems",
  },
  {
    id: "build",
    title: "Build",
  },
  {
    id: "run",
    title: "Run",
  },
  {
    id: "save",
    title: "Save",
  },
];

interface StepIndicatorProps {
  currentStep: StepperStep | ToolCreateStep;
  steps: StepConfig[];
}

export function StepIndicator({ currentStep, steps }: StepIndicatorProps) {
  const currentIndex = steps.findIndex((s) => s.id === currentStep);

  return (
    <div className="py-3">
      <div className="relative">
        <div className="absolute top-3.5 left-0 w-full h-0.5 bg-muted z-0" />

        <div
          className="absolute top-3.5 left-0 h-0.5 bg-primary transition-all duration-500 ease-in-out z-0"
          style={{ width: `${(currentIndex / (steps.length - 1)) * 100}%` }}
        />

        <div
          className={`relative grid w-full z-10`}
          style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
        >
          {steps.map((step, index) => {
            const isActive = index === currentIndex;
            const isCompleted = index < currentIndex;

            return (
              <div key={step.id} className="flex flex-col items-center z-10">
                <div className="flex flex-col items-center gap-1.5 z-10">
                  <div
                    className={cn(
                      "w-7 h-7 rounded-full border-2 flex items-center justify-center text-sm font-medium transition-all duration-300 z-10",
                      isCompleted && "border-primary bg-primary text-primary-foreground",
                      isActive && "border-primary bg-background text-foreground",
                      !isCompleted && !isActive && "border-muted bg-muted text-muted-foreground",
                    )}
                  >
                    {isCompleted ? <Check className="h-4 w-3.5" /> : index + 1}
                  </div>
                  <span
                    className={cn(
                      "text-xs font-medium text-center px-1 transition-colors duration-300",
                      isActive || isCompleted ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {step.title}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
