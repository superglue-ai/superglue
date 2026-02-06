"use client";

import { Button } from "@/src/components/ui/button";
import { useTheme } from "@/src/hooks/use-theme";
import {
  Blocks,
  Book,
  Calendar,
  ChevronDown,
  Clock,
  ExternalLink,
  Hammer,
  History,
  Menu,
  MessagesSquare,
  Monitor,
  Moon,
  Sun,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useJWTOrgInfos } from "../../hooks/use-jwt-org-infos";
import { useTheme } from "../../hooks/use-theme";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { OrgSwitcher } from "./OrgSwitcher";
import { useUpgradeModal } from "../upgrade/UpgradeModalContext";

const navItems = [
  { icon: MessagesSquare, label: "Agent", href: "/" },
  { icon: Hammer, label: "Tools", href: "/tools" },
  { icon: Blocks, label: "Systems", href: "/systems" },
  { icon: Book, label: "Docs", href: "https://docs.superglue.cloud", target: "_blank" },
  /*  { icon: AlertCircle, label: 'Error Monitoring', href: '/analytics' },
  { icon: Shield, label: 'Access Control', href: '/access-control' },
  { icon: Code, label: 'SDK Generation', href: '/sdk' },
*/
];

export function LeftSidebar() {
  const pathname = usePathname();
  const [theme, setTheme, resolvedTheme] = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isManagingSubscription, setIsManagingSubscription] = useState(false);

  const [isPro, setIsPro] = useState(false);
  const [adminExpanded, setAdminExpanded] = useState(false);
  const { openUpgradeModal } = useUpgradeModal();

  // Build nav items - filter API Keys sub-item based on tenant mode
  const isSingleTenant = !!process.env.NEXT_PUBLIC_SUPERGLUE_API_KEY;
  const filteredAdminSubItems =
    supabase && !isSingleTenant
      ? adminSubItems
      : adminSubItems.filter((item) => item.view !== "api-keys");

  // Auto-expand admin if we're on an admin page
  useEffect(() => {
    if (pathname?.startsWith("/admin")) {
      setAdminExpanded(true);
    }
  }, [pathname]);

  useEffect(() => {
    // Check cookie first for instant display (after hydration)
    const cookieValue = document.cookie
      .split("; ")
      .find((row) => row.startsWith("pro_status="))
      ?.split("=")[1];

    if (cookieValue === "true") {
      setIsPro(true);
    }

    // Then validate with API
    const checkProStatus = async () => {
      if (!supabase) return;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      try {
        const url = `https://billing.superglue.cloud/v1/billing/status/${user.id}`;
        const response = await fetch(url);
        const status = await response.json();

        const isProActive = status.status === "active";
        setIsPro(isProActive);

        // Store in cookie for 1 month
        document.cookie = `pro_status=${isProActive}; path=/; max-age=2592000; SameSite=Lax`;
      } catch (error) {
        console.error("Failed to check pro status:", error);
        // Keep using cached value on error
      }
    };

    checkProStatus();
  }, []);

  const handleManageSubscription = async () => {
    setIsManagingSubscription(true);

    if (!supabase) {
      console.error("Supabase not configured");
      setIsManagingSubscription(false);
      return;
    }

    try {
      // Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      // Call your billing API
      const response = await fetch("https://billing.superglue.cloud/v1/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          email: user.email,
          returnUrl: `${window.location.origin}/`,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to manage subscription");
      }

      // Redirect to subscription management page
      const { url } = await response.json();
      window.open(url, "_blank");
    } catch (error) {
      console.error("Failed to manage subscription:", error);
    } finally {
      setIsManagingSubscription(false);
    }
  };

  useEffect(() => setMounted(true), []);

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden fixed top-4 right-4 z-50 p-2 rounded-md bg-background border border-border"
      >
        <Menu className="h-6 w-6" />
      </button>

      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      <div
        className={`
        fixed lg:static inset-y-0 left-0 z-40
        w-44 flex-shrink-0 bg-background border-r border-border 
        flex flex-col transform transition-transform duration-200 ease-in-out
        lg:transform-none ${isOpen ? "translate-x-0" : "-translate-x-full"}
      `}
      >
        <div className="p-6">
          <div className="relative mx-auto flex flex-col items-center">
            <Link href="/">
              <img
                src="/logo.svg"
                alt="superglue Logo"
                className="max-w-full h-[50px] w-[200px] ml-auto mr-auto cursor-pointer"
              />
            </Link>
            {supabase && isPro && (
              <div className="mx-auto block mt-2">
                <Badge variant="glass-primary">Pro</Badge>
              </div>
            )}
            {supabase && !isPersonalOrg && (
              <div className="mx-auto block mt-2">
                <Badge variant="glass-primary">Enterprise</Badge>
              </div>
            )}
          </div>
        </div>
        <nav className="flex-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                target={item.target || "_self"}
                className={`flex items-center px-6 py-3 text-sm ${
                  isActive
                    ? "bg-gray-100 dark:bg-secondary text-gray-900 dark:text-white border-r-2 border-gray-900 dark:border-white"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-secondary"
                }`}
              >
                <Icon className="h-4 w-4 mr-3" />
                {item.label}
                {item.target === "_blank" && <ExternalLink className="h-3 w-3 ml-1.5 opacity-70" />}
              </Link>
            );
          })}
        </nav>
        <div className="py-3 px-2 border-t border-border">
          {/* Organization Switcher - only show in multi-tenant mode */}
          {supabase && !isSingleTenant && currentOrgId && currentOrgName && (
            <div className="mb-2">
              <OrgSwitcher currentOrgId={currentOrgId} currentOrgName={currentOrgName} />
            </div>
          )}

          {supabase && (
            <button
              onClick={handleLogout}
              className="w-full flex items-center px-4 py-2 mb-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-md transition-colors"
            >
              <LogOut className="h-4 w-4 mr-3" />
              Sign Out
            </button>
          )}
          {supabase && !isPro && isPersonalOrg && (
            <Button
              onClick={() => openUpgradeModal()}
              className="w-full mb-2"
              variant="glass-primary"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Upgrade Plan
            </Button>
          )}
          {supabase && isPro && isPersonalOrg && (
            <button
              onClick={handleManageSubscription}
              disabled={isManagingSubscription}
              className="px-4 py-2 mb-2 flex items-center text-sm w-full text-muted-foreground hover:bg-primary/10 rounded-md transition-colors disabled:opacity-50"
            >
              <Calendar className="h-4 w-4 mr-3 text-muted-foreground" />
              {isManagingSubscription ? "Loading..." : "Subscription"}
            </button>
          )}
        </div>
        <div className="pt-0 px-6 pb-6 mt-auto flex flex-col items-center w-full">
          {mounted && (
            <div className="flex gap-2">
              <Button
                variant={theme === "light" ? "default" : "outline"}
                size="icon"
                aria-label="Light mode"
                onClick={() => setTheme("light")}
              >
                <Sun className="h-5 w-5" />
              </Button>
              <Button
                variant={theme === "system" ? "default" : "outline"}
                size="icon"
                aria-label="System mode"
                onClick={() => setTheme("system")}
              >
                <Monitor className="h-5 w-5" />
              </Button>
              <Button
                variant={theme === "dark" ? "default" : "outline"}
                size="icon"
                aria-label="Dark mode"
                onClick={() => setTheme("dark")}
              >
                <Moon className="h-5 w-5" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
