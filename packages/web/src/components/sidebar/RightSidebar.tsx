"use client";

import { Button } from "@/src/components/ui/button";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { Switch } from "@/src/components/ui/switch";
import { cn } from "@/src/lib/general-utils";
import { Log, SuperglueClient } from "@superglue/shared";
import { motion } from "framer-motion";
import { ChevronRight, ScrollText } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useConfig } from "@/src/app/config-context";
import { tokenRegistry } from "@/src/lib/token-registry";

const SIDEBAR_MIN_WIDTH = 420;
const SIDEBAR_MAX_WIDTH = 800;
const SIDEBAR_COLLAPSED_WIDTH = 48;

interface RightSidebarProps {
  className?: string;
}

export function RightSidebar({ className }: RightSidebarProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [transitionDuration, setTransitionDuration] = useState(0);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_MIN_WIDTH);
  const resizingWidthRef = useRef(sidebarWidth);
  const sidebarRef = useRef<HTMLDivElement | null>(null);

  const [logs, setLogs] = useState<Log[]>([]);
  const [hasNewLogs, setHasNewLogs] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const config = useConfig();

  useEffect(() => {
    const savedExpanded = localStorage.getItem("global-sidebar-expanded") === "true";
    setIsExpanded(savedExpanded);
    setIsHydrated(true);
    requestAnimationFrame(() => setTransitionDuration(0.3));
  }, []);

  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem("global-sidebar-expanded", String(isExpanded));
    }
  }, [isExpanded, isHydrated]);

  const client = useMemo(() => {
    return new SuperglueClient({
      endpoint: config.superglueEndpoint,
      apiKey: tokenRegistry.getToken(),
    });
  }, [config.superglueEndpoint]);

  const filteredLogs = useMemo(
    () => (showDebug ? logs : logs.filter((log) => log.level !== "DEBUG")),
    [logs, showDebug],
  );

  useEffect(() => {
    const subscription = client.subscribeToLogs({
      onLog: (log) => {
        setLogs((prev) => [...prev, log].slice(-100));
        if (!isExpanded) {
          setHasNewLogs(true);
        }
      },
      onError: (error) => {
        console.warn("Log subscription error:", error);
      },
      includeDebug: true,
    });

    return () => {
      subscription.then((sub) => sub.unsubscribe());
      client.disconnect();
    };
  }, [client, isExpanded]);

  useEffect(() => {
    if (isExpanded) {
      setHasNewLogs(false);
    }
  }, [isExpanded]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setTransitionDuration(0);
    const startX = e.clientX;
    const startWidth = resizingWidthRef.current;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX;
      let newWidth = startWidth + delta;
      newWidth = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, newWidth));
      resizingWidthRef.current = newWidth;
      if (sidebarRef.current) {
        sidebarRef.current.style.width = `${newWidth}px`;
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      setSidebarWidth(resizingWidthRef.current);
      setTransitionDuration(0.3);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  return (
    <motion.div
      ref={sidebarRef}
      animate={{
        width: isExpanded ? Math.max(sidebarWidth, SIDEBAR_MIN_WIDTH) : SIDEBAR_COLLAPSED_WIDTH,
      }}
      transition={{ duration: transitionDuration }}
      className={cn(
        "border-l border-border bg-background flex flex-col relative h-full",
        className,
      )}
    >
      {/* Collapsed state */}
      <div className={cn("flex flex-col items-center py-3 gap-2", isExpanded && "hidden")}>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsExpanded(true)}
          className="h-10 w-10 relative bg-primary/10 text-primary"
          title="Logs"
        >
          <ScrollText className="h-5 w-5" />
          {hasNewLogs && (
            <span className="absolute top-1 right-1 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
            </span>
          )}
        </Button>
      </div>

      {/* Expanded state */}
      <div className={cn("flex flex-col h-full", !isExpanded && "hidden")}>
        <div className="flex items-center justify-between border-b px-3 py-2 flex-shrink-0">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <ScrollText className="h-4 w-4" />
            Logs
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsExpanded(false)}
            className="h-7 w-7"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <LogsPanel
          filteredLogs={filteredLogs}
          expandedLogs={expandedLogs}
          setExpandedLogs={setExpandedLogs}
          showDebug={showDebug}
          setShowDebug={setShowDebug}
        />

        <div
          onMouseDown={handleMouseDown}
          className="absolute left-0 top-0 h-full w-2 cursor-col-resize bg-transparent border-none outline-none"
        />
      </div>
    </motion.div>
  );
}

interface LogsPanelProps {
  filteredLogs: Log[];
  expandedLogs: Set<string>;
  setExpandedLogs: React.Dispatch<React.SetStateAction<Set<string>>>;
  showDebug: boolean;
  setShowDebug: (show: boolean) => void;
}

function LogsPanel({
  filteredLogs,
  expandedLogs,
  setExpandedLogs,
  showDebug,
  setShowDebug,
}: LogsPanelProps) {
  useEffect(() => {
    const scrollArea = document.querySelector(
      "[data-sidebar-logs] [data-radix-scroll-area-viewport]",
    );
    if (scrollArea && filteredLogs.length > 0) {
      scrollArea.scrollTop = scrollArea.scrollHeight;
    }
  }, [filteredLogs]);

  return (
    <div className="flex flex-col h-full min-h-0" data-sidebar-logs>
      <ScrollArea className="flex-1">
        <div className="p-4">
          {filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full pt-28 pb-12 text-center">
              <ScrollText className="h-10 w-10 text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">No logs yet</p>
              <p className="text-xs text-muted-foreground/70 mt-2 max-w-[240px]">
                Logs will appear here as you execute tools
              </p>
            </div>
          ) : (
            filteredLogs.map((log) => {
              const isLogExpanded = expandedLogs.has(log.id);
              const shouldTruncate = log.message.length > 100;
              const displayMessage =
                shouldTruncate && !isLogExpanded ? log.message.slice(0, 100) + "..." : log.message;

              return (
                <div
                  key={log.id}
                  className={cn(
                    "mb-2 p-2 rounded text-sm overflow-hidden",
                    log.level === "ERROR"
                      ? "bg-red-500/10"
                      : log.level === "WARN"
                        ? "bg-yellow-500/10"
                        : "bg-muted",
                  )}
                >
                  <div className="flex justify-between">
                    <span className="font-mono text-xs">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span
                      className={cn(
                        "font-semibold text-xs",
                        log.level === "ERROR" && "text-red-500",
                        log.level === "WARN" && "text-yellow-500",
                      )}
                    >
                      {log.level}
                    </span>
                  </div>
                  <p className="max-w-full break-words text-xs mt-1">{displayMessage}</p>
                  {shouldTruncate && (
                    <button
                      onClick={() =>
                        setExpandedLogs((prev) => {
                          const newSet = new Set(prev);
                          isLogExpanded ? newSet.delete(log.id) : newSet.add(log.id);
                          return newSet;
                        })
                      }
                      className="text-xs text-muted-foreground hover:text-foreground mt-1"
                    >
                      {isLogExpanded ? "Show less" : "Show more"}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
      <div className="px-4 py-2 flex items-center justify-end gap-2">
        <span className="text-xs text-muted-foreground">Show Debug</span>
        <Switch
          checked={showDebug}
          onCheckedChange={setShowDebug}
          className="data-[state=checked]:bg-amber-500"
        />
      </div>
    </div>
  );
}
