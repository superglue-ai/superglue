'use client'

import { Button } from '@/src/components/ui/button'
import { Card } from '@/src/components/ui/card'
import { ScrollArea } from '@/src/components/ui/scroll-area'
import { cn } from '@/src/lib/utils'
import { History, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'

const MAX_CONVERSATIONS = 20

export interface Message {
    id: string
    content: string
    role: 'user' | 'assistant'
    timestamp: Date
    tools?: any[]
    isStreaming?: boolean
}

export interface Conversation {
    id: string
    title: string
    messages: Message[]
    timestamp: Date
}

// Cookie utility functions
const getCookie = (name: string): string | null => {
    if (typeof document === 'undefined') return null
    const value = `; ${document.cookie}`
    const parts = value.split(`; ${name}=`)
    if (parts.length === 2) return parts.pop()?.split(';').shift() || null
    return null
}

const setCookie = (name: string, value: string, days: number = 30) => {
    if (typeof document === 'undefined') return
    const expires = new Date()
    expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000)
    document.cookie = `${name}=${value}; expires=${expires.toUTCString()}; path=/`
}

const saveConversationsToStorage = (conversations: Conversation[]) => {
    try {
        // Keep only the most recent conversations
        const recentConversations = conversations
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, MAX_CONVERSATIONS)

        setCookie('superglue_conversations', JSON.stringify(recentConversations))
    } catch (error) {
        console.error('Failed to save conversations:', error)
    }
}

const loadConversationsFromStorage = (): Conversation[] => {
    try {
        const stored = getCookie('superglue_conversations')
        if (!stored) return []

        const parsed = JSON.parse(stored)
        return parsed.map((conv: any) => ({
            ...conv,
            timestamp: new Date(conv.timestamp),
            messages: conv.messages.map((msg: any) => ({
                ...msg,
                timestamp: new Date(msg.timestamp),
                startTime: msg.startTime ? new Date(msg.startTime) : undefined,
                endTime: msg.endTime ? new Date(msg.endTime) : undefined,
            }))
        }))
    } catch (error) {
        console.error('Failed to load conversations:', error)
        return []
    }
}

const generateConversationTitle = (messages: Message[]): string => {
    const firstUserMessage = messages.find(m => m.role === 'user' && m.content.trim())
    if (firstUserMessage) {
        const content = firstUserMessage.content.trim()
        return content.length > 50 ? content.substring(0, 50) + '...' : content
    }
    return `Conversation ${new Date().toLocaleDateString()}`
}

interface ConversationHistoryProps {
    messages: Message[]
    currentConversationId: string | null
    onConversationLoad: (conversation: Conversation) => void
    onNewConversation: () => void
    onCurrentConversationIdChange: (id: string | null) => void
}

export function ConversationHistory({
    messages,
    currentConversationId,
    onConversationLoad,
    onNewConversation,
    onCurrentConversationIdChange
}: ConversationHistoryProps) {
    const [showHistory, setShowHistory] = useState(false)
    const [conversations, setConversations] = useState<Conversation[]>([])

    // Load conversations on mount
    useEffect(() => {
        const savedConversations = loadConversationsFromStorage()
        setConversations(savedConversations)
    }, [])

    // Save conversations when they change
    useEffect(() => {
        if (conversations.length > 0) {
            saveConversationsToStorage(conversations)
        }
    }, [conversations])

    // Auto-save current conversation when messages change
    useEffect(() => {
        const meaningfulMessages = messages.filter(m => m.content.trim() && !(m.id === '1' && !m.content))
        if (meaningfulMessages.length === 0) return

        const title = generateConversationTitle(meaningfulMessages)
        const conversationId = currentConversationId || Date.now().toString()

        const conversation: Conversation = {
            id: conversationId,
            title,
            messages: meaningfulMessages,
            timestamp: new Date()
        }

        setConversations(prev => {
            const filtered = prev.filter(c => c.id !== conversationId)
            return [conversation, ...filtered]
        })

        if (!currentConversationId) {
            onCurrentConversationIdChange(conversationId)
        }
    }, [messages, currentConversationId, onCurrentConversationIdChange])

    // Handle click outside to close history panel
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as HTMLElement
            const historyPanel = document.querySelector('[data-history-panel]')
            const historyButton = document.querySelector('[data-history-button]')

            if (showHistory && historyPanel && !historyPanel.contains(target) && !historyButton?.contains(target)) {
                setShowHistory(false)
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [showHistory])

    const loadConversation = (conversation: Conversation) => {
        onConversationLoad(conversation)
        setShowHistory(false)
    }

    const deleteConversation = (conversationId: string) => {
        setConversations(prev => prev.filter(c => c.id !== conversationId))
        if (currentConversationId === conversationId) {
            onCurrentConversationIdChange(null)
        }
    }

    const startNewConversation = () => {
        onNewConversation()
        setShowHistory(false)
    }

    const renderHistoryPanel = () => {
        if (!showHistory) return null

        return (
            <div className="absolute top-14 left-2 z-50 w-80 max-h-96 bg-background border rounded-lg shadow-lg" data-history-panel>
                <div className="p-3 border-b">
                    <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-sm">Conversation History</h3>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowHistory(false)}
                            className="h-6 w-6 p-0"
                        >
                            <X className="w-3 h-3" />
                        </Button>
                    </div>
                </div>

                <ScrollArea className="max-h-80 p-3">
                    <div className="space-y-2">
                        <Button
                            variant="outline"
                            className="w-full justify-start h-auto p-2 text-xs"
                            onClick={startNewConversation}
                        >
                            <Plus className="w-3 h-3 mr-2" />
                            New Conversation
                        </Button>

                        {conversations.map((conversation) => (
                            <div key={conversation.id} className="group">
                                <Card className={cn(
                                    "p-2 cursor-pointer transition-colors hover:bg-muted/50",
                                    currentConversationId === conversation.id && "bg-primary/10 border-primary/20"
                                )}>
                                    <div className="flex items-start gap-2">
                                        <div
                                            className="flex-1 min-w-0"
                                            onClick={() => loadConversation(conversation)}
                                        >
                                            <div className="font-medium text-xs truncate">
                                                {conversation.title}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {conversation.timestamp.toLocaleDateString()}
                                            </div>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="opacity-0 group-hover:opacity-100 transition-opacity h-5 w-5 p-0"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                deleteConversation(conversation.id)
                                            }}
                                        >
                                            <Trash2 className="w-2.5 h-2.5" />
                                        </Button>
                                    </div>
                                </Card>
                            </div>
                        ))}

                        {conversations.length === 0 && (
                            <div className="text-center text-muted-foreground py-6">
                                <History className="w-6 h-6 mx-auto mb-2 opacity-50" />
                                <p className="text-xs">No conversations yet</p>
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </div>
        )
    }

    return (
        <>
            <Button
                variant="outline"
                size="sm"
                onClick={() => setShowHistory(true)}
                data-history-button
            >
                <History className="w-4 h-4 mr-2" />
                History
            </Button>
            {renderHistoryPanel()}
        </>
    )
} 