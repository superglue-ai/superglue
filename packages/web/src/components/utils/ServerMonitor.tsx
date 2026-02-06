"use client";
import { useEffect, useRef, useState } from "react";
import { useToast } from "@/src/hooks/use-toast";
import { useConfig } from "@/src/app/config-context";

export function ServerMonitor() {
  const [isServerDown, setIsServerDown] = useState(false);
  const toastShownRef = useRef(false);
  const { toast } = useToast();
  const serverConfig = useConfig();

  useEffect(() => {
    const checkServer = async (retryCount = 0) => {
      try {
        const endpoint = serverConfig.superglueEndpoint.replace(/\/$/, "");
        const response = await fetch(`${endpoint}/health`);
        if (!response.ok) {
          throw new Error("Server is down");
        }
        setIsServerDown(false);
        toastShownRef.current = false;
      } catch (error) {
        // Only show toast after 2 retries to avoid false positives during page load
        // and only if we haven't already shown it
        if (retryCount >= 2 && !toastShownRef.current) {
          toastShownRef.current = true;
          toast({
            title: "Reconnecting to server...",
            description: "Attempting to restore connection",
          });
        }
        setIsServerDown(true);
      }
    };

    // Add small delay before first check to avoid false positives during page load
    const initialTimeout = setTimeout(() => {
      checkServer();
    }, 1000);

    // Then check every 10 seconds
    const interval = setInterval(() => checkServer(2), 10000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [serverConfig.superglueEndpoint, toast]);

  return null;
}
