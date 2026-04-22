"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { cn, formatLabel, getAllSimpleIcons } from "@/src/lib/general-utils";
import { buildOnboardingRouting, type OnboardingIntentId } from "@/src/lib/agent/agent-prompts";
import { hasResolvedOrgId, useOrgOptional } from "@/src/app/org-context";
import { useAgentModal } from "@/src/components/agent/AgentModalContext";
import { SystemIcon } from "@/src/components/ui/system-icon";
import { systems } from "@superglue/shared";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";

const ONBOARDING_STORAGE_KEY_PREFIX = "superglue-onboarding-seen";
const ONBOARDING_V1_SEEN_PREFIX = "superglue-onboarding-v1-seen";

type OnboardingSystemOption = {
  id: string;
  label: string;
  icon: string;
  keywords: string[];
  source: "template" | "icon";
};

const ROLE_OPTIONS = [
  {
    id: "integration-engineer",
    label: "Integration Engineer",
    subtitle: "Build and maintain integrations",
  },
  {
    id: "it-consultant",
    label: "IT Consultant",
    subtitle: "Deliver integration outcomes for clients",
  },
  { id: "data-engineer", label: "Data Engineer", subtitle: "Connect and move data reliably" },
  { id: "developer", label: "Developer", subtitle: "Implement API and system workflows" },
  { id: "other", label: "Other", subtitle: "Pick this if none of the above fit" },
] as const;

const INTENT_OPTIONS = [
  {
    id: "build-integrations-faster",
    label: "Build an integration",
    subtitle: "Start with one system and ship a working tool quickly",
  },
  {
    id: "explore-apis-and-systems",
    label: "Explore an API / system",
    subtitle: "Inspect docs, auth, and endpoint behavior end-to-end",
  },
  {
    id: "empower-agent-via-cli",
    label: "Empower my agent with the superglue CLI",
    subtitle: "Install, initialize, and run the right first commands",
  },
  {
    id: "check-out-the-tool",
    label: "Check out superglue",
    subtitle: "Run a concise live demo flow from system to tool execution",
  },
] as const;

const TEMPLATE_SYSTEM_OPTIONS: OnboardingSystemOption[] = Object.entries(systems)
  .map(([key, config]) => ({
    id: key,
    label: formatLabel(key),
    icon: config.icon || "default",
    keywords: config.keywords || [],
    source: "template" as const,
  }))
  .sort((a, b) => a.label.localeCompare(b.label));

const SIMPLE_ICON_SYSTEM_OPTIONS: OnboardingSystemOption[] = getAllSimpleIcons()
  .map((icon) => ({
    id: `icon:${icon.slug}`,
    label: icon.title,
    icon: icon.slug,
    keywords: [icon.slug],
    source: "icon" as const,
  }))
  .sort((a, b) => a.label.localeCompare(b.label));

const SYSTEM_OPTIONS: OnboardingSystemOption[] = [...TEMPLATE_SYSTEM_OPTIONS];
const existingNormalizedIds = new Set(
  TEMPLATE_SYSTEM_OPTIONS.map((option) => option.id.toLowerCase().replace(/[^a-z0-9]/g, "")),
);
for (const option of SIMPLE_ICON_SYSTEM_OPTIONS) {
  const normalizedId = option.id
    .replace(/^icon:/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (existingNormalizedIds.has(normalizedId)) continue;
  SYSTEM_OPTIONS.push(option);
}

interface OnboardingStep {
  id: string;
  content: React.ReactNode;
}

type RoleId = (typeof ROLE_OPTIONS)[number]["id"];
type IntentId = OnboardingIntentId;

interface OnboardingSelections {
  role: RoleId | null;
  roleOther: string;
  systems: string[];
  intent: IntentId | null;
  intentOther: string;
}

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {Array.from({ length: 3 }).map((_, i) => (
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

function SelectionCard({
  active,
  onClick,
  title,
  subtitle,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full rounded-2xl border p-3 text-left transition-all backdrop-blur-md",
        active
          ? "border-primary/60 bg-primary/10 shadow-sm"
          : "border-border/50 bg-background/40 hover:border-border/80",
      )}
    >
      <div className="flex items-center gap-3">
        {icon ? <div className="h-8 w-8 shrink-0 rounded-lg bg-muted/60 p-1.5">{icon}</div> : null}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{title}</p>
          {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
      </div>
    </button>
  );
}

function RoleStep({
  role,
  roleOther,
  onSelectRole,
  onChangeRoleOther,
}: {
  role: RoleId | null;
  roleOther: string;
  onSelectRole: (roleId: RoleId) => void;
  onChangeRoleOther: (value: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-primary/80">Step 1</p>
        <h3 className="mt-2 text-2xl font-medium text-foreground/95">What is your job title?</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Help us tailor superglue onboarding to your needs.
        </p>
      </div>
      <div className="space-y-2">
        {ROLE_OPTIONS.map((option) => (
          <SelectionCard
            key={option.id}
            active={role === option.id}
            onClick={() => onSelectRole(option.id)}
            title={option.label}
            subtitle={option.subtitle}
          />
        ))}
      </div>
      {role === "other" ? (
        <Input
          value={roleOther}
          onChange={(event) => onChangeRoleOther(event.target.value)}
          placeholder="Optional: tell us your role"
          className="h-10"
        />
      ) : null}
    </div>
  );
}

function SystemsStep({
  selectedSystems,
  onToggleSystem,
}: {
  selectedSystems: string[];
  onToggleSystem: (systemId: string) => void;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [newSystemFormExpanded, setNewSystemFormExpanded] = useState(false);
  const [customSystem, setCustomSystem] = useState("");
  const customSystemFormRef = useRef<HTMLDivElement | null>(null);
  const debouncedSearch = searchTerm.trim().toLowerCase();
  const selectedSet = new Set(selectedSystems);
  const filteredSystems =
    debouncedSearch.length === 0
      ? SYSTEM_OPTIONS.slice(0, 180)
      : SYSTEM_OPTIONS.filter((option) => {
          if (option.label.toLowerCase().includes(debouncedSearch)) return true;
          if (option.id.toLowerCase().includes(debouncedSearch)) return true;
          return option.keywords.some((kw) => kw.toLowerCase().includes(debouncedSearch));
        }).slice(0, 260);
  const selectedTemplateOrIconSystems = SYSTEM_OPTIONS.filter((option) =>
    selectedSet.has(option.id),
  );
  const selectedCustomSystems = selectedSystems
    .filter((id) => id.startsWith("custom:"))
    .map((id) => ({
      id,
      label: formatLabel(id.replace("custom:", "")),
      icon: "default",
      keywords: [],
      source: "icon" as const,
    }));
  const selectedOptions = [...selectedTemplateOrIconSystems, ...selectedCustomSystems];
  const availableSystems = filteredSystems.filter((option) => !selectedSet.has(option.id));

  const renderSystemCard = (
    systemOption: { id: string; label: string; icon: string },
    isActive: boolean,
  ) => (
    <button
      key={systemOption.id}
      onClick={() => {
        onToggleSystem(systemOption.id);
      }}
      className={cn(
        "w-full rounded-2xl border p-3 text-left transition-all backdrop-blur-sm",
        isActive
          ? "border-primary/30 bg-primary/10 shadow-[0_6px_20px_rgba(59,130,246,0.10)]"
          : "border-border/40 bg-background/45 hover:border-border/70",
      )}
    >
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 shrink-0 rounded-lg bg-muted/60 p-1.5">
          <SystemIcon
            system={{ icon: systemOption.icon, templateName: systemOption.id }}
            size={18}
          />
        </div>
        <p className="truncate text-sm font-medium">{systemOption.label}</p>
      </div>
    </button>
  );

  useEffect(() => {
    if (!newSystemFormExpanded) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!customSystemFormRef.current) return;
      if (customSystemFormRef.current.contains(target)) return;
      setNewSystemFormExpanded(false);
      setCustomSystem("");
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [newSystemFormExpanded]);

  return (
    <div className="space-y-5">
      <div className="text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-primary/80">Step 2</p>
        <h3 className="mt-2 text-2xl font-medium text-foreground/95">What do you work with?</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Select one or more systems you want superglue to work with.
        </p>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground/70" />
        <Input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search systems..."
          className="h-11 rounded-xl border-border/50 bg-background/50 pl-9"
        />
      </div>
      {selectedOptions.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Selected systems</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {selectedOptions.map((systemOption) => renderSystemCard(systemOption, true))}
          </div>
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-2 pr-1 sm:grid-cols-2 lg:grid-cols-3">
        {newSystemFormExpanded ? (
          <div
            ref={customSystemFormRef}
            className="rounded-2xl border border-border/40 bg-background/70 p-3 backdrop-blur-md"
          >
            <div className="flex gap-2">
              <Input
                value={customSystem}
                onChange={(event) => setCustomSystem(event.target.value)}
                placeholder="Name your system..."
                className="h-10 rounded-xl border-border/50 bg-background/80"
              />
              <Button
                type="button"
                className="rounded-xl"
                disabled={!customSystem.trim()}
                onClick={() => {
                  const normalized = customSystem.trim().toLowerCase().replace(/\s+/g, "-");
                  onToggleSystem(`custom:${normalized}`);
                  setCustomSystem("");
                  setNewSystemFormExpanded(false);
                }}
              >
                Add
              </Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setNewSystemFormExpanded(true)}
            className="rounded-2xl border border-border/40 bg-background/70 p-3 text-left transition-all backdrop-blur-md hover:border-border/60 hover:bg-background/80"
          >
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 shrink-0 rounded-lg border border-border/40 bg-muted/50 p-1.5 text-foreground/80">
                <Plus className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">Custom system</p>
                <p className="truncate text-xs text-muted-foreground">Add any other system</p>
              </div>
            </div>
          </button>
        )}
        {availableSystems.map((systemOption) => renderSystemCard(systemOption, false))}
      </div>
    </div>
  );
}

function IntentStep({
  intent,
  intentOther,
  onSelectIntent,
  onChangeIntentOther,
}: {
  intent: IntentId | null;
  intentOther: string;
  onSelectIntent: (intentId: IntentId) => void;
  onChangeIntentOther: (value: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-primary/80">Step 3</p>
        <h3 className="mt-2 text-2xl font-medium text-foreground/95">
          What do you want to do first?
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          We'll let the superglue agent know what you want to see.
        </p>
      </div>
      <div className="space-y-2">
        {INTENT_OPTIONS.map((option) => (
          <SelectionCard
            key={option.id}
            active={intent === option.id}
            onClick={() => onSelectIntent(option.id)}
            title={option.label}
          />
        ))}
      </div>
      {intent === "check-out-the-tool" ? (
        <Input
          value={intentOther}
          onChange={(event) => onChangeIntentOther(event.target.value)}
          placeholder="Optional: what would you like to see in a demo?"
          className="h-10"
        />
      ) : null}
    </div>
  );
}

export function OnboardingModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [selections, setSelections] = useState<OnboardingSelections>({
    role: null,
    roleOther: "",
    systems: [],
    intent: null,
    intentOther: "",
  });
  const orgContext = useOrgOptional();
  const { openAgentModal } = useAgentModal();

  const resolvedOrgId = orgContext?.orgId;
  const orgId = resolvedOrgId ?? "";
  const userId = orgContext?.userId || "";
  const userEmail = orgContext?.userEmail || "";
  const isEnterprise = orgContext?.isEnterprise ?? false;
  const userIdentity = userId || userEmail;
  const legacyStorageKey = hasResolvedOrgId(resolvedOrgId)
    ? `${ONBOARDING_STORAGE_KEY_PREFIX}-${orgId}`
    : ONBOARDING_STORAGE_KEY_PREFIX;
  const scopedStorageKey = userIdentity
    ? `${ONBOARDING_V1_SEEN_PREFIX}-${userIdentity}`
    : ONBOARDING_V1_SEEN_PREFIX;
  const canEvaluateVisibility = hasResolvedOrgId(resolvedOrgId) && Boolean(userIdentity);

  useEffect(() => {
    if (!canEvaluateVisibility) return;
    if (isEnterprise) return;
    const hasSeenNew = localStorage.getItem(scopedStorageKey) === "true";
    const hasSeenLegacy = localStorage.getItem(legacyStorageKey) === "true";
    if (hasSeenNew || hasSeenLegacy) return;
    const timer = setTimeout(() => setIsOpen(true), 200);
    return () => clearTimeout(timer);
  }, [canEvaluateVisibility, isEnterprise, scopedStorageKey, legacyStorageKey]);

  const markSeen = useCallback(() => {
    localStorage.setItem(scopedStorageKey, "true");
    localStorage.setItem(legacyStorageKey, "true");
  }, [scopedStorageKey, legacyStorageKey]);

  const handleComplete = useCallback(() => {
    const selectedSystemLabels = selections.systems.map((systemId) =>
      systemId.startsWith("custom:") ? formatLabel(systemId.replace("custom:", "")) : systemId,
    );
    const routing = buildOnboardingRouting({
      role: selections.role,
      roleOther: selections.roleOther,
      selectedSystemLabels,
      intent: selections.intent,
      intentOther: selections.intentOther,
    });
    markSeen();
    setIsOpen(false);
    openAgentModal({
      userPrompt: routing.userPrompt,
      hiddenStarterMessage: routing.hiddenStarterMessage,
      hideUserMessage: true,
    });
  }, [selections, markSeen, openAgentModal]);

  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === 2;

  const isCurrentStepValid =
    (currentStep === 0 && Boolean(selections.role)) ||
    currentStep === 1 ||
    (currentStep === 2 && Boolean(selections.intent));

  const steps: OnboardingStep[] = [
    {
      id: "role",
      content: (
        <RoleStep
          role={selections.role}
          roleOther={selections.roleOther}
          onSelectRole={(roleId) =>
            setSelections((prev) => ({
              ...prev,
              role: roleId,
            }))
          }
          onChangeRoleOther={(value) =>
            setSelections((prev) => ({
              ...prev,
              roleOther: value,
            }))
          }
        />
      ),
    },
    {
      id: "systems",
      content: (
        <SystemsStep
          selectedSystems={selections.systems}
          onToggleSystem={(systemId) =>
            setSelections((prev) => {
              if (prev.systems.includes(systemId)) {
                return {
                  ...prev,
                  systems: prev.systems.filter((id) => id !== systemId),
                };
              }
              return {
                ...prev,
                systems: [...prev.systems, systemId],
              };
            })
          }
        />
      ),
    },
    {
      id: "intent",
      content: (
        <IntentStep
          intent={selections.intent}
          intentOther={selections.intentOther}
          onSelectIntent={(intentId) =>
            setSelections((prev) => ({
              ...prev,
              intent: intentId,
            }))
          }
          onChangeIntentOther={(value) =>
            setSelections((prev) => ({
              ...prev,
              intentOther: value,
            }))
          }
        />
      ),
    },
  ];

  return (
    <Dialog open={isOpen}>
      <DialogContent
        className="left-0 top-0 z-[70] h-screen w-screen max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden border-none bg-transparent p-0 shadow-none sm:rounded-none"
        overlayClassName="bg-white/5 backdrop-blur-[18px]"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Welcome to superglue</DialogTitle>
          <DialogDescription>Three quick steps to personalize your setup</DialogDescription>
        </DialogHeader>
        <div className="relative flex h-full w-full items-center justify-center overflow-hidden p-5 sm:p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(255,255,255,0.20),transparent_44%),radial-gradient(circle_at_84%_24%,rgba(107,114,128,0.18),transparent_42%),radial-gradient(circle_at_50%_86%,rgba(17,24,39,0.14),transparent_50%)] dark:bg-[radial-gradient(circle_at_16%_18%,rgba(255,255,255,0.12),transparent_44%),radial-gradient(circle_at_84%_24%,rgba(148,163,184,0.14),transparent_42%),radial-gradient(circle_at_50%_86%,rgba(0,0,0,0.24),transparent_50%)]" />
          <div className="absolute inset-0 bg-background/24 backdrop-blur-[3px]" />
          <div className="relative flex h-full max-h-[92vh] w-full max-w-6xl flex-col rounded-[28px] border border-white/30 bg-background/60 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/30 bg-background/60">
                  <img
                    src="/favicon.png"
                    alt="superglue"
                    className="h-5 w-5 object-contain dark:invert"
                  />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground/90">Welcome to superglue</p>
                  <p className="text-xs text-muted-foreground">Personalize your experience</p>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pr-1">{steps[currentStep].content}</div>

            <div className="mt-5 space-y-4">
              <StepIndicator currentStep={currentStep} />
              <div className="flex items-center justify-between gap-3">
                <Button
                  variant="glass"
                  size="default"
                  onClick={() => setCurrentStep((s) => s - 1)}
                  disabled={isFirstStep}
                  className={cn("h-11 rounded-xl px-5 text-sm", isFirstStep && "invisible")}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Back
                </Button>

                {isLastStep ? (
                  <Button
                    variant="glass"
                    size="default"
                    onClick={handleComplete}
                    className="h-11 rounded-xl px-5 text-sm"
                    disabled={!isCurrentStepValid}
                  >
                    Get started
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="glass"
                      size="default"
                      onClick={() => setCurrentStep((s) => s + 1)}
                      className="h-11 rounded-xl px-5 text-sm"
                      disabled={!isCurrentStepValid}
                    >
                      Next
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
