"use client";
import { useEffect, useRef } from "react";
import { useToast } from "@/src/hooks/use-toast";
import { useConnectionState } from "@/src/hooks/use-connection-state";

export function ConnectionToast() {
  const state = useConnectionState();
  const { toast } = useToast();
  const toastShownRef = useRef(false);

  useEffect(() => {
    if (state === "disconnected" && !toastShownRef.current) {
      toastShownRef.current = true;
      toast({
        title: "Reconnecting to server...",
        description: "Attempting to restore connection",
      });
    }
    if (state === "connected") {
      toastShownRef.current = false;
    }
  }, [state, toast]);

  return null;
}
