"use client"
import { useState, useEffect, useMemo } from "react"
import { motion } from "framer-motion"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { LogEntry } from "@superglue/shared"
import { Button } from "./ui/button"
import { ScrollArea } from "./ui/scroll-area"
import { ApolloClient, gql, InMemoryCache, useSubscription } from "@apollo/client"
import { GraphQLWsLink } from '@apollo/client/link/subscriptions'
import { createClient } from 'graphql-ws'
import { useConfig } from "../app/config-context"

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
      url: config.superglueEndpoint?.replace('https', 'ws')?.replace('http', 'ws') || 'ws://localhost:3000/graphql',
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
      console.error('Subscription error:', error)
    },
    onData: ({ data }) => {
      console.log('Subscription data:', data)
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

  // Reset notification when expanding
  useEffect(() => {
    if (isExpanded) {
      setHasNewLogs(false)
    }
  }, [isExpanded]);

  return (
    <motion.div
      animate={{ width: isExpanded ? 400 : 50 }}
      onAnimationComplete={(definition) => {
        // Update CSS variable when animation completes
        document.documentElement.style.setProperty('--log-sidebar-width', `${typeof definition === 'object' && 'width' in definition ? definition.width : isExpanded ? 400 : 50}px`)
      }}
      className="border-l border-border bg-background flex flex-col relative"
    >
      <Button
        variant="ghost"
        size="icon"
        className="h-10 w-10 flex items-center justify-center"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? <ChevronRight /> : <ChevronLeft />}
        {!isExpanded && hasNewLogs && (
          <div className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full" />
        )}
      </Button>

      {isExpanded ? (
        <ScrollArea className="flex-1">
          <div className="p-4">
            {logs.map((log) => (
              <div
                key={log.id}
                className={`mb-2 p-2 rounded text-sm ${
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
                <p>{log.message}</p>
              </div>
            ))}
          </div>
        </ScrollArea>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <span className="-rotate-90 text-sm text-muted-foreground">Logs</span>
        </div>
      )}
    </motion.div>
  )
} 