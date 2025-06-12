'use client'

import { Badge } from '@/src/components/ui/badge'
import { Button } from '@/src/components/ui/button'
import { cn } from '@/src/lib/utils'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@radix-ui/react-collapsible'
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { ToolCall } from './AgentInterface'
import { EditableJsonInput } from './EditableJsonInput'

interface ToolCallComponentProps {
    tool: ToolCall
    onInputChange: (newInput: any) => void
}

export function ToolCallComponent({ tool, onInputChange }: ToolCallComponentProps) {
    const [isExpanded, setIsExpanded] = useState(false)
    const [showOutput, setShowOutput] = useState(false)

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'completed': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
            case 'error': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
            case 'running': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
            case 'pending': return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
            default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
        }
    }

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'completed': return '✅'
            case 'error': return '❌'
            case 'running': return <Loader2 className="w-3 h-3 animate-spin" />
            case 'pending': return '⏳'
            default: return '⏳'
        }
    }

    return (
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
            <div className="border rounded-lg bg-card">
                <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors cursor-pointer">
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </div>
                            <Badge className={cn('text-xs font-medium', getStatusColor(tool.status))}>
                                {tool.name}
                            </Badge>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                {getStatusIcon(tool.status)}
                                <span className="capitalize">{tool.status}</span>
                            </div>
                        </div>
                        {tool.startTime && tool.endTime && (
                            <span className="text-xs text-muted-foreground">
                                {Math.round(tool.endTime.getTime() - tool.startTime.getTime())}ms
                            </span>
                        )}
                    </div>
                </CollapsibleTrigger>

                <CollapsibleContent>
                    <div className="px-4 pb-4 space-y-4">
                        {tool.input && (
                            <div>
                                <div className="text-sm font-medium text-muted-foreground mb-2">Input</div>
                                <EditableJsonInput
                                    value={tool.input}
                                    onChange={onInputChange}
                                    disabled={tool.status === 'running' || tool.status === 'completed'}
                                />
                            </div>
                        )}

                        {tool.output && (
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-sm font-medium text-muted-foreground">Output</span>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => setShowOutput(!showOutput)}
                                        className="text-xs h-6"
                                    >
                                        {showOutput ? 'Hide' : 'Show'}
                                    </Button>
                                </div>
                                {showOutput && (
                                    <div className="bg-muted/50 p-3 rounded-md">
                                        <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap max-h-64">
                                            {JSON.stringify(tool.output, null, 2)}
                                        </pre>
                                    </div>
                                )}
                            </div>
                        )}

                        {tool.error && (
                            <div>
                                <div className="text-sm font-medium text-destructive mb-2">Error</div>
                                <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm">
                                    {tool.error}
                                </div>
                            </div>
                        )}
                    </div>
                </CollapsibleContent>
            </div>
        </Collapsible>
    )
} 