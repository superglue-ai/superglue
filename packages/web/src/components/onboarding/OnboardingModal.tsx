"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { cn } from "@/src/lib/general-utils";
import { useToolsOptional } from "@/src/app/tools-context";
import { useSystemsOptional } from "@/src/app/systems-context";
import { SystemIcon } from "@/src/components/ui/system-icon";
import {
  ChevronLeft,
  ChevronRight,
  Database,
  Mail,
  TrendingUp,
  Workflow,
  Play,
} from "lucide-react";

const ONBOARDING_STORAGE_KEY = "superglue-onboarding-seen";

// IDs from seed-config.ts
const SEEDED_SYSTEM_IDS = ["stock-market", "superglue-email", "lego-database"];
const SEEDED_TOOL_IDS = ["stock-email-alert"];

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  content: React.ReactNode;
}

function StepIndicator({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {Array.from({ length: totalSteps }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "h-1.5 rounded-full transition-all duration-300",
            i === currentStep
              ? "w-6 bg-foreground/70"
              : i < currentStep
                ? "w-1.5 bg-foreground/40"
                : "w-1.5 bg-muted-foreground/30",
          )}
        />
      ))}
    </div>
  );
}

function WelcomeStep() {
  return (
    <div className="min-h-[300px] flex flex-col justify-center space-y-6 text-center">
      <div className="space-y-3 mb-10">
        <p className="text-lg text-muted-foreground">Welcome to</p>
        <img src="/logo.svg" alt="superglue" className="h-12 mx-auto" />
      </div>
      <p className="text-base text-muted-foreground max-w-sm mx-auto leading-relaxed">
        We've set up some demo systems and a sample tool to help you explore what superglue can do.
      </p>
    </div>
  );
}

function SystemsStep() {
  const systems = [
    {
      id: "stock-market",
      name: "Stock Market Data",
      icon: "lucide:chart-line",
      description: "Real-time stock data & crypto prices",
    },
    {
      id: "superglue-email",
      name: "Email Service",
      icon: "lucide:mail",
      description: "Send notifications to your inbox",
    },
    {
      id: "lego-database",
      name: "Lego Database",
      icon: "lucide:database",
      description: "26,000+ sets to query with SQL",
    },
  ];

  return (
    <div className="min-h-[300px] flex flex-col justify-center space-y-5">
      <div className="text-center">
        <h3 className="text-lg font-medium text-foreground/90">Pre-configured Systems</h3>
        <p className="text-sm text-muted-foreground mt-1">Ready to use, no setup required</p>
      </div>
      <div className="space-y-2">
        {systems.map((system) => (
          <div
            key={system.id}
            className={cn(
              "flex items-center gap-3 p-3 rounded-2xl",
              "bg-gradient-to-br from-muted/50 to-muted/30 dark:from-muted/40 dark:to-muted/20",
              "border border-border/50",
            )}
          >
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
              <SystemIcon
                system={{ icon: system.icon }}
                size={20}
                className="text-muted-foreground"
              />
            </div>
            <div className="min-w-0">
              <h4 className="font-medium text-sm text-foreground/90">{system.name}</h4>
              <p className="text-xs text-muted-foreground/80">{system.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ToolStep() {
  return (
    <div className="min-h-[300px] flex flex-col justify-center space-y-5">
      <div className="text-center">
        <h3 className="text-lg font-medium text-foreground/90">Your First Tool</h3>
        <p className="text-sm text-muted-foreground mt-1">A workflow combining multiple systems</p>
      </div>
      <div
        className={cn(
          "p-4 rounded-2xl",
          "bg-gradient-to-br from-muted/50 to-muted/30 dark:from-muted/40 dark:to-muted/20",
          "border border-border/50",
        )}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
            <Workflow className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <h4 className="font-medium text-foreground/90">Stock Email Alert</h4>
            <p className="text-xs text-muted-foreground/80">Multi-step workflow</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-4">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted/80">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Stock Market</span>
          </div>
          <span className="text-muted-foreground/50">→</span>
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted/80">
            <Mail className="w-3.5 h-3.5" />
            <span>Email</span>
          </div>
        </div>
        <p className="text-sm text-muted-foreground/80 leading-relaxed">
          Fetches real-time stock data and sends a formatted email to your inbox.
        </p>
      </div>
    </div>
  );
}

function GetStartedStep({
  onTryTool,
  onNavigate,
}: {
  onTryTool: () => void;
  onNavigate: (path: string) => void;
}) {
  return (
    <div className="min-h-[300px] flex flex-col justify-center space-y-5">
      <div className="text-center">
        <h3 className="text-lg font-medium text-foreground/90">Ready to explore</h3>
        <p className="text-sm text-muted-foreground mt-1">Here's what you can do next</p>
      </div>
      <div className="space-y-2">
        <button
          onClick={onTryTool}
          className={cn(
            "group relative w-full text-left p-4 rounded-2xl transition-all duration-300",
            "bg-gradient-to-br from-muted/50 to-muted/30 dark:from-muted/40 dark:to-muted/20",
            "backdrop-blur-sm border border-border/50",
            "hover:shadow-md hover:border-border/80",
            "hover:scale-[1.01] active:scale-[0.99]",
          )}
        >
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-105">
              <Play className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="space-y-0.5 min-w-0">
              <h4 className="font-medium text-sm text-foreground/90 group-hover:text-foreground transition-colors">
                Run the demo tool
              </h4>
              <p className="text-xs text-muted-foreground/80 group-hover:text-muted-foreground transition-colors">
                Execute Stock Email Alert and check your inbox
              </p>
            </div>
          </div>
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onNavigate("/systems")}
            className={cn(
              "group flex flex-col items-center gap-2 p-4 rounded-2xl text-center transition-all duration-300",
              "bg-gradient-to-br from-muted/50 to-muted/30 dark:from-muted/40 dark:to-muted/20",
              "border border-border/50",
              "hover:shadow-md hover:border-border/80",
              "hover:scale-[1.01] active:scale-[0.99]",
            )}
          >
            <Database className="w-5 h-5 text-muted-foreground group-hover:text-foreground/70 transition-colors" />
            <span className="text-xs font-medium text-foreground/80 group-hover:text-foreground transition-colors">
              Browse Systems
            </span>
          </button>
          <button
            onClick={() => onNavigate("/tools")}
            className={cn(
              "group flex flex-col items-center gap-2 p-4 rounded-2xl text-center transition-all duration-300",
              "bg-gradient-to-br from-muted/50 to-muted/30 dark:from-muted/40 dark:to-muted/20",
              "border border-border/50",
              "hover:shadow-md hover:border-border/80",
              "hover:scale-[1.01] active:scale-[0.99]",
            )}
          >
            <Workflow className="w-5 h-5 text-muted-foreground group-hover:text-foreground/70 transition-colors" />
            <span className="text-xs font-medium text-foreground/80 group-hover:text-foreground transition-colors">
              View Tools
            </span>
          </button>
        </div>
      </div>
      <p className="text-xs text-center text-muted-foreground/60">
        Or just ask the AI agent anything
      </p>
    </div>
  );
}

export function OnboardingModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const toolsContext = useToolsOptional();
  const tools = toolsContext?.tools ?? [];
  const toolsLoading = toolsContext?.isInitiallyLoading ?? true;
  const systemsContext = useSystemsOptional();
  const systems = systemsContext?.systems ?? [];
  const systemsLoading = systemsContext?.loading ?? true;
  const router = useRouter();

  // Check if user has seeded content and hasn't seen onboarding
  useEffect(() => {
    if (!toolsContext || !systemsContext || toolsLoading || systemsLoading) return;

    const hasSeenOnboarding = localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (hasSeenOnboarding) return;

    // Check if user has the seeded systems
    const hasSeededSystems = SEEDED_SYSTEM_IDS.some((id) => systems.some((s) => s.id === id));

    // Check if user has the seeded tool
    const hasSeededTool = SEEDED_TOOL_IDS.some((id) => tools.some((t) => t.id === id));

    // Show onboarding if they have seeded content (new user)
    if (hasSeededSystems || hasSeededTool) {
      // Small delay to let the page settle
      const timer = setTimeout(() => setIsOpen(true), 500);
      return () => clearTimeout(timer);
    }
  }, [tools, systems, toolsLoading, systemsLoading, toolsContext, systemsContext]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleDismiss = useCallback(() => {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
    setIsOpen(false);
  }, []);

  const handleTryTool = useCallback(() => {
    handleDismiss();
    // Route to agent with prompt
    const prompt = encodeURIComponent(
      "Run the stock-email-alert tool for me with the default stock symbol AAPL",
    );
    router.push(`/?prompt=${prompt}`);
  }, [handleDismiss, router]);

  const handleNavigate = useCallback(
    (path: string) => {
      handleDismiss();
      router.push(path);
    },
    [handleDismiss, router],
  );

  const steps: OnboardingStep[] = [
    {
      id: "welcome",
      title: "Welcome",
      description: "Get started with superglue",
      content: <WelcomeStep />,
    },
    {
      id: "systems",
      title: "Systems",
      description: "Pre-configured integrations",
      content: <SystemsStep />,
    },
    {
      id: "tool",
      title: "Tool",
      description: "Your first workflow",
      content: <ToolStep />,
    },
    {
      id: "get-started",
      title: "Get Started",
      description: "What's next",
      content: <GetStartedStep onTryTool={handleTryTool} onNavigate={handleNavigate} />,
    },
  ];

  const isLastStep = currentStep === steps.length - 1;
  const isFirstStep = currentStep === 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[420px] p-0 gap-0 overflow-hidden border-border/50">
        <DialogHeader className="sr-only">
          <DialogTitle>Welcome to superglue</DialogTitle>
          <DialogDescription>
            A quick tour of your pre-configured demo environment
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 pb-4">{steps[currentStep].content}</div>

        <div className="px-6 pb-6 space-y-4">
          <StepIndicator currentStep={currentStep} totalSteps={steps.length} />

          <div className="flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentStep((s) => s - 1)}
              disabled={isFirstStep}
              className={cn("rounded-xl", isFirstStep && "invisible")}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>

            {isLastStep ? (
              <Button size="sm" onClick={handleDismiss} className="rounded-xl">
                Get Started
              </Button>
            ) : (
              <Button size="sm" onClick={() => setCurrentStep((s) => s + 1)} className="rounded-xl">
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </div>

          <button
            onClick={handleDismiss}
            className="w-full text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            Skip tour
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
