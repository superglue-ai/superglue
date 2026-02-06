"use client";

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

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgrade: () => Promise<void>;
  isUpgrading: boolean;
}

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

export function UpgradeModal({ isOpen, onClose, onUpgrade, isUpgrading }: UpgradeModalProps) {
  if (!isOpen) return null;

  const handleBookDemo = () => {
    window.open("https://cal.com/superglue/superglue-demo", "_blank");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-gradient-to-br from-card to-card/90 dark:from-card/95 dark:to-card/85 backdrop-blur-xl border border-border/50 dark:border-border/70 rounded-xl shadow-lg w-full max-w-lg mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-5 border-b border-border">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Upgrade to Pro</h2>
              <p className="text-sm text-muted-foreground">
                Unlock enterprise features for your team
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
            <Button
              onClick={onUpgrade}
              disabled={isUpgrading}
              variant="glass-primary"
              className="flex-1"
            >
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
            <Button variant="glass" onClick={handleBookDemo} className="flex-1 sm:flex-none">
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
