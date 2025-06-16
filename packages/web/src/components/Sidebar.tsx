"use client";

import { Button } from "@/src/components/ui/button";
import { useTheme } from "@/src/hooks/useTheme";
import { Book, Bot, History, Layout, Monitor, Moon, PlayCircle, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const navItems = [
  { icon: Layout, label: "Configurations", href: "/" },
  { icon: History, label: "Runs", href: "/runs" },
  { icon: PlayCircle, label: "Playground", href: "/playground" },
  { icon: Bot, label: "MCP Setup", href: "https://docs.superglue.cloud/mcp", target: "_blank" },
  { icon: Book, label: "Documentation", href: "https://docs.superglue.cloud", target: "_blank" },
  /*  { icon: AlertCircle, label: 'Error Monitoring', href: '/analytics' },
  { icon: Shield, label: 'Access Control', href: '/access-control' },
  { icon: Code, label: 'SDK Generation', href: '/sdk' },
*/
];

export function Sidebar() {
  const pathname = usePathname();
  const [theme, setTheme, resolvedTheme] = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <aside className="bg-background text-foreground border-r border-border h-full flex flex-col">
      <div className="p-6">
        <div className="relative mx-auto">
          <img src="/logo.svg" alt="superglue Logo" className="max-w-full h-[50px] w-[200px] ml-auto mr-auto" />
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
              className={`flex items-center px-6 py-3 text-sm ${isActive
                ? "bg-gray-100 dark:bg-secondary text-gray-900 dark:text-white border-r-2 border-gray-900 dark:border-white"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-secondary"
                }`}
            >
              <Icon className="h-4 w-4 mr-3" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-6 mt-auto flex flex-col items-center">
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
    </aside>
  );
}
