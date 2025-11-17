"use client"
import { AnimatePresence, motion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { Sidebar } from '../components/sidebar/Sidebar';
import { Toaster } from '../components/ui/toaster';
import { LogSidebar } from '../components/utils/LogSidebar';
import { ServerMonitor } from '../components/utils/ServerMonitor';
import { ConfigProvider } from './config-context';
import { jetbrainsMono, jetbrainsSans } from './fonts';
import { CSPostHogProvider } from './providers';
import { useToken } from '../hooks/use-token';
import { ConditionalDataProvider } from './conditional-data-provider';

interface Props {
  children: React.ReactNode
  config: any  // keep existing type
}

export function ClientWrapper({ children, config }: Props) {
  const pathname = usePathname()
  const isAuthPage = pathname?.startsWith('/auth');
  const token = useToken();

  return (
    <ConfigProvider config={config}>
      <CSPostHogProvider>
        <ConditionalDataProvider>
          <div
            className={`${jetbrainsSans.variable} ${jetbrainsMono.variable} antialiased`}
          >
            {isAuthPage ? (
              children
            ) : (
              <div className="flex h-screen overflow-hidden">
                {token && <Sidebar />}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={pathname}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3 }}
                    className="w-full h-full overflow-y-scroll"
                  >
                    {children}
                  </motion.div>
                </AnimatePresence>
                {token && (
                  <div className="hidden lg:block">
                    <LogSidebar />
                  </div>
                )}
              </div>
            )}
            <Toaster />
            {token && <ServerMonitor />}
          </div>
        </ConditionalDataProvider>
      </CSPostHogProvider>
    </ConfigProvider>
  );
}