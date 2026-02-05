"use client";

import { Button } from "@/src/components/ui/button";
import { MiniCard } from "@/src/components/ui/mini-card";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { resolveSystemIcon } from "@/src/lib/general-utils";
import { cn } from "@/src/lib/general-utils";
import { Blocks, Check, FileText, FlaskConical, Hammer, KeyRound, Loader2 } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { useSystemConfig } from "./context";
import { SectionStatus, SystemContextForAgent, SystemSection } from "./context/types";
import { ConfigurationSection } from "./sections/ConfigurationSection";
import { AuthenticationSection } from "./sections/AuthenticationSection";
import { ContextSection } from "./sections/ContextSection";
import { useRightSidebar } from "../sidebar/RightSidebarContext";

const SECTIONS: SystemSection[] = ["configuration", "authentication", "context"];

const SECTION_CONFIG: Record<SystemSection, { icon: React.ElementType; label: string }> = {
  configuration: { icon: Blocks, label: "Configuration" },
  authentication: { icon: KeyRound, label: "Authentication" },
  context: { icon: FileText, label: "Documentation" },
};

function getStatusColor(status: SectionStatus, isActive: boolean) {
  if (status.hasErrors) {
    return { text: "text-red-600 dark:text-red-400", dot: "bg-red-600 dark:bg-red-400" };
  }
  if (status.isComplete) {
    return { text: "text-green-600 dark:text-green-400", dot: "bg-green-600 dark:bg-green-400" };
  }
  if (isActive) {
    return {
      text: "text-orange-600 dark:text-orange-400",
      dot: "bg-orange-600 dark:bg-orange-400",
    };
  }
  return { text: "text-muted-foreground", dot: "bg-muted-foreground" };
}

function SystemIconDisplay({ system }: { system: { icon?: string; templateName?: string } }) {
  const resolved = resolveSystemIcon(system);

  if (!resolved) {
    return <Blocks className="h-5 w-5 text-muted-foreground" />;
  }

  if (resolved.type === "lucide") {
    const iconName = resolved.name.charAt(0).toUpperCase() + resolved.name.slice(1);
    const LucideIcon = (LucideIcons as any)[iconName];
    if (LucideIcon) {
      return <LucideIcon className="h-5 w-5 text-primary" />;
    }
    return <Blocks className="h-5 w-5 text-muted-foreground" />;
  }

  if (resolved.type === "simpleicons") {
    return (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill={`#${resolved.icon.hex}`}
        className="flex-shrink-0"
      >
        <path d={resolved.icon.path} />
      </svg>
    );
  }

  return <Blocks className="h-5 w-5 text-muted-foreground" />;
}

export function SystemPlayground() {
  const router = useRouter();
  const {
    sendMessageToAgent,
    setShowAgent,
    setAgentMode,
    setSystemConfig: setContextSystemConfig,
    agentPortalRef,
    AgentSidebarComponent,
  } = useRightSidebar();

  const {
    system,
    activeSection,
    setActiveSection,
    getSectionStatus,
    getSystemContextForAgent,
    saveSystem,
    isSaving,
    isNewSystem,
  } = useSystemConfig();

  const [justSaved, setJustSaved] = useState(false);

  const systemConfigForAgent = useMemo(
    () => getSystemContextForAgent(),
    [getSystemContextForAgent],
  );

  useEffect(() => {
    setAgentMode("system");
    setShowAgent(true);

    return () => {
      setAgentMode("tool");
      setContextSystemConfig(undefined);
      setShowAgent(false);
    };
  }, [setAgentMode, setContextSystemConfig, setShowAgent]);

  useEffect(() => {
    setContextSystemConfig(systemConfigForAgent);
  }, [setContextSystemConfig, systemConfigForAgent]);

  const canSave = useMemo(() => {
    return Boolean(system.id?.trim() && system.urlHost?.trim());
  }, [system.id, system.urlHost]);

  const handleSave = useCallback(async () => {
    const success = await saveSystem();
    if (success) {
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
      if (isNewSystem && system.id) {
        router.replace(`/systems/${encodeURIComponent(system.id)}`);
      }
    }
  }, [saveSystem, isNewSystem, system.id, router]);

  const handleBuildTool = useCallback(() => {
    router.push(`/tools?system=${encodeURIComponent(system.id)}`);
  }, [router, system.id]);

  const handleTestSystem = useCallback(() => {
    if (!system.id) return;

    const testPrompt = `Test my current system configuration for "${system.id}" via call_system.`;

    setShowAgent(true);
    sendMessageToAgent(testPrompt);
  }, [system.id, setShowAgent, sendMessageToAgent]);

  const renderSectionContent = () => {
    switch (activeSection) {
      case "configuration":
        return <ConfigurationSection />;
      case "authentication":
        return <AuthenticationSection />;
      case "context":
        return <ContextSection />;
      default:
        return null;
    }
  };

  const activeIndex = SECTIONS.indexOf(activeSection);

  const handleNavigation = useCallback(
    (direction: "prev" | "next") => {
      const newIndex =
        direction === "prev"
          ? Math.max(0, activeIndex - 1)
          : Math.min(SECTIONS.length - 1, activeIndex + 1);
      if (newIndex !== activeIndex) {
        setActiveSection(SECTIONS[newIndex]);
      }
    },
    [activeIndex, setActiveSection],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable
      )
        return;

      if (e.key === "ArrowLeft" && activeIndex > 0) {
        e.preventDefault();
        handleNavigation("prev");
      } else if (e.key === "ArrowRight" && activeIndex < SECTIONS.length - 1) {
        e.preventDefault();
        handleNavigation("next");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, handleNavigation]);

  return (
    <div className="flex flex-col h-full w-full px-6 py-3">
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          {system.id ? (
            <SystemIconDisplay system={system} />
          ) : (
            <Blocks className="h-5 w-5 text-muted-foreground" />
          )}
          <h1 className="text-xl font-semibold">{system.id ? system.id : "New System"}</h1>
        </div>

        <div className="flex items-center gap-2">
          {system.id && (
            <Button variant="outline" size="sm" onClick={handleTestSystem} className="gap-1.5">
              <FlaskConical className="h-4 w-4" />
              Test System
            </Button>
          )}

          {!isNewSystem && system.id && (
            <Button variant="outline" size="sm" onClick={handleBuildTool} className="gap-1.5">
              <Hammer className="h-4 w-4" />
              Build Tool
            </Button>
          )}

          <Button
            variant="glass-primary"
            size="sm"
            onClick={handleSave}
            disabled={!canSave || isSaving}
            className="gap-1.5 min-w-[90px]"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : justSaved ? (
              <>
                <Check className="h-4 w-4" />
                Saved
              </>
            ) : (
              "Save"
            )}
          </Button>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-center gap-4 py-3">
          <div className="flex items-center gap-8">
            {SECTIONS.map((section) => {
              const config = SECTION_CONFIG[section];
              const Icon = config.icon;
              const isActive = activeSection === section;
              const status = getSectionStatus(section);
              const statusColor = getStatusColor(status, isActive);

              return (
                <MiniCard
                  key={section}
                  isActive={isActive}
                  onClick={() => setActiveSection(section)}
                  width={180}
                  height={110}
                >
                  <div className="flex-1 flex flex-col items-center justify-center">
                    <div
                      className={cn(
                        "p-2 rounded-full",
                        isActive ? "bg-primary/20" : "bg-primary/10",
                      )}
                    >
                      <Icon
                        className={cn("h-4 w-4", isActive ? "text-primary" : "text-primary/80")}
                      />
                    </div>
                    <span className="text-[11px] font-semibold mt-1.5">{config.label}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    <span
                      className={cn(
                        "text-[10px] font-semibold flex items-center gap-1.5",
                        statusColor.text,
                      )}
                    >
                      <span className={cn("w-2 h-2 rounded-full", statusColor.dot)} />
                      {status.label}
                    </span>
                  </div>
                </MiniCard>
              );
            })}
          </div>
        </div>

        <div className="flex justify-center items-center gap-2">
          <div className="flex gap-1">
            {SECTIONS.map((section, idx) => (
              <button
                key={`dot-${section}`}
                onClick={() => setActiveSection(section)}
                className={cn(
                  "w-1.5 h-1.5 rounded-full transition-colors",
                  idx === activeIndex ? "bg-primary" : "bg-muted",
                )}
                aria-label={`Go to ${section}`}
                title={`Go to ${section}`}
              />
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-4 pt-4" style={{ scrollbarGutter: "stable" }}>
          <div className="min-h-[400px] max-w-4xl mx-auto px-2">{renderSectionContent()}</div>
        </div>
      </div>

      {agentPortalRef &&
        AgentSidebarComponent &&
        createPortal(
          <AgentSidebarComponent
            className="h-full"
            hideHeader
            mode="system"
            systemConfig={systemConfigForAgent}
          />,
          agentPortalRef,
        )}
    </div>
  );
}
