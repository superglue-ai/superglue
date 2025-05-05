"use client"
import { useState, useEffect, useMemo } from "react"
import { motion } from "framer-motion"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { LogEntry } from "@superglue/shared"
import { Button } from "../ui/button"
import { ScrollArea } from "../ui/scroll-area"
import { ApolloClient, gql, InMemoryCache, useSubscription } from "@apollo/client"
import { GraphQLWsLink } from '@apollo/client/link/subscriptions'
import { createClient } from 'graphql-ws'
import { useConfig } from "../../app/config-context"

const LOGS_SUBSCRIPTION = gql`
  subscription OnNewLog {
    logs {
      id
      message
      level
      timestamp
      runId
    }
  }
`

export function LogSidebar() {
  const [isExpanded, setIsExpanded] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [hasNewLogs, setHasNewLogs] = useState(false)
  const config = useConfig();
  
  const client = useMemo(() => {
    const wsLink = new GraphQLWsLink(createClient({
      url: config.superglueEndpoint?.replace('https', 'wss')?.replace('http', 'ws') || 'ws://localhost:3000/graphql',
      connectionParams: {
        Authorization: `Bearer ${config.superglueApiKey}`
      },
      retryAttempts: Infinity,
      shouldRetry: () => true,
      retryWait: (retries) => new Promise((resolve) => setTimeout(resolve, Math.min(retries * 1000, 5000))),
      keepAlive: 10000, // Send keep-alive every 10 seconds
    }))

    return new ApolloClient({
      link: wsLink,
      cache: new InMemoryCache(),
      defaultOptions: {
        watchQuery: {
          fetchPolicy: 'no-cache',
        },
        query: {
          fetchPolicy: 'no-cache',
        },
      },
    })
  }, [config.superglueEndpoint, config.superglueApiKey])

  useEffect(() => {
    return () => {
      client.stop()
    }
  }, [client])

  useSubscription(LOGS_SUBSCRIPTION, {
    client,
    shouldResubscribe: true,
    onError: (error) => {
      console.warn('Subscription error:', error)
    },
    onData: ({ data }) => {
      if (data.data?.logs) {
        setLogs(prev => [...prev, data.data.logs].slice(-100))
        if (!isExpanded) {
          setHasNewLogs(true)
        }
      }
    }
  })

  // Add auto-scroll effect
  useEffect(() => {
    const scrollArea = document.querySelector('[data-radix-scroll-area-viewport]');
    if (scrollArea && logs.length > 0) {
      scrollArea.scrollTop = scrollArea.scrollHeight;
    }
  }, [logs]);

  // Reset notification and scroll when expanding
  useEffect(() => {
    if (isExpanded) {
      setHasNewLogs(false)
      const scrollArea = document.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollArea) {
        setTimeout(() => {
          scrollArea.scrollTop = scrollArea.scrollHeight;
        }, 100); // Small delay to ensure animation completes
      }
    }
  }, [isExpanded]);

  return (
    <motion.div
      animate={{ width: isExpanded ? 400 : 50 }}
      onAnimationComplete={(definition) => {
        document.documentElement.style.setProperty('--log-sidebar-width', `${typeof definition === 'object' && 'width' in definition ? definition.width : isExpanded ? 400 : 50}px`)
      }}
      className="border-l border-border bg-background flex flex-col relative"
    >
      <div className={`m-2 max-w-full ${isExpanded ? 'h-12' : 'h-24'}`}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="h-full w-full flex items-center justify-center"
        >
          <div className={`flex items-center justify-center w-full ${!isExpanded && '-rotate-90'}`}>
            <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              {hasNewLogs && !isExpanded && <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
              </span>}
              Logs
            </span>
            {isExpanded ? <X className="ml-auto" /> : <ChevronRight className="ml-2" />}
          </div>
        </Button>
      </div>

      {isExpanded && (
        <ScrollArea className="max-w-full block">
          <div className="p-4 max-w-[100%-5rem]">
            {logs.map((log) => (
              <div
                key={log.id}
                className={`mb-2 p-2 rounded text-sm max-w-full  overflow-hidden ${
                  log.level === "ERROR"
                    ? "bg-red-500/10"
                    : log.level === "WARN"
                    ? "bg-yellow-500/10"
                    : "bg-muted"
                }`}
              >
                <div className="flex justify-between">
                  <span className="font-mono">{new Date(log.timestamp).toLocaleTimeString()}</span>
                  <span className="font-semibold">{log.level}</span>
                </div>
                <p className="max-w-full text-wrap">{log.message}</p>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </motion.div>
  )
} 