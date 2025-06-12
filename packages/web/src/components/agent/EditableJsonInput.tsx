'use client'

import { Button } from '@/src/components/ui/button'
import { Textarea } from '@/src/components/ui/textarea'
import { Check, Edit2, X } from 'lucide-react'
import { useState } from 'react'

interface EditableJsonInputProps {
    value: any
    onChange: (newValue: any) => void
    disabled?: boolean
}

export function EditableJsonInput({ value, onChange, disabled = false }: EditableJsonInputProps) {
    const [isEditing, setIsEditing] = useState(false)
    const [editValue, setEditValue] = useState('')
    const [error, setError] = useState('')

    const handleStartEdit = () => {
        setEditValue(JSON.stringify(value, null, 2))
        setIsEditing(true)
        setError('')
    }

    const handleSave = () => {
        try {
            const parsed = JSON.parse(editValue)
            onChange(parsed)
            setIsEditing(false)
            setError('')
        } catch (e) {
            setError('Invalid JSON')
        }
    }

    const handleCancel = () => {
        setIsEditing(false)
        setEditValue('')
        setError('')
    }

    if (isEditing) {
        return (
            <div className="space-y-2">
                <Textarea
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="font-mono text-xs min-h-[100px]"
                    placeholder="Enter valid JSON..."
                />
                {error && (
                    <div className="text-xs text-destructive">{error}</div>
                )}
                <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={handleSave}>
                        <Check className="w-3 h-3 mr-1" />
                        Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={handleCancel}>
                        <X className="w-3 h-3 mr-1" />
                        Cancel
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <div className="relative group">
            <pre className="bg-muted p-3 rounded-md text-xs font-mono overflow-x-auto max-h-32">
                {JSON.stringify(value, null, 2)}
            </pre>
            {!disabled && (
                <Button
                    size="sm"
                    variant="ghost"
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={handleStartEdit}
                >
                    <Edit2 className="w-3 h-3" />
                </Button>
            )}
        </div>
    )
} 