"use client";
import { useEffect, useState } from 'react';
import { useToast } from "@/src/hooks/use-toast"
import { useConfig } from '@/src/app/config-context';
export function ServerMonitor() {
  const [isServerDown, setIsServerDown] = useState(false);
  const { toast } = useToast()
  const serverConfig = useConfig();

  useEffect(() => {
    const checkServer = async () => {
      try {
        const endpoint = serverConfig.superglueEndpoint.replace(/\/$/, '');
        const response = await fetch(`${endpoint}/health`);
        if (!response.ok) {
          throw new Error("Server is down");
        }
        setIsServerDown(!response.ok);
      } catch (error) {
        toast({
          title: "Connection could not be established",
          description: `Please check your connection.\nEndpoint: ${serverConfig.superglueEndpoint}`,
          variant: "destructive",
          duration: Infinity,
        })
        setIsServerDown(true);
      }
    };

    // Check immediately and then every 10 seconds
    checkServer();
    const interval = setInterval(checkServer, 10000);

    return () => clearInterval(interval);
  }, [isServerDown, toast]);

  return null;
} 