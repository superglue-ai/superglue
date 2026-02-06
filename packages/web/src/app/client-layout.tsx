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
import {
  UpgradeModalProvider,
  UpgradeModalContent,
} from "@/src/components/upgrade/UpgradeModalContext";
import { Toaster } from "../components/ui/toaster";
import { ServerMonitor } from "../components/utils/ServerMonitor";
import { OnboardingModal } from "../components/onboarding/OnboardingModal";
import { ConfigProvider } from "./config-context";
import { jetbrainsMono, jetbrainsSans } from "./fonts";
import { CSPostHogProvider } from "./providers";
import { useToken } from "../hooks/use-token";
import { ConditionalDataProvider } from "./conditional-data-provider";

interface Props {
  children: React.ReactNode;
  config: any;
}

export function ClientWrapper({ children, config }: Props) {
  const pathname = usePathname();
  const isAuthPage = pathname?.startsWith("/auth");
  const isEmbeddedPage = pathname?.startsWith("/embedded");
  const token = useToken();

  return (
    <ConfigProvider config={config}>
      <ConditionalDataProvider>
        <CSPostHogProvider>
          <RightSidebarProvider>
            <AgentModalProvider>
              <SystemPickerModalProvider>
                <UpgradeModalProvider>
                  <div
                    className={`${jetbrainsSans.variable} ${jetbrainsMono.variable} antialiased`}
                  >
                    {isAuthPage || isEmbeddedPage ? (
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
                    {token && <OnboardingModal />}
                    {token && <UpgradeModalContent />}
                  </div>
                </UpgradeModalProvider>
              </SystemPickerModalProvider>
            </AgentModalProvider>
          </RightSidebarProvider>
        </CSPostHogProvider>
      </ConditionalDataProvider>
    </ConfigProvider>
  );
}
