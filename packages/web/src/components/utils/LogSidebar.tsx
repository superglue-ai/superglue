"use client"
import { ApolloClient, gql, InMemoryCache, useSubscription } from "@apollo/client";
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { motion } from "framer-motion";
import { createClient } from 'graphql-ws';
import { ChevronRight, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useConfig } from "../../app/config-context";
import { tokenRegistry } from "../../lib/token-registry";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { Switch } from "../ui/switch";
import { useToken } from "@/src/hooks/use-token";

export interface LogEntry {
  id: string;
  message: string;
  level: string;
  timestamp: Date;
  runId?: string;
  orgId?: string;
}

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

const LOG_MIN_WIDTH = 300
const LOG_MAX_WIDTH = 1500
const LOG_COLLAPSED_WIDTH = 50

export function LogSidebar() {
  const [isExpanded, setIsExpanded] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [hasNewLogs, setHasNewLogs] = useState(false)
  const [transitionDuration, setTransitionDuration] = useState(0.3)
  const [logViewWidth, setLogViewWidth] = useState(LOG_MIN_WIDTH)
  const resizingWidthRef = useRef(logViewWidth)
  const logViewRef = useRef<HTMLDivElement | null>(null)
  const [showDebug, setShowDebug] = useState(false)
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set())
  const config = useConfig();
  const token = useToken();

  const client = useMemo(() => {
    const wsLink = new GraphQLWsLink(createClient({
      url: config.superglueEndpoint?.replace('https', 'wss')?.replace('http', 'ws') || 'ws://localhost:3000/graphql',
      connectionParams: {
        Authorization: `Bearer ${tokenRegistry.getToken()}`
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
  }, [config.superglueEndpoint, token])

  const filteredLogs = useMemo(
    () => showDebug ? logs : logs.filter(log => log.level !== "DEBUG"),
    [logs, showDebug]
  )

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

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setTransitionDuration(0)
    const startX = e.clientX
    const startWidth = resizingWidthRef.current

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX
      let newWidth = startWidth + delta
      newWidth = Math.min(LOG_MAX_WIDTH, Math.max(LOG_MIN_WIDTH, newWidth))

      resizingWidthRef.current = newWidth
      if (logViewRef.current) {
        logViewRef.current.style.width = `${newWidth}px`
      }
    }

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      setLogViewWidth(resizingWidthRef.current)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }
  return (
    <motion.div
      ref={logViewRef}
      animate={{ width: isExpanded ? Math.max(logViewWidth, LOG_MIN_WIDTH) : LOG_COLLAPSED_WIDTH }}
      transition={{ duration: transitionDuration }}
      className="border-l border-border bg-background flex flex-col relative overflow-hidden h-full"
    >
      <div className={`m-2 max-w-full ${isExpanded ? 'h-12' : 'h-24'}`}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setIsExpanded(!isExpanded)
            setTransitionDuration(0.3)
          }}
          className="h-full w-full flex items-center justify-center"
        >
          <div className={`flex items-center justify-center w-full ${!isExpanded && '-rotate-90'}`}>
            <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              {hasNewLogs && !isExpanded && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: '#FFA500' }} />
                  <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: '#FFA500' }} />
                </span>
              )}
              Logs
            </span>
            {isExpanded ? <X className="ml-auto" /> : <ChevronRight className="ml-2" />}
          </div>
        </Button>
      </div>

      {isExpanded && (
        <>

          <ScrollArea className="max-w-full block flex-1 h-full">
            <div className="p-4 max-w-[100%-5rem]">
              {filteredLogs.map((log) => {
                const isLogExpanded = expandedLogs.has(log.id)
                const shouldTruncate = log.message.length > 100
                const displayMessage = shouldTruncate && !isLogExpanded
                  ? log.message.slice(0, 100) + '...'
                  : log.message

                return (
                  <div
                    key={log.id}
                    className={`mb-2 p-2 rounded text-sm max-w-full  overflow-hidden ${log.level === "ERROR"
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
                    <p className="max-w-full break-words">{displayMessage}</p>
                    {shouldTruncate && (
                      <button
                        onClick={() => {
                          setExpandedLogs(prev => {
                            const newSet = new Set(prev)
                            if (isLogExpanded) {
                              newSet.delete(log.id)
                            } else {
                              newSet.add(log.id)
                            }
                            return newSet
                          })
                        }}
                        className="text-xs text-muted-foreground hover:text-foreground mt-1"
                      >
                        {isLogExpanded ? 'Show less' : 'Show more'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </ScrollArea>
          <div
            onMouseDown={handleMouseDown}
            className="absolute left-0 top-0 h-full w-2 cursor-col-resize bg-transparent border-none outline-none"
          />
          <div className="absolute bottom-4 right-4 flex items-center gap-2 z-10">
            <span className="text-xs text-muted-foreground">Show Debug</span>
            <Switch className="custom-switch" checked={showDebug} onCheckedChange={setShowDebug} />
          </div>
        </>
      )}
    </motion.div>
  )
} 