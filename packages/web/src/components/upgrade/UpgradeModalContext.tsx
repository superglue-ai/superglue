"use client";

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useSupabaseClient } from "@/src/app/config-context";
import { useToolsOptional } from "@/src/app/tools-context";
import { useJWTOrgInfos } from "@/src/hooks/use-jwt-org-infos";
import { Button } from "@/src/components/ui/button";
import {
  BarChart3,
  Calendar,
  CalendarCheck,
  Check,
  Loader2,
  Shield,
  Sparkles,
  Users,
  Webhook,
  X,
  Zap,
} from "lucide-react";

const SEEDED_TOOL_IDS = ["stock-email-alert"];
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const features = [
  {
    icon: Calendar,
    title: "Scheduled Runs",
    description: "Automate workflows with cron-based scheduling",
  },
  {
    icon: Webhook,
    title: "Webhooks",
    description: "Trigger tools via HTTP webhooks from any system",
  },
  {
    icon: BarChart3,
    title: "Advanced Analytics",
    description: "Detailed metrics, run history, and performance insights",
  },
  {
    icon: Shield,
    title: "SSO & SAML",
    description: "Enterprise authentication with your identity provider",
  },
  {
    icon: Users,
    title: "Team Collaboration",
    description: "Invite team members with role-based access control",
  },
  {
    icon: Zap,
    title: "Priority Support",
    description: "Direct Slack channel and dedicated support",
  },
];

type UpgradeModalReason = "default" | "trial_expired";

interface UpgradeModalContextValue {
  openUpgradeModal: (reason?: UpgradeModalReason) => void;
  closeUpgradeModal: () => void;
  isUpgradeModalOpen: boolean;
  modalReason: UpgradeModalReason;
}

const UpgradeModalContext = createContext<UpgradeModalContextValue | null>(null);

export function useUpgradeModal() {
  const context = useContext(UpgradeModalContext);
  if (!context) {
    throw new Error("useUpgradeModal must be used within UpgradeModalProvider");
  }
  return context;
}

interface UpgradeModalProviderProps {
  children: ReactNode;
}

export function UpgradeModalProvider({ children }: UpgradeModalProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState<UpgradeModalReason>("default");

  const openUpgradeModal = useCallback((r: UpgradeModalReason = "default") => {
    setReason(r);
    setIsOpen(true);
  }, []);

  const closeUpgradeModal = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <UpgradeModalContext.Provider
      value={{
        openUpgradeModal,
        closeUpgradeModal,
        isUpgradeModalOpen: isOpen,
        modalReason: reason,
      }}
    >
      {children}
    </UpgradeModalContext.Provider>
  );
}

export function UpgradeModalContent() {
  const { isUpgradeModalOpen, closeUpgradeModal, openUpgradeModal, modalReason } =
    useUpgradeModal();
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [hasCheckedAutoShow, setHasCheckedAutoShow] = useState(false);
  const supabase = useSupabaseClient();
  const router = useRouter();
  const toolsContext = useToolsOptional();
  const tools = toolsContext?.tools ?? [];
  const isToolsLoading = toolsContext?.isInitiallyLoading ?? true;
  const { currentOrgId } = useJWTOrgInfos();

  // Auto-show upgrade modal based on conditions
  useEffect(() => {
    if (hasCheckedAutoShow || !supabase || !currentOrgId || isToolsLoading || !toolsContext) {
      return;
    }

    const checkAndShowUpgradePrompt = async () => {
      setHasCheckedAutoShow(true);

      // Check if pro (from cookie)
      const proStatus = document.cookie
        .split("; ")
        .find((row) => row.startsWith("pro_status="))
        ?.split("=")[1];
      if (proStatus === "true") return;

      // Check if has at least one non-seeded tool
      const nonSeededTools = tools.filter((t) => !SEEDED_TOOL_IDS.includes(t.id));
      if (nonSeededTools.length === 0) return;

      // Fetch org to check account age and confirm it's personal
      try {
        const { data: org } = await supabase
          .from("sg_organizations")
          .select("created_at, display_name")
          .eq("id", currentOrgId)
          .single();

        if (!org) return;

        // Check it's a personal org
        if (org.display_name !== "Personal") return;

        const accountAge = Date.now() - new Date(org.created_at).getTime();
        if (accountAge < THIRTY_DAYS_MS) return;

        // All conditions met - show the modal
        openUpgradeModal("trial_expired");
      } catch (error) {
        console.error("[UpgradeModal] Failed to check conditions:", error);
      }
    };

    checkAndShowUpgradePrompt();
  }, [
    supabase,
    currentOrgId,
    tools,
    isToolsLoading,
    toolsContext,
    hasCheckedAutoShow,
    openUpgradeModal,
  ]);

  const handleClose = () => {
    closeUpgradeModal();
  };

  const handleUpgrade = async () => {
    setIsUpgrading(true);

    if (!supabase) {
      console.error("Supabase not configured");
      setIsUpgrading(false);
      window.open("https://cal.com/superglue/superglue-demo", "_blank");
      return;
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const response = await fetch("https://billing.superglue.cloud/v1/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          email: user.email,
          priceId: process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID,
          successUrl: `${window.location.origin}/welcome`,
          cancelUrl: `${window.location.origin}/`,
        }),
      });

      if (!response.ok) {
        console.warn("Billing API unavailable, redirecting to demo booking");
        window.location.href = "https://cal.com/superglue/superglue-demo";
        return;
      }

      const { url } = await response.json();
      window.location.href = url;
    } catch (error) {
      console.error("Upgrade failed:", error);
      window.open("https://cal.com/superglue/superglue-demo", "_blank");
    } finally {
      setIsUpgrading(false);
    }
  };

  const handleBookDemo = () => {
    window.open("https://cal.com/superglue/superglue-demo", "_blank");
    handleClose();
  };

  if (!isUpgradeModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-card border border-border rounded-lg shadow-lg w-full max-w-lg mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-5 border-b border-border">
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                {modalReason === "trial_expired"
                  ? "Upgrade to continue using superglue"
                  : "Upgrade to Pro"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {modalReason === "trial_expired"
                  ? "You've been using superglue for over 30 days. Upgrade to unlock all features and continue building."
                  : "Unlock enterprise features for your team"}
              </p>
            </div>
          </div>
        </div>

        {/* Features list */}
        <div className="px-6 py-5 max-h-[50vh] overflow-y-auto">
          <div className="grid gap-4">
            {features.map((feature) => (
              <div key={feature.title} className="flex items-start gap-3">
                <div className="flex-shrink-0 w-9 h-9 rounded-md bg-muted flex items-center justify-center">
                  <feature.icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="font-medium text-sm text-foreground">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer with CTA */}
        <div className="px-6 py-4 bg-muted/30 border-t border-border">
          <div className="flex flex-col sm:flex-row gap-3">
            <Button onClick={handleUpgrade} disabled={isUpgrading} className="flex-1">
              {isUpgrading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Upgrade Now
                </>
              )}
            </Button>
            <Button variant="outline" onClick={handleBookDemo} className="flex-1 sm:flex-none">
              <CalendarCheck className="h-4 w-4 mr-2" />
              Book a Demo
            </Button>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-3">
            Learn more in our{" "}
            <a
              href="https://docs.superglue.cloud"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              documentation
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
