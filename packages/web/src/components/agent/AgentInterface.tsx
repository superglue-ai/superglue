'use client'

import { useConfig } from '@/src/app/config-context'
import { Button } from '@/src/components/ui/button'
import { Card } from '@/src/components/ui/card'
import { ScrollArea } from '@/src/components/ui/scroll-area'
import { Textarea } from '@/src/components/ui/textarea'
import { useToast } from '@/src/hooks/use-toast'
import { cn } from '@/src/lib/utils'
import { Integration, SuperglueClient } from '@superglue/client'
import { Bot, Check, Edit2, Loader2, Plus, Send, Trash2, User, X, Zap } from 'lucide-react'
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
    const [integrations, setIntegrations] = useState<Integration[]>([])
    const [integrationsLoading, setIntegrationsLoading] = useState(false)
    const scrollAreaRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const editRef = useRef<HTMLTextAreaElement>(null)
    const { toast } = useToast()
    const messagesContainerRef = useRef<HTMLDivElement>(null)

    // Move fetchIntegrations here, outside useEffect
    const fetchIntegrations = async () => {
        setIntegrationsLoading(true)
        try {
            const client = new SuperglueClient({
                endpoint: config.superglueEndpoint,
                apiKey: config.superglueApiKey
            })

            const result = await client.listIntegrations(100, 0)
            setIntegrations(result.items)
        } catch (error) {
            console.error('Failed to fetch integrations:', error)
            toast({
                title: 'Warning',
                description: 'Could not load integrations. Some features may be limited.',
                variant: 'default',
            })
        } finally {
            setIntegrationsLoading(false)
        }
    }

    // Auto-scroll to bottom when messages change
    useEffect(() => {
        if (scrollAreaRef.current) {
            const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]')
            if (scrollContainer) {
                scrollContainer.scrollTop = scrollContainer.scrollHeight
            }
        }
    }, [messages])

    // Fetch integrations when component mounts
    useEffect(() => {
        fetchIntegrations()
    }, [config, toast])

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

    // Add this effect after the other useEffect hooks
    useEffect(() => {
        // Focus input when the last message is not streaming
        if (messages.length > 0 && !messages[messages.length - 1].isStreaming) {
            inputRef.current?.focus()
        }
    }, [messages])

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
            await processStreamData(reader, assistantMessage)
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
        if (!input.trim() || isLoading) return

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
            await processStreamData(reader, assistantMessage)
        } catch (error) {
            console.error('Error sending message:', error)
            toast({
                title: 'Error',
                description: error instanceof Error ? error.message : 'Failed to send message. Please try again.',
                variant: 'destructive',
            })
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

    const updateMessageWithData = (msg: Message, data: any, assistantMessage: Message) => {
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
    }

    const processStreamData = async (reader: ReadableStreamDefaultReader<Uint8Array>, assistantMessage: Message) => {
        const decoder = new TextDecoder()

        while (true) {
            const { done, value } = await reader.read()
            if (done) break

            const chunk = decoder.decode(value)
            const lines = chunk.split('\n')

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6))
                        setMessages(prev => prev.map(msg => updateMessageWithData(msg, data, assistantMessage)))

                        // Refresh integrations when query is done
                        if (data.type === 'done') {
                            fetchIntegrations()
                        }
                    } catch (parseError) {
                        console.warn('Failed to parse SSE data:', parseError)
                    }
                }
            }
        }
    }

    const startExamplePrompt = (prompt: string) => {
        if (!isLoading) {
            const userMessage: Message = {
                id: Date.now().toString(),
                content: prompt.trim(),
                role: 'user',
                timestamp: new Date(),
            }

            setMessages(prev => [...prev, userMessage])
            setInput('')
            setIsLoading(true)

            const assistantMessage: Message = {
                id: (Date.now() + 1).toString(),
                content: '',
                role: 'assistant',
                timestamp: new Date(),
                tools: [],
                isStreaming: true,
            }

            setMessages(prev => [...prev, assistantMessage])

            fetch('/api/agent/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.superglueApiKey}`,
                },
                body: JSON.stringify({
                    messages: [...messages.map(m => ({
                        role: m.role,
                        content: m.content
                    })), { role: 'user', content: prompt.trim() }],
                    stream: true
                }),
            })
                .then(async response => {
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
                    await processStreamData(reader, assistantMessage)
                })
                .catch(error => {
                    console.error('Error sending message:', error)
                    toast({
                        title: 'Error',
                        description: error instanceof Error ? error.message : 'Failed to send message. Please try again.',
                        variant: 'destructive',
                    })
                })
                .finally(() => {
                    setIsLoading(false)
                })
        }
    }

    const renderWelcomeInterface = () => {
        // Only show welcome interface if there are no messages or only the initial empty message
        if (messages.length > 1 || (messages.length === 1 && messages[0].content)) {
            return null;
        }

        return (
            <div className="space-y-6 p-6">
                <div className="text-center space-y-4">
                    <div>
                        <h2 className="text-2xl font-bold text-foreground">Welcome to Superglue</h2>
                        <p className="text-muted-foreground mt-2">
                            Build powerful workflows in seconds
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mx-auto">
                    <Card className="p-4 hover:bg-muted/30 transition-colors cursor-pointer border-2 hover:border-primary/20"
                        onClick={() => startExamplePrompt("Get all products from timbuk2.com/products.json with pagination. This is a public endpoint.")}>
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                                <Bot className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div className="space-y-1">
                                <h3 className="font-semibold text-sm">Fetch Products Example</h3>
                                <p className="text-xs text-muted-foreground">Get all products from Timbuk2 with automatic pagination</p>
                            </div>
                        </div>
                    </Card>

                    <Card className="p-4 hover:bg-muted/30 transition-colors cursor-pointer border-2 hover:border-primary/20"
                        onClick={() => startExamplePrompt("Find the most popular LEGO themes by number of sets.\n\nDatabase connection: postgres://superglue:superglue@database-1.c01e6ms2cdvl.us-east-1.rds.amazonaws.com:5432/lego")}>
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                                <Send className="w-5 h-5 text-green-600 dark:text-green-400" />
                            </div>
                            <div className="space-y-1">
                                <h3 className="font-semibold text-sm">Postgres Query Example</h3>
                                <p className="text-xs text-muted-foreground">Analyze LEGO themes and sets in a database</p>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        );
    };

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
                    'flex gap-4 p-2 pt-4 rounded-xl group',
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
                    {message.role === 'user' && <User size={18} />}
                    {message.role === 'assistant' && <Bot size={18} />}
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


    return (
        <div className="h-[calc(100vh-3rem)] mx-auto flex flex-col relative">
            {(messages.length > 1 || (messages.length === 1 && messages[0].content)) && (
                <Button variant="outline" size="sm" className="w-32 fixed top-2 right-16" onClick={clearMessages}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Clear
                </Button>
            )}

            <ScrollArea ref={scrollAreaRef} className="flex-1 p-6">
                <div className="space-y-2">
                    {messages.map(renderMessage)}
                </div>
            </ScrollArea>

            <div className="sticky bottom-0 left-0 right-0 bg-background border-t">
                <div className="mx-auto p-4">
                    {/* Available Integrations Section */}
                    {integrations.length > 0 && (
                        <div className="space-y-4 mb-4 mx-auto">
                            <div className="flex flex-row overflow-x-auto gap-3 mx-auto pb-2">
                                <div className="flex gap-3 mx-auto">
                                    {integrations.map((integration) => (
                                        <Card key={integration.id} className="p-3 min-w-[220px] hover:bg-muted/30 transition-colors cursor-pointer border hover:border-primary/20"
                                            onClick={() => startExamplePrompt(`Use the ${integration.name || integration.id} integration (ID: ${integration.id}) to help me with my task`)}>
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-md flex items-center justify-center flex-shrink-0">
                                                    <Zap className="w-4 h-4 text-green-600 dark:text-green-400" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-medium text-sm truncate">{integration.name || integration.id}</h4>
                                                    <p className="text-xs text-muted-foreground truncate">{integration.urlHost}</p>
                                                </div>
                                            </div>
                                        </Card>
                                    ))}
                                    <Card
                                        className="p-3 min-w-[220px] flex items-center justify-center hover:bg-muted/30 transition-colors cursor-pointer border hover:border-primary/20"
                                        onClick={() => startExamplePrompt("Add a new integration to connect my app")}
                                    >
                                        <div className="flex flex-row items-center gap-2 justify-center w-full">
                                            <Plus className="w-4 h-4 text-primary" />
                                            <span className="font-medium text-sm">Add New Integration</span>
                                        </div>
                                    </Card>
                                </div>
                            </div>
                        </div>
                    )}

                    {integrationsLoading && (
                        <div className="flex items-center justify-center py-4">
                            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mr-2" />
                            <span className="text-sm text-muted-foreground">Loading integrations...</span>
                        </div>
                    )}

                    <div className="flex gap-3 items-start max-w-4xl mx-auto">
                        <div className="flex-1">
                            <Textarea
                                ref={inputRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Type your message here... (Shift+Enter for new line)"
                                className="min-h-[48px] max-h-[120px] resize-none text-sm leading-relaxed"
                                disabled={isLoading}
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
                            disabled={!input.trim() || isLoading || input.length > MAX_MESSAGE_LENGTH}
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
            </div>
        </div>
    )
}
