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
import { useChatRuntime } from '@assistant-ui/react-ai-sdk'
import { AssistantRuntimeProvider, makeAssistantReadable } from '@assistant-ui/react'
import { Thread } from '@/src/components/assistant-ui/thread'

interface Props {
  children: React.ReactNode
  config: any  // keep existing type
}

export function ClientWrapper({ children, config }: Props) {
  const pathname = usePathname()
  const isAuthPage = pathname?.startsWith('/auth')
  const AssistantSidebar = makeAssistantReadable(Sidebar);
  
  const runtime = useChatRuntime({
    api: "/api/chat",
  });

  return (
    <ConfigProvider config={config}>
      <CSPostHogProvider>
        <AssistantRuntimeProvider runtime={runtime}>
        <div className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
          {isAuthPage ? (
            children
          ) : (
            <div className="flex h-screen overflow-hidden">
                {config.superglueApiKey && <AssistantSidebar />}
                {children}
                <div className="px-4 py-4 border relative z-50">
                  <Thread />
                </div>
            </div>
          )}
          <Toaster />
          {config.superglueApiKey && <ServerMonitor />}
          {config.superglueApiKey && <TutorialModal />}
        </div>
        </AssistantRuntimeProvider>
      </CSPostHogProvider>
    </ConfigProvider>
  )
}