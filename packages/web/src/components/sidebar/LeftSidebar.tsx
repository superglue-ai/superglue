"use client";

import { useConfig, useSupabaseClient } from "@/src/app/config-context";
import { cn } from "@/src/lib/general-utils";
import {
  Blocks,
  Book,
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
  const [isOpen, setIsOpen] = useState(false);

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
        w-48 flex-shrink-0 bg-background border-r border-border 
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
          </div>
        </div>
        <nav className="flex-1 px-2 pt-2">
          {baseNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                target={item.target || "_self"}
                className={cn(
                  "flex items-center px-3 py-2.5 mb-1 text-sm rounded-xl transition-all duration-200",
                  isActive
                    ? "bg-gradient-to-br from-muted/70 to-muted/50 dark:from-muted/70 dark:to-muted/50 backdrop-blur-sm border border-border/50 dark:border-border/70 shadow-sm text-foreground font-medium"
                    : "text-muted-foreground hover:bg-gradient-to-br hover:from-muted/40 hover:to-muted/20 dark:hover:from-muted/40 dark:hover:to-muted/20 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4 mr-3" />
                {item.label}
                {item.target === "_blank" && <ExternalLink className="h-3 w-3 ml-1.5 opacity-70" />}
              </Link>
            );
          })}

          {/* Control Panel Section with Dropdown */}
          <div className="mb-1">
            <button
              onClick={() => setAdminExpanded(!adminExpanded)}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2.5 text-sm rounded-xl transition-all duration-200",
                pathname?.startsWith("/admin")
                  ? "bg-gradient-to-br from-muted/70 to-muted/50 dark:from-muted/70 dark:to-muted/50 backdrop-blur-sm border border-border/50 dark:border-border/70 shadow-sm text-foreground font-medium"
                  : "text-muted-foreground hover:bg-gradient-to-br hover:from-muted/40 hover:to-muted/20 dark:hover:from-muted/40 dark:hover:to-muted/20 hover:text-foreground",
              )}
            >
              <div className="flex items-center">
                <MonitorCog className="h-4 w-4 mr-3" />
                Control Panel
              </div>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${adminExpanded ? "rotate-180" : ""}`}
              />
            </button>

            {adminExpanded && (
              <div className="mt-1 ml-2 space-y-0.5">
                {filteredAdminSubItems.map((subItem) => {
                  const SubIcon = subItem.icon;
                  const subHref = subItem.view ? `/admin?view=${subItem.view}` : "/admin";
                  const currentView = searchParams.get("view");
                  const isSubActive =
                    pathname === "/admin" &&
                    (subItem.view === null ? currentView === null : currentView === subItem.view);

                  return (
                    <Link
                      key={subItem.view || "overview"}
                      href={subHref}
                      className={cn(
                        "flex items-center pl-6 pr-3 py-2 text-sm rounded-lg transition-all duration-200",
                        isSubActive
                          ? "bg-muted/50 text-foreground font-medium"
                          : "text-muted-foreground hover:bg-muted/30 hover:text-foreground",
                      )}
                    >
                      <SubIcon className="h-3.5 w-3.5 mr-2.5" />
                      {subItem.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Docs Link */}
          <Link
            href={docsNavItem.href}
            target={docsNavItem.target}
            className="flex items-center px-3 py-2.5 mb-1 text-sm rounded-xl text-muted-foreground hover:bg-gradient-to-br hover:from-muted/40 hover:to-muted/20 dark:hover:from-muted/40 dark:hover:to-muted/20 hover:text-foreground transition-all duration-200"
          >
            <docsNavItem.icon className="h-4 w-4 mr-3" />
            {docsNavItem.label}
            <ExternalLink className="h-3 w-3 ml-1.5 opacity-70" />
          </Link>
        </nav>
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
