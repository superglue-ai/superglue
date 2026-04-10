"use client";

import { cn } from "@/src/lib/general-utils";
import { Lightbulb, Play } from "lucide-react";
import React, { useImperativeHandle, useCallback } from "react";
import { SystemCarousel } from "@/src/components/ui/rotating-icon-gallery";
import { SystemConfig } from "@superglue/shared";

const EXAMPLES = {
  CAPABILITIES: {
    title: "What can superglue do for you?",
    description: "Explain superglue's capabilities",
    user: "What can I do with superglue?",
  },
  TEMPLATES: {
    title: "Give me a demo",
    description: "Show me what superglue can do",
    user: "Give me a demo.",
    hiddenStarterMessage:
      "After a brief welcome message, call load_skill with skills ['demos'] and follow it exactly. Narrate each step briefly and map it to real customer systems.",
  },
};

interface GlassButtonProps {
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
  gradient: string;
  iconGradient: string;
}

function GlassButton({
  onClick,
  icon,
  title,
  description,
  gradient,
  iconGradient,
}: GlassButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative w-full text-left p-4 rounded-2xl transition-all duration-300",
        "bg-gradient-to-br from-muted/50 to-muted/30 dark:from-muted/50 dark:to-muted/30",
        "backdrop-blur-sm border border-border/50 dark:border-border/70",
        "shadow-sm",
        "hover:shadow-md hover:border-border/80 dark:hover:border-border",
        "hover:scale-[1.01] active:scale-[0.99]",
        "overflow-hidden",
      )}
    >
      <div
        className={cn(
          "absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300",
          "bg-gradient-to-br",
          gradient,
        )}
      />
      <div className="relative flex items-center gap-4">
        <div
          className={cn(
            "relative w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
            "transition-transform duration-300 group-hover:scale-105",
            iconGradient,
          )}
        >
          {icon}
        </div>
        <div className="space-y-0.5 min-w-0">
          <h3 className="font-medium text-sm text-foreground/90 dark:text-foreground/95 group-hover:text-foreground transition-colors truncate">
            {title}
          </h3>
          <p className="text-xs text-muted-foreground/80 dark:text-muted-foreground/90 group-hover:text-muted-foreground transition-colors line-clamp-1">
            {description}
          </p>
        </div>
      </div>
    </button>
  );
}

export interface AgentWelcomeRef {
  cleanup: () => void;
}

interface AgentWelcomeProps {
  onStartPrompt: (
    userPrompt: string,
    hiddenStarterMessage?: string,
    options?: { hideUserMessage?: boolean; chatTitle?: string; chatIcon?: string },
  ) => void;
  ref?: React.Ref<AgentWelcomeRef>;
}

export function AgentWelcome({ onStartPrompt, ref }: AgentWelcomeProps) {
  const cleanup = () => {
    return;
  };

  useImperativeHandle(ref, () => ({
    cleanup,
  }));

  const handleSystemSelect = useCallback(
    (key: string, label: string, config: SystemConfig) => {
      const hiddenStarterMessage = [
        "The user selected a system template.",
        config.apiUrl ? `Suggested API URL: ${config.apiUrl}` : null,
        config.docsUrl ? `Documentation URL: ${config.docsUrl}` : null,
        config.openApiUrl ? `OpenAPI URL: ${config.openApiUrl}` : null,
        config.preferredAuthType ? `Suggested auth type: ${config.preferredAuthType}` : null,
        `OAuth available: ${config.oauth ? "yes" : "no"}`,
        config.systemSpecificInstructions
          ? `Template-specific instructions: ${config.systemSpecificInstructions}`
          : null,
      ]
        .filter(Boolean)
        .join("\n");
      const prompt = `I want to set up ${label}`;
      onStartPrompt(prompt, hiddenStarterMessage, {
        hideUserMessage: true,
        chatTitle: label,
        chatIcon: config.icon,
      });
    },
    [onStartPrompt],
  );

  return (
    <div className="space-y-6 p-6">
      <div className="text-center">
        <h1 className="text-2xl md:text-2xl font-normal text-muted-foreground/30">Hi there.</h1>
      </div>

      <div className="mx-auto max-w-3xl">
        <SystemCarousel onSystemSelect={handleSystemSelect} showNavArrows />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mx-auto max-w-3xl">
        <GlassButton
          onClick={() =>
            onStartPrompt(EXAMPLES.CAPABILITIES.user, undefined, {
              hideUserMessage: true,
            })
          }
          icon={<Lightbulb className="w-5 h-5" />}
          title={EXAMPLES.CAPABILITIES.title}
          description={EXAMPLES.CAPABILITIES.description}
          gradient="from-muted/20 via-transparent to-transparent"
          iconGradient="bg-muted text-muted-foreground"
        />

        <GlassButton
          onClick={() => {
            onStartPrompt(EXAMPLES.TEMPLATES.user, EXAMPLES.TEMPLATES.hiddenStarterMessage, {
              hideUserMessage: true,
            });
          }}
          icon={<Play className="w-5 h-5" />}
          title={EXAMPLES.TEMPLATES.title}
          description={EXAMPLES.TEMPLATES.description}
          gradient="from-muted/20 via-transparent to-transparent"
          iconGradient="bg-muted text-muted-foreground"
        />
      </div>
    </div>
  );
}
