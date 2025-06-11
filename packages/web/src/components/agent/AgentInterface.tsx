'use client'

import { useConfig } from '@/src/app/config-context'
import { Badge } from '@/src/components/ui/badge'
import { Button } from '@/src/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card'
import { ScrollArea } from '@/src/components/ui/scroll-area'
import { Separator } from '@/src/components/ui/separator'
import { Textarea } from '@/src/components/ui/textarea'
import { useToast } from '@/src/hooks/use-toast'
import { cn } from '@/src/lib/utils'
import { AlertCircle, Bot, Loader2, Send, Settings, Trash2, User } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

interface Message {
    id: string
    content: string
    role: 'user' | 'assistant'
    timestamp: Date
    tools?: ToolCall[]
    isStreaming?: boolean
}

interface ToolCall {
    id: string
    name: string
    input: any
    output?: any
    status: 'pending' | 'completed' | 'error'
    error?: string
}

const MAX_MESSAGE_LENGTH = 4000
const TYPING_DELAY = 20

export function AgentInterface() {
    const config = useConfig()
    const [messages, setMessages] = useState<Message[]>([
        {
            id: '1',
            content: 'Hello! I\'m your AI assistant with access to Superglue MCP tools. I can help you with API integrations, data transformations, and much more. What would you like to work on today?',
            role: 'assistant',
            timestamp: new Date(),
        }
    ])
    const [input, setInput] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [isTyping, setIsTyping] = useState(false)
    const scrollAreaRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const { toast } = useToast()

    // Check if API key is available
    const hasApiKey = config?.superglueApiKey && config.superglueApiKey.trim() !== ''

    // Auto-scroll to bottom when messages change
    useEffect(() => {
        if (scrollAreaRef.current) {
            const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]')
            if (scrollContainer) {
                scrollContainer.scrollTop = scrollContainer.scrollHeight
            }
        }
    }, [messages])

    // Auto-resize textarea
    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.style.height = 'auto'
            inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`
        }
    }, [input])

    const handleSendMessage = async () => {
        if (!input.trim() || isLoading || !hasApiKey) return

        const userMessage: Message = {
            id: Date.now().toString(),
            content: input.trim(),
            role: 'user',
            timestamp: new Date(),
        }

        setMessages(prev => [...prev, userMessage])
        setInput('')
        setIsLoading(true)
        setIsTyping(true)

        try {
            const response = await fetch('/api/agent/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.superglueApiKey}`,
                },
                body: JSON.stringify({
                    messages: [...messages.map(m => ({
                        role: m.role,
                        content: m.content
                    })), { role: 'user', content: input.trim() }],
                }),
            })

            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('Authentication failed. Please check your API key configuration.')
                }
                throw new Error(`HTTP error! status: ${response.status}`)
            }

            const data = await response.json()

            // Simulate typing effect
            const assistantMessage: Message = {
                id: (Date.now() + 1).toString(),
                content: '',
                role: 'assistant',
                timestamp: new Date(),
                tools: data.toolCalls,
                isStreaming: true,
            }

            setMessages(prev => [...prev, assistantMessage])
            setIsTyping(false)

            // Simulate streaming response
            const fullContent = data.content
            let currentContent = ''

            for (let i = 0; i < fullContent.length; i++) {
                currentContent += fullContent[i]

                setMessages(prev => prev.map(msg =>
                    msg.id === assistantMessage.id
                        ? { ...msg, content: currentContent }
                        : msg
                ))

                await new Promise(resolve => setTimeout(resolve, TYPING_DELAY))
            }

            // Mark streaming as complete
            setMessages(prev => prev.map(msg =>
                msg.id === assistantMessage.id
                    ? { ...msg, isStreaming: false }
                    : msg
            ))

        } catch (error) {
            console.error('Error sending message:', error)

            const errorTitle = error instanceof Error && error.message.includes('Authentication')
                ? 'Authentication Error'
                : 'Error'

            const errorDescription = error instanceof Error
                ? error.message
                : 'Failed to send message. Please try again.'

            toast({
                title: errorTitle,
                description: errorDescription,
                variant: 'destructive',
            })

            // Add error message
            const errorMessage: Message = {
                id: (Date.now() + 1).toString(),
                content: error instanceof Error && error.message.includes('Authentication')
                    ? 'Sorry, there was an authentication error. Please check your API key configuration and try again.'
                    : 'Sorry, I encountered an error processing your request. Please try again.',
                role: 'assistant',
                timestamp: new Date(),
            }
            setMessages(prev => [...prev, errorMessage])
        } finally {
            setIsLoading(false)
            setIsTyping(false)
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSendMessage()
        }
    }

    const clearMessages = () => {
        setMessages([{
            id: '1',
            content: 'Hello! I\'m your AI assistant with access to Superglue MCP tools. I can help you with API integrations, data transformations, and much more. What would you like to work on today?',
            role: 'assistant',
            timestamp: new Date(),
        }])
    }

    const formatTimestamp = (date: Date) => {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    const renderMessage = (message: Message) => (
        <div
            key={message.id}
            className={cn(
                'flex gap-3 p-4 rounded-lg',
                message.role === 'user'
                    ? 'bg-primary/5 ml-12'
                    : 'bg-muted/50 mr-12'
            )}
        >
            <div className={cn(
                'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
                message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
            )}>
                {message.role === 'user' ? <User size={16} /> : <Bot size={16} />}
            </div>

            <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">
                        {message.role === 'user' ? 'You' : 'Assistant'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                        {formatTimestamp(message.timestamp)}
                    </span>
                    {message.isStreaming && (
                        <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                    )}
                </div>

                {message.tools && message.tools.length > 0 && (
                    <div className="space-y-2">
                        <div className="text-sm text-muted-foreground">Tool calls:</div>
                        {message.tools.map((tool) => (
                            <div key={tool.id} className="flex items-center gap-2 text-sm">
                                <Badge variant={
                                    tool.status === 'completed' ? 'default' :
                                        tool.status === 'error' ? 'destructive' :
                                            'secondary'
                                }>
                                    {tool.name}
                                </Badge>
                                {tool.status === 'pending' && (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                )}
                                {tool.status === 'error' && tool.error && (
                                    <span className="text-destructive text-xs">
                                        {tool.error}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                <div className="prose prose-sm max-w-none dark:prose-invert">
                    <pre className="whitespace-pre-wrap text-sm">{message.content}</pre>
                </div>
            </div>
        </div>
    )

    // Show auth warning if no API key
    if (!hasApiKey) {
        return (
            <Card className="h-[80vh] max-w-4xl mx-auto flex flex-col">
                <CardHeader className="flex-shrink-0">
                    <CardTitle className="flex items-center gap-2">
                        <Bot className="w-5 h-5" />
                        Superglue Agent
                    </CardTitle>
                </CardHeader>
                <Separator />
                <CardContent className="flex-1 flex items-center justify-center">
                    <div className="text-center space-y-4 max-w-md">
                        <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto" />
                        <h3 className="text-lg font-semibold">API Key Required</h3>
                        <p className="text-muted-foreground">
                            Please configure your Superglue API key to use the agent interface.
                            Check your environment configuration or contact your administrator.
                        </p>
                        <div className="text-sm text-muted-foreground">
                            Required environment variable: <code className="bg-muted px-2 py-1 rounded">NEXT_PUBLIC_SUPERGLUE_API_KEY</code> or <code className="bg-muted px-2 py-1 rounded">AUTH_TOKEN</code>
                        </div>
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card className="h-[80vh] max-w-4xl mx-auto flex flex-col">
            <CardHeader className="flex-shrink-0">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <Bot className="w-5 h-5" />
                            Superglue Agent
                        </CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={clearMessages}>
                            <Trash2 className="w-4 h-4 mr-2" />
                            Clear
                        </Button>
                        <Button variant="outline" size="sm">
                            <Settings className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            </CardHeader>

            <Separator />

            <CardContent className="flex-1 flex flex-col p-0">
                <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
                    <div className="space-y-4">
                        {messages.map(renderMessage)}
                        {isTyping && (
                            <div className="flex gap-3 p-4 rounded-lg bg-muted/50 mr-12">
                                <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-muted text-muted-foreground">
                                    <Bot size={16} />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="font-medium text-sm">Assistant</span>
                                        <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                                    </div>
                                    <div className="flex gap-1">
                                        <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                        <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                        <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </ScrollArea>

                <Separator />

                <div className="p-4 flex-shrink-0">
                    <div className="flex gap-2 items-end">
                        <div className="flex-1">
                            <Textarea
                                ref={inputRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Type your message here... (Shift+Enter for new line)"
                                className="min-h-[44px] max-h-[120px] resize-none"
                                disabled={isLoading || !hasApiKey}
                            />
                            <div className="flex justify-between items-center mt-1 px-1">
                                <span className="text-xs text-muted-foreground">
                                    {input.length}/{MAX_MESSAGE_LENGTH}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    Press Enter to send
                                </span>
                            </div>
                        </div>
                        <Button
                            onClick={handleSendMessage}
                            disabled={!input.trim() || isLoading || input.length > MAX_MESSAGE_LENGTH || !hasApiKey}
                            size="sm"
                            className="h-11"
                        >
                            {isLoading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Send className="w-4 h-4" />
                            )}
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
