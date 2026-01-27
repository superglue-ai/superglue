"use client";

import { Button } from "@/src/components/ui/button";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { Switch } from "@/src/components/ui/switch";
import { cn } from "@/src/lib/general-utils";
import { Log, SuperglueClient } from "@superglue/shared";
import { ChevronRight, MessagesSquare, ScrollText } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConfig } from "@/src/app/config-context";
import { tokenRegistry } from "@/src/lib/token-registry";
import { useRightSidebar } from "./RightSidebarContext";

const SIDEBAR_MIN_WIDTH = 300;
const SIDEBAR_MAX_WIDTH = 700;
const SIDEBAR_DEFAULT_WIDTH = 350;
const SIDEBAR_COLLAPSED_WIDTH = 45;

type ActivePanel = "logs" | "agent";

interface RightSidebarProps {
  className?: string;
}

export function RightSidebar({ className }: RightSidebarProps) {
  const { showAgent, setAgentPortalRef, setExpandSidebar } = useRightSidebar();
  const agentContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      setAgentPortalRef(node);
    },
    [setAgentPortalRef],
  );
  const [isExpanded, setIsExpanded] = useState(false);
  const [activePanel, setActivePanel] = useState<ActivePanel>(showAgent ? "agent" : "logs");
  const [isHydrated, setIsHydrated] = useState(false);
  const [transitionDuration, setTransitionDuration] = useState(0);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const resizingWidthRef = useRef(sidebarWidth);
  const cleanupRef = useRef<(() => void) | null>(null);
  const sidebarRef = useRef<HTMLDivElement | null>(null);

  const [logs, setLogs] = useState<Log[]>([]);
  const [hasNewLogs, setHasNewLogs] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const config = useConfig();

  const isExpandedRef = useRef(isExpanded);
  const activePanelRef = useRef(activePanel);
  isExpandedRef.current = isExpanded;
  activePanelRef.current = activePanel;

  useEffect(() => {
    const storageKey = showAgent ? "playground-sidebar" : "global-sidebar";
    const savedExpanded = localStorage.getItem(`${storageKey}-expanded`) === "true";
    const savedPanel = localStorage.getItem(`${storageKey}-panel`) as ActivePanel;
    // When agent mode activates, always expand the sidebar
    setIsExpanded(showAgent ? true : savedExpanded);
    if (showAgent) {
      setActivePanel(savedPanel === "logs" || savedPanel === "agent" ? savedPanel : "agent");
    }
    setIsHydrated(true);
    requestAnimationFrame(() => setTransitionDuration(0.3));
  }, [showAgent]);

  useEffect(() => {
    if (isHydrated) {
      const storageKey = showAgent ? "playground-sidebar" : "global-sidebar";
      localStorage.setItem(`${storageKey}-expanded`, String(isExpanded));
    }
  }, [isExpanded, isHydrated, showAgent]);

  useEffect(() => {
    if (isHydrated && showAgent) {
      localStorage.setItem("playground-sidebar-panel", activePanel);
    }
  }, [activePanel, isHydrated, showAgent]);

  useEffect(() => {
    setExpandSidebar(() => {
      setIsExpanded(true);
      setActivePanel("agent");
    });
  }, [setExpandSidebar]);

  const client = useMemo(() => {
    return new SuperglueClient({
      endpoint: config.superglueEndpoint,
      apiKey: tokenRegistry.getToken(),
      apiEndpoint: config.apiEndpoint,
    });
  }, [config.superglueEndpoint, config.apiEndpoint]);

  const filteredLogs = useMemo(
    () => (showDebug ? logs : logs.filter((log) => log.level !== "DEBUG")),
    [logs, showDebug],
  );

  useEffect(() => {
    const subscription = client.subscribeToLogs({
      onLog: (log) => {
        setLogs((prev) => [...prev, log].slice(-1000));
        if (!isExpandedRef.current || activePanelRef.current !== "logs") {
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
  }, [client]);

  useEffect(() => {
    if (isExpanded && activePanel === "logs") {
      setHasNewLogs(false);
    }
  }, [isExpanded, activePanel]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    cleanupRef.current?.();

    setIsResizing(true);
    setTransitionDuration(0);
    const startX = e.clientX;
    const startWidth = resizingWidthRef.current;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX;
      let newWidth = startWidth + delta;
      newWidth = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, newWidth));
      resizingWidthRef.current = newWidth;
      setSidebarWidth(newWidth);
    };

    const cleanup = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", cleanup);
      setIsResizing(false);
      setTransitionDuration(0.3);
      cleanupRef.current = null;
    };

    cleanupRef.current = cleanup;
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", cleanup);
  };

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  const handlePanelSelect = (panel: ActivePanel) => {
    setActivePanel(panel);
    if (!isExpanded) {
      setIsExpanded(true);
    }
    if (panel === "logs") {
      setHasNewLogs(false);
    }
  };

  const currentWidth = isExpanded
    ? Math.max(sidebarWidth, SIDEBAR_MIN_WIDTH)
    : SIDEBAR_COLLAPSED_WIDTH;

  return (
    <div
      ref={sidebarRef}
      style={{
        width: currentWidth,
        transition: isResizing ? "none" : `width ${transitionDuration}s ease`,
      }}
      className={cn(
        "border-l border-border bg-background flex flex-col relative h-full",
        className,
      )}
    >
      {/* Collapsed state - stacked icons */}
      <div className={cn("flex flex-col items-center py-3 gap-2", isExpanded && "hidden")}>
        {showAgent && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handlePanelSelect("agent")}
            className={cn(
              "h-10 w-10 relative",
              activePanel === "agent" && "bg-primary/10 text-primary",
            )}
            title="Agent"
          >
            <MessagesSquare className="h-5 w-5" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => handlePanelSelect("logs")}
          className={cn(
            "h-10 w-10 relative",
            (!showAgent || activePanel === "logs") && "bg-primary/10 text-primary",
          )}
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
          <div className="flex items-center gap-1">
            {showAgent && (
              <button
                onClick={() => setActivePanel("agent")}
                className={cn(
                  "h-7 px-2 gap-1.5 text-xs rounded-md inline-flex items-center font-medium transition-colors",
                  activePanel === "agent"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
              >
                <MessagesSquare className="h-3.5 w-3.5" />
                Agent
              </button>
            )}
            <button
              onClick={() => {
                setActivePanel("logs");
                setHasNewLogs(false);
              }}
              className={cn(
                "h-7 px-2 gap-1.5 relative text-xs rounded-md inline-flex items-center font-medium transition-colors",
                activePanel === "logs"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              <ScrollText className="h-3.5 w-3.5" />
              Logs
              {hasNewLogs && activePanel !== "logs" && (
                <span className="absolute -top-1 -right-1 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                </span>
              )}
            </button>
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

        <div className="flex-1 overflow-hidden">
          {showAgent && (
            <div
              ref={agentContainerRef}
              className={cn("h-full", activePanel !== "agent" && "hidden")}
            />
          )}
          <div className={cn("h-full", activePanel !== "logs" && "hidden")}>
            <LogsPanel
              filteredLogs={filteredLogs}
              expandedLogs={expandedLogs}
              setExpandedLogs={setExpandedLogs}
              showDebug={showDebug}
              setShowDebug={setShowDebug}
            />
          </div>
        </div>

        <div
          onMouseDown={handleMouseDown}
          className="absolute left-0 top-0 h-full w-2 cursor-col-resize bg-transparent border-none outline-none"
        />
      </div>
    </div>
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
