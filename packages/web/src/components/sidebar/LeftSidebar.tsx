"use client";

import { Button } from "@/src/components/ui/button";
import { useTheme } from "@/src/hooks/use-theme";
import {
  Blocks,
  Book,
  Bot,
  ExternalLink,
  Hammer,
  History,
  Menu,
  Monitor,
  Moon,
  Sun,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const navItems = [
  { icon: Bot, label: "Agent", href: "/" },
  { icon: Hammer, label: "Tools", href: "/tools" },
  { icon: Blocks, label: "Systems", href: "/systems" },
  { icon: Book, label: "Documentation", href: "https://docs.superglue.cloud", target: "_blank" },
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
        w-52 min-w-56 flex-shrink-0 bg-background border-r border-border 
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
