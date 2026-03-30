"use client";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { LeftSidebar } from "@/src/components/sidebar/LeftSidebar";
import { RightSidebar } from "@/src/components/sidebar/RightSidebar";
import { RightSidebarProvider } from "@/src/components/sidebar/RightSidebarContext";
import { AgentModalProvider, AgentModalContent } from "@/src/components/agent/AgentModalContext";
import {
  SystemPickerModalProvider,
  SystemPickerModalContent,
} from "@/src/components/systems/SystemPickerModalContext";
import { Toaster } from "../components/ui/toaster";
import { ServerMonitor } from "../components/utils/ServerMonitor";
import { ConfigProvider } from "./config-context";
import { jetbrainsMono, jetbrainsSans } from "./fonts";
import { CSPostHogProvider } from "./providers";
import { useToken } from "../hooks/use-token";
import { ConditionalDataProvider } from "./conditional-data-provider";
import { AuthModal } from "@/src/components/auth/AuthModal";
import { useState, useEffect } from "react";
import { getAuthCookies, type AuthCredentials } from "@/src/lib/auth-cookies";
import { tokenRegistry } from "@/src/lib/token-registry";

interface Props {
  children: React.ReactNode;
  config: any;
}

export function ClientWrapper({ children, config }: Props) {
  const pathname = usePathname();
  const isAuthPage = pathname?.startsWith("/auth");
  const isEmbeddedPage = pathname?.startsWith("/embedded");
  const isPortalPage = pathname?.startsWith("/portal");
  const token = useToken();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authConfig, setAuthConfig] = useState(config);

  useEffect(() => {
    // Check for cookie-based auth first
    const cookieAuth = getAuthCookies();
    if (cookieAuth) {
      // Cookie-based auth: store in config for other API calls
      setAuthConfig({
        ...config,
        apiEndpoint: cookieAuth.apiUrl,
      });
      tokenRegistry.setToken(cookieAuth.apiKey);
    } else if (!config.superglueApiKey) {
      // Show auth modal if no env var and no cookies
      setShowAuthModal(true);
    }
  }, []);

  return (
    <>
      <AuthModal isOpen={showAuthModal} defaultApiUrl={config.apiEndpoint} />
      <ConfigProvider config={authConfig}>
        <ConditionalDataProvider>
          <CSPostHogProvider>
            <RightSidebarProvider>
              <AgentModalProvider>
                <SystemPickerModalProvider>
                  <div
                    className={`${jetbrainsSans.variable} ${jetbrainsMono.variable} antialiased`}
                  >
                    {isAuthPage || isEmbeddedPage || isPortalPage ? (
                      children
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
                    <Toaster />
                    {token && <ServerMonitor />}
                  </div>
                </SystemPickerModalProvider>
              </AgentModalProvider>
            </RightSidebarProvider>
          </CSPostHogProvider>
        </ConditionalDataProvider>
      </ConfigProvider>
    </>
  );
}
