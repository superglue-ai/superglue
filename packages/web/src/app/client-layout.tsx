"use client"
import { TutorialModal } from '@/src/components/TutorialModal'
import { AnimatePresence, motion } from 'framer-motion'
import { usePathname } from 'next/navigation'
import { ServerMonitor } from '../components/ServerMonitor'
import { Sidebar } from '../components/Sidebar'
import { Toaster } from '../components/ui/toaster'
import { ConfigProvider } from './config-context'
import { geistMono, geistSans } from './fonts'
import { CSPostHogProvider } from './providers'

interface Props {
  children: React.ReactNode
  config: any  // keep existing type
}

export function ClientWrapper({ children, config }: Props) {
  const pathname = usePathname()
  const isAuthPage = pathname?.startsWith('/auth')

  return (
    <ConfigProvider config={config}>
      <CSPostHogProvider>
        <div className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
          {isAuthPage ? (
            children
          ) : (
            <div className="flex h-screen overflow-hidden">
              {config.superglueApiKey && <Sidebar />}
              <AnimatePresence mode="wait">
                <motion.div
                  key={pathname}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3 }}
                  className="w-full h-full overflow-auto"
                >
                  {children}
                </motion.div>
              </AnimatePresence>
            </div>
          )}
          <Toaster />
          {config.superglueApiKey && <ServerMonitor />}
          {config.superglueApiKey && <TutorialModal />}
        </div>
      </CSPostHogProvider>
    </ConfigProvider>
  )
}