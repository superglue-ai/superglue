'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/src/components/ui/button'
import { Input } from '@/src/components/ui/input'
import { Label } from '@/src/components/ui/label'
import { Switch } from '@/src/components/ui/switch'
import { Plus, Trash2, Sparkles } from 'lucide-react'
import { parseCredentialsHelper } from '@/src/lib/client-utils'
import { cn } from '@/src/lib/utils'

type Credential = {
  key: string
  value: string
}

interface CredentialsManagerProps {
  value: string
  onChange: (value: string) => void
  className?: string
}

export function CredentialsManager({ value, onChange, className }: CredentialsManagerProps) {
  const [isAdvancedMode, setIsAdvancedMode] = useState(false)
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [apiKey, setApiKey] = useState('')

  // Initialize from value prop
  useEffect(() => {
    try {
      const parsedCreds = parseCredentialsHelper(value)
      
      if (Object.keys(parsedCreds).length === 0 && value.trim() !== '{}') {
        return
      }
      
      setCredentials(
        Object.entries(parsedCreds).map(([key, value]) => ({
          key,
          value: String(value)
        }))
      )
      
      // Set API key if it exists
      if (parsedCreds.api_key) {
        setApiKey(String(parsedCreds.api_key))
      }
    } catch (e) {
      // Invalid JSON handling
    }
  }, [value])

  // Update the parent component when credentials change
  const updateCredentials = (newCredentials: Credential[]) => {
    setCredentials(newCredentials)
    const credObject = newCredentials.reduce((obj, cred) => {
      if (cred.key.trim()) {
        obj[cred.key] = cred.value
      }
      return obj
    }, {} as Record<string, string>)
    
    onChange(JSON.stringify(credObject, null, 2))
  }

  // Update API key
  const updateApiKey = (newValue: string) => {
    setApiKey(newValue)
    onChange(JSON.stringify({ api_key: newValue }, null, 2))
  }

  // Add a new credential
  const addCredential = () => {
    updateCredentials([...credentials, { key: '', value: '' }])
  }

  // Remove a credential
  const removeCredential = (index: number) => {
    const newCredentials = [...credentials]
    newCredentials.splice(index, 1)
    updateCredentials(newCredentials)
  }

  // Update a credential key or value
  const updateCredential = (index: number, field: 'key' | 'value', newValue: string) => {
    const newCredentials = [...credentials]
    newCredentials[index][field] = newValue
    updateCredentials(newCredentials)
  }

  return (
    <div className={cn(className)}>
      <div className="w-full">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          <Label htmlFor="advancedMode" className="text-xs cursor-pointer">
            Advanced Mode
          </Label>
          <Switch 
            id="advancedMode" 
            checked={isAdvancedMode} 
            onCheckedChange={setIsAdvancedMode}
            className="custom-switch"
          />
        </div>

        {!isAdvancedMode ? (
          <div className="space-y-2">
            <Input
              value={apiKey}
              onChange={(e) => updateApiKey(e.target.value)}
              placeholder="API Key"
              className="w-full"
            />
          </div>
        ) : (
          <div className="space-y-2">
            {credentials.length === 0 ? (
              <div className="flex justify-center py-2 border rounded-md border-dashed">
                <Button variant="outline" size="sm" onClick={addCredential} className="h-7 text-xs">
                  <Plus className="w-3 h-3 mr-1" />
                  Add
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto w-full">
                <div className="flex flex-col gap-2 min-w-[400px] p-1">
                  {credentials.map((cred, index) => (
                    <div key={index} className="flex gap-1 w-full min-w-0">
                      <Input
                        value={cred.key}
                        onChange={(e) => updateCredential(index, 'key', e.target.value)}
                        placeholder="Key"
                        className="flex-1 h-7 text-xs min-w-0"
                      />
                      <Input
                        value={cred.value}
                        onChange={(e) => updateCredential(index, 'value', e.target.value)}
                        placeholder="Value"
                        className="flex-[2] h-7 text-xs min-w-0"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeCredential(index)}
                        className="shrink-0 h-7 w-7"
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {credentials.length > 0 && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={addCredential}
                className="text-xs h-6"
              >
                <Plus className="w-3 h-3 mr-1" />
                Add Field
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}