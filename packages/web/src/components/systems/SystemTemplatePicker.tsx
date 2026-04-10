"use client";

import { systems, SystemConfig } from "@superglue/shared";
import {
  cn,
  getSimpleIcon,
  searchSimpleIcons,
  SimpleIconEntry,
  formatLabel,
} from "@/src/lib/general-utils";
import { SystemIcon } from "@/src/components/ui/system-icon";
import { Input } from "@/src/components/ui/input";
import { Button } from "@/src/components/ui/button";
import { Search, Blocks, Plus, CloudOff } from "lucide-react";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useAgentModal } from "@/src/components/agent/AgentModalContext";
import { Dialog, DialogContent, DialogTitle } from "@/src/components/ui/dialog";
import { OnPremWizard } from "./onprem";

interface TemplateOption {
  key: string;
  label: string;
  icon: string;
  config: SystemConfig | null;
  hue?: number;
}

const HUES = [0, 15, 30, 45, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

function hashStringToHue(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return HUES[Math.abs(hash) % HUES.length];
}

function buildTemplateOptions(): TemplateOption[] {
  return Object.entries(systems).map(([key, config]) => ({
    key,
    label: formatLabel(key),
    icon: config.icon || "default",
    config,
    hue: hashStringToHue(key),
  }));
}

function tryResolveIconFromName(name: string): string | null {
  if (!name || name.length < 2) return null;
  const cleaned = name.replace(/[^a-zA-Z0-9]/g, "");
  if (cleaned.length < 2) return null;
  const icon = getSimpleIcon(cleaned);
  if (icon) return cleaned.toLowerCase();
  const words = name.split(/\s+/);
  for (const word of words) {
    const cleanWord = word.replace(/[^a-zA-Z0-9]/g, "");
    if (cleanWord.length >= 2) {
      const wordIcon = getSimpleIcon(cleanWord);
      if (wordIcon) return cleanWord.toLowerCase();
    }
  }
  return null;
}

interface TemplateCardProps {
  option: TemplateOption;
  onClick: () => void;
}

function TemplateCard({ option, onClick }: TemplateCardProps) {
  const hue = option.hue ?? 200;

  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative w-full text-left p-4 rounded-2xl transition-all duration-300",
        "bg-gradient-to-br from-muted/50 to-muted/30 dark:from-muted/30 dark:to-muted/20",
        "backdrop-blur-sm border border-border/50",
        "shadow-sm",
        "hover:shadow-md hover:border-border/80",
        "hover:scale-[1.02] active:scale-[0.98]",
        "overflow-hidden",
        "min-h-[100px]",
      )}
      style={{
        ["--card-hue" as string]: hue,
      }}
    >
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl"
        style={{
          background: `linear-gradient(135deg, hsla(${hue}, 70%, 50%, 0.08) 0%, transparent 60%)`,
        }}
      />
      <div className="relative flex items-center gap-4">
        <div
          className={cn(
            "relative w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
            "transition-transform duration-300 group-hover:scale-105",
          )}
          style={{
            backgroundColor: `hsla(${hue}, 60%, 50%, 0.1)`,
          }}
        >
          <SystemIcon
            system={{ icon: option.icon, templateName: option.key }}
            size={24}
            className="transition-transform"
            fallbackClassName="text-muted-foreground"
          />
        </div>
        <div className="space-y-0.5 min-w-0 flex-1">
          <h3 className="font-medium text-sm text-foreground/80 group-hover:text-foreground transition-colors truncate">
            {option.label}
          </h3>
          {option.config?.apiUrl && (
            <p className="text-[10px] text-muted-foreground/60 truncate">
              {option.config.apiUrl.replace(/^https?:\/\//, "").split("/")[0]}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

interface NewSystemFormProps {
  onSubmit: (name: string) => void;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  initialName?: string;
}

function NewSystemCard({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative w-full text-left p-4 rounded-2xl transition-all duration-300",
        "bg-gradient-to-br from-primary/5 to-primary/10 dark:from-primary/10 dark:to-primary/5",
        "backdrop-blur-sm border-2 border-dashed border-primary/30",
        "shadow-sm",
        "hover:shadow-md hover:border-primary/50",
        "hover:scale-[1.02] active:scale-[0.98]",
        "overflow-hidden",
        "min-h-[100px]",
        className,
      )}
    >
      <div
        className={cn(
          "absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300",
          "bg-gradient-to-br from-primary/10 via-transparent to-transparent",
        )}
      />
      <div className="relative flex items-center gap-4">
        <div
          className={cn(
            "relative w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
            "bg-primary/10 dark:bg-primary/20",
            "transition-transform duration-300 group-hover:scale-105",
          )}
        >
          <Plus className="w-5 h-5 text-primary" />
        </div>
        <div className="space-y-0.5 min-w-0">
          <h3 className="font-medium text-sm text-foreground/90 group-hover:text-foreground transition-colors">
            New System
          </h3>
          <p className="text-[10px] text-muted-foreground/70 group-hover:text-muted-foreground/80 transition-colors">
            Connect any API or data source
          </p>
        </div>
      </div>
    </button>
  );
}

function OnPremSystemCard({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative w-full text-left p-4 rounded-2xl transition-all duration-300",
        "bg-gradient-to-br from-muted/30 to-muted/20 dark:from-muted/20 dark:to-muted/10",
        "backdrop-blur-sm border-2 border-dashed border-border/40",
        "shadow-sm",
        "hover:shadow-md hover:border-border/60",
        "hover:scale-[1.02] active:scale-[0.98]",
        "overflow-hidden",
        "min-h-[100px]",
        className,
      )}
    >
      <div
        className={cn(
          "absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300",
          "bg-gradient-to-br from-muted/20 via-transparent to-transparent",
        )}
      />
      <div className="relative flex items-center gap-4">
        <div
          className={cn(
            "relative w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
            "bg-muted/50 dark:bg-muted/30",
            "transition-transform duration-300 group-hover:scale-105",
          )}
        >
          <CloudOff className="w-5 h-5 text-muted-foreground" />
        </div>
        <div className="space-y-0.5 min-w-0">
          <h3 className="font-medium text-sm text-foreground/90 group-hover:text-foreground transition-colors">
            Private System
          </h3>
          <p className="text-[10px] text-muted-foreground/70 group-hover:text-muted-foreground/80 transition-colors">
            Connect via secure gateway
          </p>
        </div>
      </div>
    </button>
  );
}

interface IconSuggestionCardProps {
  icon: SimpleIconEntry;
  onClick: () => void;
}

function IconSuggestionCard({ icon, onClick }: IconSuggestionCardProps) {
  const hue = hashStringToHue(icon.slug);

  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative w-full text-left p-4 rounded-2xl transition-all duration-300",
        "bg-gradient-to-br from-muted/30 to-muted/20 dark:from-muted/20 dark:to-muted/10",
        "backdrop-blur-sm border border-dashed border-border/40",
        "shadow-sm",
        "hover:shadow-md hover:border-border/60",
        "hover:scale-[1.02] active:scale-[0.98]",
        "overflow-hidden",
        "min-h-[100px]",
      )}
    >
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl"
        style={{
          background: `linear-gradient(135deg, hsla(${hue}, 70%, 50%, 0.06) 0%, transparent 60%)`,
        }}
      />
      <div className="relative flex items-center gap-4">
        <div
          className={cn(
            "relative w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
            "transition-transform duration-300 group-hover:scale-105",
          )}
          style={{
            backgroundColor: `hsla(${hue}, 60%, 50%, 0.08)`,
          }}
        >
          <SystemIcon
            system={{ icon: icon.slug }}
            size={24}
            className="transition-transform"
            fallbackClassName="text-muted-foreground"
          />
        </div>
        <div className="space-y-0.5 min-w-0 flex-1">
          <h3 className="font-medium text-sm text-foreground/70 group-hover:text-foreground/90 transition-colors truncate">
            {icon.title}
          </h3>
          <p className="text-[10px] text-muted-foreground/50">Custom system</p>
        </div>
      </div>
    </button>
  );
}

function NewSystemForm({
  onSubmit,
  expanded,
  onExpandedChange,
  initialName = "",
}: NewSystemFormProps) {
  const [name, setName] = useState(initialName);
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    if (expanded && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
      if (initialName) {
        setName(initialName);
      }
    }
    if (!expanded) {
      hasInitializedRef.current = false;
    }
  }, [expanded, initialName]);

  const resolvedIcon = useMemo(() => tryResolveIconFromName(name), [name]);

  const handleSubmit = () => {
    if (name.trim()) {
      onSubmit(name.trim());
      setName("");
      onExpandedChange(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && name.trim()) {
      handleSubmit();
    }
    if (e.key === "Escape") {
      onExpandedChange(false);
    }
  };

  if (!expanded) {
    return null;
  }

  return (
    <div
      className={cn(
        "p-4 rounded-2xl col-span-full md:col-span-2",
        "bg-gradient-to-br from-primary/5 to-primary/10 dark:from-primary/10 dark:to-primary/5",
        "backdrop-blur-sm border-2 border-primary/40",
        "shadow-md",
        "w-full",
        "animate-in fade-in-0 zoom-in-95 duration-200",
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
            "bg-primary/10 dark:bg-primary/20",
            "transition-all duration-300",
          )}
        >
          {resolvedIcon ? (
            <SystemIcon
              system={{ icon: resolvedIcon }}
              size={20}
              fallbackClassName="text-primary"
              className="animate-in fade-in-0 zoom-in-50 duration-200"
            />
          ) : (
            <Blocks className="w-5 h-5 text-primary" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <Input
            placeholder="Enter system name..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            className="h-10 text-sm bg-background/50 border-border/50 focus-visible:ring-primary/30"
          />
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onExpandedChange(false)}
            className="h-10 px-3 text-xs"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!name.trim()}
            className="h-10 px-4 text-xs"
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}

interface SystemTemplatePickerProps {
  onClose?: () => void;
  showHeader?: boolean;
  className?: string;
}

export function SystemTemplatePicker({
  onClose,
  showHeader = true,
  className,
}: SystemTemplatePickerProps) {
  const { openAgentModal } = useAgentModal();
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [newSystemFormExpanded, setNewSystemFormExpanded] = useState(false);
  const [onPremWizardOpen, setOnPremWizardOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 150);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const allOptions = useMemo(() => buildTemplateOptions(), []);

  const filteredOptions = useMemo(() => {
    if (!debouncedSearch.trim()) return allOptions;

    const search = debouncedSearch.toLowerCase();
    return allOptions.filter((option) => {
      if (option.label.toLowerCase().includes(search)) return true;
      if (option.key.toLowerCase().includes(search)) return true;
      const keywords = option.config?.keywords || [];
      return keywords.some((kw) => kw.toLowerCase().includes(search));
    });
  }, [allOptions, debouncedSearch]);

  const iconSuggestions = useMemo(() => {
    if (!debouncedSearch.trim() || debouncedSearch.length < 2) return [];

    const templateKeys = new Set(allOptions.map((o) => o.key.toLowerCase()));
    const templateIcons = new Set(allOptions.map((o) => o.icon?.toLowerCase()).filter(Boolean));

    const suggestions = searchSimpleIcons(debouncedSearch, 12);
    return suggestions.filter(
      (icon) => !templateKeys.has(icon.slug) && !templateIcons.has(icon.slug),
    );
  }, [debouncedSearch, allOptions]);

  const buildStarterMessage = useCallback((config: SystemConfig) => {
    const lines = ["The user selected a system template."];
    if (config.apiUrl) lines.push(`Suggested API URL: ${config.apiUrl}`);
    if (config.docsUrl) lines.push(`Documentation URL: ${config.docsUrl}`);
    if (config.openApiUrl) lines.push(`OpenAPI URL: ${config.openApiUrl}`);
    if (config.preferredAuthType) {
      lines.push(`Suggested auth type: ${config.preferredAuthType}`);
    }
    lines.push(`OAuth available: ${config.oauth ? "yes" : "no"}`);
    if (config.systemSpecificInstructions) {
      lines.push(`Template-specific instructions: ${config.systemSpecificInstructions}`);
    }
    return lines.join("\n");
  }, []);

  const handleTemplateSelect = useCallback(
    (option: TemplateOption) => {
      const prompt = `I want to set up ${option.label}`;
      const hiddenStarterMessage = option.config ? buildStarterMessage(option.config) : "";

      openAgentModal({
        userPrompt: prompt,
        hiddenStarterMessage,
        chatTitle: option.label,
        chatIcon: option.icon,
      });
    },
    [openAgentModal, buildStarterMessage],
  );

  const handleNewSystemSubmit = useCallback(
    (name: string) => {
      const prompt = `I want to set up a system called "${name}"`;
      const resolvedIcon = tryResolveIconFromName(name);

      const hiddenStarterMessage = `The user wants to set up a custom system.
Name: ${name}
Suggested auth type: apikey`;

      openAgentModal({
        userPrompt: prompt,
        hiddenStarterMessage,
        chatTitle: name,
        chatIcon: resolvedIcon || undefined,
      });
    },
    [openAgentModal],
  );

  const handleIconSuggestionSelect = useCallback(
    (icon: SimpleIconEntry) => {
      const prompt = `I want to set up ${icon.title}`;

      const hiddenStarterMessage = `The user wants to set up a custom system.
Name: ${icon.title}
Suggested icon: ${icon.slug}
Suggested auth type: apikey`;

      openAgentModal({
        userPrompt: prompt,
        hiddenStarterMessage,
        chatTitle: icon.title,
        chatIcon: icon.slug,
      });
    },
    [openAgentModal],
  );

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {showHeader && (
        <div className="flex flex-col gap-6 mb-6 flex-shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-2xl font-bold">Add a System</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Choose from popular systems or create a new one
              </p>
            </div>
          </div>

          <div className="relative max-w-lg">
            <div
              className={cn(
                "relative flex items-center",
                "bg-gradient-to-r from-muted/60 to-muted/40 dark:from-muted/40 dark:to-muted/20",
                "rounded-xl border border-border/50",
                "shadow-sm",
                "focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/50",
                "transition-all duration-200",
              )}
            >
              <Search className="absolute left-4 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search integrations..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={cn(
                  "pl-11 pr-4 h-11 text-sm",
                  "bg-transparent border-0",
                  "focus-visible:ring-0 focus-visible:ring-offset-0",
                  "placeholder:text-muted-foreground/60",
                )}
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-3 p-1 rounded-md hover:bg-muted/50 transition-colors"
                >
                  <span className="text-xs text-muted-foreground">Clear</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto overflow-x-visible">
        {debouncedSearch.trim() && filteredOptions.length > 0 && (
          <h3 className="text-xs font-medium text-muted-foreground mb-3 px-1">Popular Systems</h3>
        )}
        <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(200px,1fr))] pb-4 px-1 mt-1">
          {newSystemFormExpanded ? (
            <NewSystemForm
              onSubmit={handleNewSystemSubmit}
              expanded={newSystemFormExpanded}
              onExpandedChange={setNewSystemFormExpanded}
              initialName={searchTerm.trim()}
            />
          ) : (
            <NewSystemCard onClick={() => setNewSystemFormExpanded(true)} />
          )}

          <OnPremSystemCard onClick={() => setOnPremWizardOpen(true)} />

          {filteredOptions.map((option) => (
            <TemplateCard
              key={option.key}
              option={option}
              onClick={() => handleTemplateSelect(option)}
            />
          ))}
        </div>

        {iconSuggestions.length > 0 && (
          <div className="mt-6 pb-4 px-1">
            <h3 className="text-xs font-medium text-muted-foreground mb-3">
              Other systems matching "{debouncedSearch}"
            </h3>
            <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
              {iconSuggestions.map((icon) => (
                <IconSuggestionCard
                  key={icon.slug}
                  icon={icon}
                  onClick={() => handleIconSuggestionSelect(icon)}
                />
              ))}
            </div>
          </div>
        )}

        {filteredOptions.length === 0 && iconSuggestions.length === 0 && debouncedSearch.trim() && (
          <div className="flex flex-col items-center justify-center py-8 text-center px-1">
            <p className="text-sm text-muted-foreground/60">
              No systems match "{debouncedSearch}" — use the New System card above to set it up
            </p>
          </div>
        )}
      </div>

      {/* Private System Wizard Dialog */}
      <Dialog open={onPremWizardOpen} onOpenChange={setOnPremWizardOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col overflow-y-auto">
          <DialogTitle className="sr-only">Connect to Private System</DialogTitle>
          <OnPremWizard onClose={() => setOnPremWizardOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
