"use client"
import { AnimatePresence, motion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { Sidebar } from '../components/sidebar/Sidebar';
import { Toaster } from '../components/ui/toaster';
import { LogSidebar } from '../components/utils/LogSidebar';
import { ServerMonitor } from '../components/utils/ServerMonitor';
import { tokenRegistry } from '../lib/token-registry';
import { ConfigProvider } from './config-context';
import { jetbrainsMono, jetbrainsSans } from './fonts';
import { IntegrationsProvider } from './integrations-context';
import { CSPostHogProvider } from './providers';

interface Props {
  children: React.ReactNode
  config: any  // keep existing type
}

export function ClientWrapper({ children, config }: Props) {
  const pathname = usePathname()
  const isAuthPage = pathname?.startsWith('/auth')

  return (
    <ConfigProvider config={config}>
      <IntegrationsProvider>
        <CSPostHogProvider>
          <div className={`${jetbrainsSans.variable} ${jetbrainsMono.variable} antialiased`}>
            {isAuthPage ? (
              children
            ) : (
              <div className="flex h-screen overflow-hidden">
                {tokenRegistry.hasToken() && <Sidebar />}
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
                {tokenRegistry.hasToken() && (
                  <div className="hidden lg:block">
                    <LogSidebar />
                  </div>
                )}
              </div>
            )}
            <Toaster />
            {tokenRegistry.hasToken() && <ServerMonitor />}
          </div>
        </CSPostHogProvider>
      </IntegrationsProvider>
    </ConfigProvider>
  )
}