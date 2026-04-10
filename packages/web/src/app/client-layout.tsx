"use client";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { LeftSidebar } from "@/src/components/sidebar/LeftSidebar";
import { RightSidebar } from "@/src/components/sidebar/RightSidebar";
import { RightSidebarProvider } from "@/src/components/sidebar/RightSidebarContext";
import { AgentModalProvider, AgentModalContent } from "@/src/components/agent/AgentModalContext";
import {
  SystemPickerModalProvider,
  SystemPickerModalContent,
} from "@/src/components/systems/SystemPickerModalContext";
import { Toaster } from "../components/ui/toaster";
import { ConnectionToast } from "../components/utils/ConnectionToast";
import { ConfigProvider, type Config } from "./config-context";
import { OrgProvider } from "./org-context";
import { EnvironmentProvider } from "./environment-context";
import { jetbrainsMono, jetbrainsSans } from "./fonts";
import { CSPostHogProvider } from "./providers";
import { useToken } from "../hooks/use-token";
import { queryClient } from "@/src/queries";
import { useEffect, useState } from "react";
import { connectionMonitor } from "@/src/lib/connection-monitor";

interface Props {
  children: React.ReactNode;
  config: Config;
}

function WelcomeGate({
  children,
  apiEndpoint,
  token,
}: {
  children: React.ReactNode;
  apiEndpoint: string;
  token: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isWelcomePage = pathname === "/welcome";
  const [welcomeStatus, setWelcomeStatus] = useState<"unknown" | "required" | "complete">(
    isWelcomePage ? "complete" : "unknown",
  );

  useEffect(() => {
    let cancelled = false;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;

    if (isWelcomePage || welcomeStatus !== "unknown") {
      return;
    }

    if (!token) {
      return;
    }

    const checkTenantInfo = async () => {
      try {
        const response = await fetch(`${apiEndpoint.replace(/\/$/, "")}/v1/tenant-info`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        });

        if (!response.ok) {
          if (response.status >= 500 && !cancelled) {
            connectionMonitor.onInfrastructureError(apiEndpoint);
            retryTimeout = setTimeout(() => {
              void checkTenantInfo();
            }, 1000);
            return;
          }
          if (!cancelled) setWelcomeStatus("complete");
          return;
        }

        const tenantInfo = await response.json();
        const requiresWelcome = !tenantInfo?.email && !tenantInfo?.emailEntrySkipped;

        if (!cancelled) {
          setWelcomeStatus(requiresWelcome ? "required" : "complete");
        }
      } catch {
        if (!cancelled) {
          connectionMonitor.onInfrastructureError(apiEndpoint);
          retryTimeout = setTimeout(() => {
            void checkTenantInfo();
          }, 1000);
        }
      }
    };

    void checkTenantInfo();

    return () => {
      cancelled = true;
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
    };
  }, [apiEndpoint, isWelcomePage, token, welcomeStatus]);

  useEffect(() => {
    if (!isWelcomePage && welcomeStatus === "required") {
      router.replace("/welcome");
    }
  }, [isWelcomePage, router, welcomeStatus]);

  if (!isWelcomePage && welcomeStatus === "unknown") {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return <>{children}</>;
}

export function ClientWrapper({ children, config }: Props) {
  const pathname = usePathname();
  const token = useToken();
  const isWelcomePage = pathname === "/welcome";

  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider config={config}>
        <OrgProvider>
          <EnvironmentProvider>
            <CSPostHogProvider serverSession={config.serverSession}>
              <RightSidebarProvider>
                <AgentModalProvider>
                  <SystemPickerModalProvider>
                    <div
                      className={`${jetbrainsSans.variable} ${jetbrainsMono.variable} antialiased`}
                    >
                      <WelcomeGate apiEndpoint={config.apiEndpoint} token={token}>
                        {isWelcomePage ? (
                          <div className="min-h-screen">
                            {children}
                            <SystemPickerModalContent />
                            <AgentModalContent />
                          </div>
                        ) : (
                          <div className="flex h-screen overflow-hidden">
                            {token && <LeftSidebar />}
                            <div className="relative flex-1 min-w-0 h-full">
                              <AnimatePresence mode="wait">
                                <motion.div
                                  key={pathname}
                                  initial={{ opacity: 0, x: 20 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ duration: 0.3 }}
                                  className="w-full h-full overflow-y-auto"
                                >
                                  {children}
                                </motion.div>
                              </AnimatePresence>
                              <SystemPickerModalContent />
                              <AgentModalContent />
                            </div>
                            {token && (
                              <div className="hidden lg:flex h-full flex-shrink-0">
                                <RightSidebar />
                              </div>
                            )}
                          </div>
                        )}
                      </WelcomeGate>
                      <Toaster />
                      {token && !isWelcomePage && <ConnectionToast />}
                    </div>
                  </SystemPickerModalProvider>
                </AgentModalProvider>
              </RightSidebarProvider>
            </CSPostHogProvider>
          </EnvironmentProvider>
        </OrgProvider>
      </ConfigProvider>
      {process.env.NODE_ENV === "development" && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
