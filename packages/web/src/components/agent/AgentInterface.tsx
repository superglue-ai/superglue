'use client'

import { useConfig } from '@/src/app/config-context'
import { Button } from '@/src/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card'
import { ScrollArea } from '@/src/components/ui/scroll-area'
import { Separator } from '@/src/components/ui/separator'
import { Textarea } from '@/src/components/ui/textarea'
import { useToast } from '@/src/hooks/use-toast'
import { cn } from '@/src/lib/utils'
import { AlertCircle, Bot, Check, Edit2, Loader2, Send, Trash2, User, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { handleCopyCode, parseMarkdownContent } from '../../lib/markdown-utils'
import { ToolCallComponent } from './ToolCallComponent'

const MAX_MESSAGE_LENGTH = 50000

export interface Message {
    id: string
    content: string
    role: 'user' | 'assistant'
    timestamp: Date
    tools?: ToolCall[]
    isStreaming?: boolean
}

export interface ToolCall {
    id: string
    name: string
    input?: any
    output?: any
    status: 'pending' | 'running' | 'completed' | 'error'
    error?: string
    startTime?: Date
    endTime?: Date
}

export function AgentInterface() {
    const config = useConfig()
    const [messages, setMessages] = useState<Message[]>([
        {
            id: '1',
            content: '',
            role: 'assistant',
            timestamp: new Date(),
        }
    ])
    const [input, setInput] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
    const [editingContent, setEditingContent] = useState('')
    const scrollAreaRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const editRef = useRef<HTMLTextAreaElement>(null)
    const { toast } = useToast()
    const messagesContainerRef = useRef<HTMLDivElement>(null)
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

    // Add useEffect for copy button functionality
    useEffect(() => {
        const handleClick = (e: Event) => {
            const target = e.target as HTMLElement
            const btn = target.closest('.copy-code-btn') as HTMLButtonElement
            if (btn?.dataset.code && !btn.disabled) {
                e.preventDefault()
                handleCopyCode(btn.dataset.code, toast)
            }
        }

        document.addEventListener('click', handleClick)
        return () => document.removeEventListener('click', handleClick)
    }, [toast])

    const handleEditMessage = (messageId: string, content: string) => {
        setEditingMessageId(messageId)
        setEditingContent(content)
    }

    const handleSaveEdit = async (messageId: string) => {
        if (!editingContent.trim()) return

        // Find the message index
        const messageIndex = messages.findIndex(m => m.id === messageId)
        if (messageIndex === -1) return

        // Update the message content
        const updatedMessages = [...messages]
        updatedMessages[messageIndex] = {
            ...updatedMessages[messageIndex],
            content: editingContent.trim(),
            timestamp: new Date(), // Update timestamp for edited message
        }

        // Truncate all messages after the edited message
        const truncatedMessages = updatedMessages.slice(0, messageIndex + 1)

        setMessages(truncatedMessages)
        setEditingMessageId(null)
        setEditingContent('')
        setIsLoading(true)

        // Create new assistant message placeholder
        const assistantMessage: Message = {
            id: Date.now().toString(),
            content: '',
            role: 'assistant',
            timestamp: new Date(),
            tools: [],
            isStreaming: true,
        }

        setMessages(prev => [...prev, assistantMessage])

        // Restart conversation from edited message
        try {
            const response = await fetch('/api/agent/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.superglueApiKey}`,
                },
                body: JSON.stringify({
                    messages: truncatedMessages.map(m => ({
                        role: m.role,
                        content: m.content
                    })),
                    stream: true
                }),
            })

            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('Authentication failed. Please check your API key configuration.')
                }
                throw new Error(`HTTP error! status: ${response.status}`)
            }

            if (!response.body) {
                throw new Error('No response body')
            }

            const reader = response.body.getReader()
            const decoder = new TextDecoder()

            // Same streaming logic as handleSendMessage
            try {
                while (true) {
                    const { done, value } = await reader.read()
                    if (done) break

                    const chunk = decoder.decode(value)
                    const lines = chunk.split('\n')

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.slice(6))

                                setMessages(prev => prev.map(msg => {
                                    if (msg.id !== assistantMessage.id) return msg

                                    switch (data.type) {
                                        case 'content':
                                            return {
                                                ...msg,
                                                content: msg.content + data.content
                                            }

                                        case 'tool_call_start':
                                            const existingToolIndex = msg.tools?.findIndex(t => t.id === data.toolCall.id)
                                            const newTool: ToolCall = {
                                                id: data.toolCall.id,
                                                name: data.toolCall.name,
                                                input: data.toolCall.input,
                                                status: data.toolCall.input ? 'running' : 'pending',
                                                startTime: new Date()
                                            }

                                            if (existingToolIndex !== undefined && existingToolIndex >= 0) {
                                                const updatedTools = [...(msg.tools || [])]
                                                updatedTools[existingToolIndex] = newTool
                                                return { ...msg, tools: updatedTools }
                                            } else {
                                                return {
                                                    ...msg,
                                                    tools: [...(msg.tools || []), newTool]
                                                }
                                            }

                                        case 'tool_call_complete':
                                            return {
                                                ...msg,
                                                tools: msg.tools?.map(tool =>
                                                    tool.id === data.toolCall.id
                                                        ? {
                                                            ...tool,
                                                            status: 'completed' as const,
                                                            output: data.toolCall.output,
                                                            endTime: new Date()
                                                        }
                                                        : tool
                                                ) || []
                                            }

                                        case 'tool_call_error':
                                            return {
                                                ...msg,
                                                tools: msg.tools?.map(tool =>
                                                    tool.id === data.toolCall.id
                                                        ? {
                                                            ...tool,
                                                            status: 'error' as const,
                                                            error: data.toolCall.error,
                                                            endTime: new Date()
                                                        }
                                                        : tool
                                                ) || []
                                            }

                                        case 'done':
                                            return {
                                                ...msg,
                                                isStreaming: false,
                                                tools: msg.tools?.map(tool =>
                                                    tool.status === 'running' || tool.status === 'pending'
                                                        ? {
                                                            ...tool,
                                                            status: 'completed' as const,
                                                            endTime: tool.endTime || new Date()
                                                        }
                                                        : tool
                                                ) || []
                                            }

                                        case 'error':
                                            return {
                                                ...msg,
                                                content: msg.content + '\n\n❌ ' + data.content,
                                                isStreaming: false
                                            }

                                        default:
                                            return msg
                                    }
                                }))
                            } catch (parseError) {
                                console.warn('Failed to parse SSE data:', parseError)
                            }
                        }
                    }
                }
            } finally {
                reader.releaseLock()
            }

        } catch (error) {
            console.error('Error re-running conversation:', error)

            toast({
                title: 'Error',
                description: 'Failed to restart conversation from edited message.',
                variant: 'destructive',
            })

            // Update assistant message with error
            setMessages(prev => prev.map(msg =>
                msg.id === assistantMessage.id
                    ? {
                        ...msg,
                        content: 'Sorry, I encountered an error restarting the conversation. Please try again.',
                        isStreaming: false
                    }
                    : msg
            ))
        } finally {
            setIsLoading(false)
        }
    }

    const handleCancelEdit = () => {
        setEditingMessageId(null)
        setEditingContent('')
    }

    // Auto-resize edit textarea
    useEffect(() => {
        if (editRef.current) {
            editRef.current.style.height = 'auto'
            editRef.current.style.height = `${Math.min(editRef.current.scrollHeight, 120)}px`
        }
    }, [editingContent])

    const handleSendMessage = async () => {
        if (!input.trim() || isLoading || !hasApiKey) return

        const userMessage: Message = {
            id: Date.now().toString(),
            content: input.trim(),
            role: 'user',
            timestamp: new Date(),
        }

        setMessages(prev => [...prev, userMessage])
        const currentInput = input.trim()
        setInput('')
        setIsLoading(true)

        // Create assistant message placeholder
        const assistantMessage: Message = {
            id: (Date.now() + 1).toString(),
            content: '',
            role: 'assistant',
            timestamp: new Date(),
            tools: [],
            isStreaming: true,
        }

        setMessages(prev => [...prev, assistantMessage])

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
                    })), { role: 'user', content: currentInput }],
                    stream: true
                }),
            })

            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('Authentication failed. Please check your API key configuration.')
                }
                throw new Error(`HTTP error! status: ${response.status}`)
            }

            if (!response.body) {
                throw new Error('No response body')
            }

            const reader = response.body.getReader()
            const decoder = new TextDecoder()

            try {
                while (true) {
                    const { done, value } = await reader.read()
                    if (done) break

                    const chunk = decoder.decode(value)
                    const lines = chunk.split('\n')

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.slice(6))

                                setMessages(prev => prev.map(msg => {
                                    if (msg.id !== assistantMessage.id) return msg

                                    switch (data.type) {
                                        case 'content':
                                            return {
                                                ...msg,
                                                content: msg.content + data.content
                                            }

                                        case 'tool_call_start':
                                            const existingToolIndex = msg.tools?.findIndex(t => t.id === data.toolCall.id)
                                            const newTool: ToolCall = {
                                                id: data.toolCall.id,
                                                name: data.toolCall.name,
                                                input: data.toolCall.input,
                                                status: data.toolCall.input ? 'running' : 'pending',
                                                startTime: new Date()
                                            }

                                            if (existingToolIndex !== undefined && existingToolIndex >= 0) {
                                                const updatedTools = [...(msg.tools || [])]
                                                updatedTools[existingToolIndex] = newTool
                                                return { ...msg, tools: updatedTools }
                                            } else {
                                                return {
                                                    ...msg,
                                                    tools: [...(msg.tools || []), newTool]
                                                }
                                            }

                                        case 'tool_call_complete':
                                            return {
                                                ...msg,
                                                tools: msg.tools?.map(tool =>
                                                    tool.id === data.toolCall.id
                                                        ? {
                                                            ...tool,
                                                            status: 'completed' as const,
                                                            output: data.toolCall.output,
                                                            endTime: new Date()
                                                        }
                                                        : tool
                                                ) || []
                                            }

                                        case 'tool_call_error':
                                            return {
                                                ...msg,
                                                tools: msg.tools?.map(tool =>
                                                    tool.id === data.toolCall.id
                                                        ? {
                                                            ...tool,
                                                            status: 'error' as const,
                                                            error: data.toolCall.error,
                                                            endTime: new Date()
                                                        }
                                                        : tool
                                                ) || []
                                            }

                                        case 'done':
                                            return {
                                                ...msg,
                                                isStreaming: false,
                                                // Update any remaining tool calls to completed status
                                                tools: msg.tools?.map(tool =>
                                                    tool.status === 'running' || tool.status === 'pending'
                                                        ? {
                                                            ...tool,
                                                            status: 'completed' as const,
                                                            endTime: tool.endTime || new Date()
                                                        }
                                                        : tool
                                                ) || []
                                            }

                                        case 'error':
                                            return {
                                                ...msg,
                                                content: msg.content + '\n\n❌ ' + data.content,
                                                isStreaming: false
                                            }

                                        default:
                                            return msg
                                    }
                                }))
                            } catch (parseError) {
                                console.warn('Failed to parse SSE data:', parseError)
                            }
                        }
                    }
                }
            } finally {
                reader.releaseLock()
            }

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

            // Update assistant message with error
            setMessages(prev => prev.map(msg =>
                msg.id === assistantMessage.id
                    ? {
                        ...msg,
                        content: error instanceof Error && error.message.includes('Authentication')
                            ? 'Sorry, there was an authentication error. Please check your API key configuration and try again.'
                            : 'Sorry, I encountered an error processing your request. Please try again.',
                        isStreaming: false
                    }
                    : msg
            ))
        } finally {
            setIsLoading(false)
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
            content: '',
            role: 'assistant',
            timestamp: new Date(),
        }])
    }

    const formatTimestamp = (date: Date) => {
        return date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        })
    }

    const startExamplePrompt = (prompt: string) => {
        setInput(prompt)
        // Automatically send the message after a short delay to allow user to see it
        setTimeout(() => {
            if (!isLoading && hasApiKey) {
                handleSendMessage()
            }
        }, 100)
    }

    const renderWelcomeInterface = () => (
        <div className="space-y-6 p-6">
            <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                    <Bot className="w-8 h-8 text-primary" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-foreground">Welcome to Superglue</h2>
                    <p className="text-muted-foreground mt-2">
                        Build powerful workflows in seconds
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">
                <Card className="p-4 hover:bg-muted/30 transition-colors cursor-pointer border-2 hover:border-primary/20"
                    onClick={() => startExamplePrompt("Show me all available tools and what they can do")}>
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Bot className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="space-y-1">
                            <h3 className="font-semibold text-sm">Explore Available Tools</h3>
                            <p className="text-xs text-muted-foreground">See what integrations and automations are ready to use</p>
                        </div>
                    </div>
                </Card>

                <Card className="p-4 hover:bg-muted/30 transition-colors cursor-pointer border-2 hover:border-primary/20"
                    onClick={() => startExamplePrompt("Build a new integration to connect Stripe and HubSpot - sync customer data when payments are received")}>
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Send className="w-5 h-5 text-green-600 dark:text-green-400" />
                        </div>
                        <div className="space-y-1">
                            <h3 className="font-semibold text-sm">Build New Integration</h3>
                            <p className="text-xs text-muted-foreground">Create custom workflows between your favorite apps</p>
                        </div>
                    </div>
                </Card>

                <Card className="p-4 hover:bg-muted/30 transition-colors cursor-pointer border-2 hover:border-primary/20"
                    onClick={() => startExamplePrompt("Execute a one-time task: fetch all my HubSpot contacts and format them as a CSV")}>
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Loader2 className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                        </div>
                        <div className="space-y-1">
                            <h3 className="font-semibold text-sm">Run One-Time Task</h3>
                            <p className="text-xs text-muted-foreground">Execute data tasks without saving as permanent tools</p>
                        </div>
                    </div>
                </Card>

                <Card className="p-4 hover:bg-muted/30 transition-colors cursor-pointer border-2 hover:border-primary/20"
                    onClick={() => startExamplePrompt("Help me query my PostgreSQL database to find all orders from the last 30 days with customer details")}>
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                            <AlertCircle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                        </div>
                        <div className="space-y-1">
                            <h3 className="font-semibold text-sm">Database Queries</h3>
                            <p className="text-xs text-muted-foreground">Build complex database queries with natural language</p>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    )

    const renderMessage = (message: Message) => {
        // Show welcome interface for the first empty message
        if (message.id === '1' && !message.content) {
            return (
                <div key={message.id} className="w-full">
                    {renderWelcomeInterface()}
                </div>
            )
        }

        return (
            <div
                key={message.id}
                className={cn(
                    'flex gap-4 p-2 rounded-xl group',
                    message.role === 'user'
                        ? 'bg-primary/5 border border-primary/10'
                        : 'bg-muted/30 border border-muted'
                )}
            >
                <div className={cn(
                    'flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center shadow-sm',
                    message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background border-2 border-muted text-muted-foreground'
                )}>
                    {message.role === 'user' ? <User size={18} /> : <Bot size={18} />}
                </div>

                <div className="flex-1 space-y-3 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-base">
                            {message.role === 'user' ? 'You' : 'superglue'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                            {formatTimestamp(message.timestamp)}
                        </span>
                        {message.isStreaming && (
                            <div className="flex items-center gap-1">
                                <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">Thinking...</span>
                            </div>
                        )}
                        {message.role === 'user' && !isLoading && (
                            <Button
                                size="sm"
                                variant="ghost"
                                className="opacity-0 group-hover:opacity-100 transition-opacity h-6 px-2"
                                onClick={() => handleEditMessage(message.id, message.content)}
                            >
                                <Edit2 className="w-3 h-3" />
                            </Button>
                        )}
                    </div>

                    {message.tools && message.tools.length > 0 && (
                        <div className="space-y-3">
                            <div className="text-sm font-medium text-muted-foreground">Tool Usage</div>
                            {message.tools.map((tool) => (
                                <ToolCallComponent
                                    key={tool.id}
                                    tool={tool}
                                    onInputChange={(newInput) => {
                                        console.log('Input changed:', newInput)
                                    }}
                                />
                            ))}
                        </div>
                    )}

                    {editingMessageId === message.id ? (
                        <div className="space-y-2">
                            <Textarea
                                ref={editRef}
                                value={editingContent}
                                onChange={(e) => setEditingContent(e.target.value)}
                                className="min-h-[48px] max-h-[120px] resize-none text-sm leading-relaxed"
                                placeholder="Edit your message..."
                                autoFocus
                            />
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    onClick={() => handleSaveEdit(message.id)}
                                    disabled={!editingContent.trim() || isLoading}
                                >
                                    <Check className="w-3 h-3 mr-1" />
                                    Save & Restart
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={handleCancelEdit}
                                    disabled={isLoading}
                                >
                                    <X className="w-3 h-3 mr-1" />
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="prose prose-sm max-w-none dark:prose-invert" ref={messagesContainerRef}>
                            <div
                                dangerouslySetInnerHTML={{
                                    __html: parseMarkdownContent(message.content, message.isStreaming || false)
                                }}
                            />
                        </div>
                    )}
                </div>
            </div>
        )
    }

    // Show auth warning if no API key
    if (!hasApiKey) {
        return (
            <Card className="min-h-[80vh] max-w-4xl mx-auto flex flex-col">
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
        <Card className="min-h-[80vh] max-w-4xl mx-auto flex flex-col">
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
                    </div>
                </div>
            </CardHeader>

            <Separator />

            <CardContent className="flex-1 flex flex-col p-0">
                <ScrollArea ref={scrollAreaRef} className="flex-1 p-6">
                    <div className="space-y-4">
                        {messages.map(renderMessage)}
                    </div>
                </ScrollArea>

                <Separator />

                <div className="p-4 flex-shrink-0">
                    <div className="flex gap-3 items-end">
                        <div className="flex-1">
                            <Textarea
                                ref={inputRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Type your message here... (Shift+Enter for new line)"
                                className="min-h-[48px] max-h-[120px] resize-none text-sm leading-relaxed"
                                disabled={isLoading || !hasApiKey}
                            />
                            <div className="flex justify-between items-center mt-2 px-1">
                                <span className="text-xs text-muted-foreground">
                                    {input.length}/{MAX_MESSAGE_LENGTH}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    Press Enter to send • Shift+Enter for new line
                                </span>
                            </div>
                        </div>
                        <Button
                            onClick={handleSendMessage}
                            disabled={!input.trim() || isLoading || input.length > MAX_MESSAGE_LENGTH || !hasApiKey}
                            size="default"
                            className="h-12 px-6"
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
