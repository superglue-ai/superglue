"use client"
import { usePathname } from 'next/navigation'
import { ConfigProvider } from './config-context'
import { Sidebar } from '../components/Sidebar'
import { CSPostHogProvider } from './providers'
import { motion, AnimatePresence } from 'framer-motion'
import { Toaster } from '../components/ui/toaster'
import { ServerMonitor } from '../components/ServerMonitor'
import { geistSans, geistMono } from './fonts'

export function ClientWrapper({ children, config }: { children: React.ReactNode, config: any }) {
  const pathname = usePathname() 
  return (
    <ConfigProvider config={config}>
      <CSPostHogProvider>
        <div className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
          <div className="flex h-screen overflow-hidden">
            <Sidebar />
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
          <Toaster />
          <ServerMonitor />
        </div>
      </CSPostHogProvider>
    </ConfigProvider>
  )
}