"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

interface UseUnsavedChangesGuardOptions {
  enabled: boolean;
  message?: string;
}

interface UseUnsavedChangesGuardReturn {
  showDialog: boolean;
  pendingNavigation: string | null;
  confirmNavigation: () => void;
  cancelNavigation: () => void;
  message: string;
}

export function useUnsavedChangesGuard({
  enabled,
  message = "You have unsaved changes. Are you sure you want to leave?",
}: UseUnsavedChangesGuardOptions): UseUnsavedChangesGuardReturn {
  const router = useRouter();
  const pathname = usePathname();
  const [showDialog, setShowDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  // Handle browser close/refresh with native dialog
  useEffect(() => {
    if (!enabled) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [enabled]);

  // Handle internal link clicks
  useEffect(() => {
    if (!enabled) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest("a");

      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href) return;

      // Skip external links, hash links, and same-page links
      if (
        href.startsWith("http") ||
        href.startsWith("#") ||
        href === pathname ||
        anchor.target === "_blank"
      ) {
        return;
      }

      // Skip if modifier keys are pressed (open in new tab)
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      // Check if guard is still enabled (use ref for latest value)
      if (!enabledRef.current) return;

      e.preventDefault();
      e.stopPropagation();
      setPendingNavigation(href);
      setShowDialog(true);
    };

    document.addEventListener("click", handleClick, { capture: true });
    return () => document.removeEventListener("click", handleClick, { capture: true });
  }, [enabled, pathname]);

  // Handle browser back/forward buttons
  useEffect(() => {
    if (!enabled) return;

    // Push a marker state so we can detect back navigation
    const currentUrl = window.location.pathname + window.location.search;
    history.pushState({ guardMarker: true }, "", currentUrl);

    const handlePopState = (e: PopStateEvent) => {
      if (!enabledRef.current) return;

      // User pressed back - show confirmation
      // Push state again to prevent actual navigation
      history.pushState({ guardMarker: true }, "", currentUrl);
      setPendingNavigation("__back__");
      setShowDialog(true);
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      // Clean up the marker we pushed to avoid accumulating markers across edit/save cycles
      if (history.state?.guardMarker) {
        history.back();
      }
    };
  }, [enabled, pathname]);

  const confirmNavigation = useCallback(() => {
    setShowDialog(false);
    const target = pendingNavigation;
    setPendingNavigation(null);

    if (target === "__back__") {
      // Go back twice: once to undo our marker push, once for actual back
      history.go(-2);
    } else if (target) {
      router.push(target);
    }
  }, [pendingNavigation, router]);

  const cancelNavigation = useCallback(() => {
    setShowDialog(false);
    setPendingNavigation(null);
  }, []);

  return {
    showDialog,
    pendingNavigation,
    confirmNavigation,
    cancelNavigation,
    message,
  };
}
