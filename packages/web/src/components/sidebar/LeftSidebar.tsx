"use client";

import { useConfig, useSupabaseClient } from "@/src/app/config-context";
import { cn } from "@/src/lib/general-utils";
import {
  Blocks,
  Book,
  ExternalLink,
  Hammer,
  Home,
  Key,
  LogOut,
  Menu,
  MessagesSquare,
  Moon,
  Sun,
  User,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "../../hooks/use-theme";
import { Button } from "../ui/button";

const baseNavItems: {
  icon: typeof MessagesSquare;
  label: string;
  href: string;
  target?: string;
}[] = [
  { icon: MessagesSquare, label: "Agent", href: "/" },
  { icon: Hammer, label: "Tools", href: "/tools" },
  { icon: Blocks, label: "Systems", href: "/systems" },
];

const docsNavItem = {
  icon: Book,
  label: "Docs",
  href: "https://docs.superglue.cloud",
  target: "_blank",
};

export function LeftSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useSupabaseClient();
  const [isOpen, setIsOpen] = useState(false);
  const [theme, setTheme, resolvedTheme] = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const handleLogout = async () => {
    if (supabase) {
      await supabase.auth.signOut();
      window.location.href = "/login";
    }
  };

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
        <div className="p-5">
          <div className="relative mx-auto flex flex-col items-center">
            <Link href="/">
              <img
                src="/logo.svg"
                alt="superglue Logo"
                className="max-w-full h-[50px] w-auto ml-auto mr-auto cursor-pointer"
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
        <div className="py-3 px-2 border-t border-border space-y-0.5">
          {supabase && (
            <button
              onClick={handleLogout}
              className="w-full flex items-center px-3 py-2.5 text-sm text-muted-foreground hover:bg-gradient-to-br hover:from-muted/40 hover:to-muted/20 dark:hover:from-muted/40 dark:hover:to-muted/20 hover:text-foreground rounded-xl transition-all duration-200"
            >
              <LogOut className="h-4 w-4 mr-3" />
              Sign Out
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
