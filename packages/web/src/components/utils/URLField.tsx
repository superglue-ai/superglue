'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { Button } from '@/src/components/ui/button'
import { Input } from '@/src/components/ui/input'
import { Link, X } from 'lucide-react'
import { Badge } from '@/src/components/ui/badge'
import { cn } from '@/src/lib/utils'
import { splitUrl } from '@/src/lib/client-utils'
import { integrations } from '@/src/lib/integrations'
import type { SimpleIcon } from 'simple-icons'

// Import all icons
import * as simpleIcons from 'simple-icons'

interface URLFieldProps {
  url: string
  onUrlChange: (urlHost: string, urlPath: string, queryParams: Record<string, string>) => void
  placeholder?: string
  className?: string
  error?: boolean
  required?: boolean
}

export function URLField({
  url: initialUrl,
  onUrlChange,
  placeholder = "https://api.example.com/v1",
  className,
  error = false,
  required = false
}: URLFieldProps) { 
  const [url, setUrl] = useState(initialUrl || '')
  const [isValid, setIsValid] = useState<boolean | null>(null)
  const [iconName, setIconName] = useState<string | null>(null)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const previousUrlRef = useRef(initialUrl);

  const validateUrl = (url: string): boolean => {
    if (!url) return false
    try {
      new URL(url)
      return true
    } catch {
      return false
    }
  }

  const getIconForUrl = (url: string): string | null => {
    if (!url) return null
    try {
      const urlObj = new URL(url)
      const fullPath = `${urlObj.hostname}${urlObj.pathname}`
      
      for (const [name, integration] of Object.entries(integrations)) {
        const regex = new RegExp(integration.regex)
        if (regex.test(fullPath)) {
          return integration.icon as string
        }
      }
      return null
    } catch {
      return null
    }
  }

  const getSimpleIcon = (name: string): SimpleIcon | null => {
    if (!name) return null
    
    // Convert service name to proper format for simple-icons
    const formatted = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()
    const iconKey = `si${formatted}`
    try {
      // Try the direct lookup first
      // @ts-ignore - The type definitions don't properly handle string indexing
      let icon = simpleIcons[iconKey]
      return icon || null
    } catch (e) {
      return null
    }
  }

  const extractQueryParams = (url: string): Record<string, string> => {
    try {
      const urlObj = new URL(url);
      const params: Record<string, string> = {};
      urlObj.searchParams.forEach((value, key) => {
        params[key] = value;
      });
      return params;
    } catch {
      return {};
    }
  }

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value
    setUrl(newUrl)
    
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    debounceTimerRef.current = setTimeout(() => {
      // Don't auto-modify the URL while typing - only check validity
      const valid = validateUrl(newUrl)
      setIsValid(valid)
      
      // Check for icon match
      if (valid) {
        setIconName(getIconForUrl(newUrl))
      } else {
        setIconName(null)
      }
      
      // For the callback, attempt to parse as-is
      const { urlHost, urlPath } = splitUrl(newUrl)
      const queryParams = extractQueryParams(newUrl)
      onUrlChange(urlHost, urlPath, queryParams)
    }, 300)
  }, [onUrlChange]);

  const handleBlur = useCallback(() => {
    if (url && !url.startsWith('http://') && !url.startsWith('https://') && url.includes('.')) {
      const newUrl = `https://${url}`
      setUrl(newUrl)
      setIconName(getIconForUrl(newUrl))
      const { urlHost, urlPath } = splitUrl(newUrl)
      const queryParams = extractQueryParams(newUrl)
      onUrlChange(urlHost, urlPath, queryParams)
    }
  }, [url, onUrlChange]);

  const handleClear = useCallback(() => {
    setUrl('')
    setIsValid(null)
    setIconName(null)
    onUrlChange('', '', {})
  }, [onUrlChange])

    useEffect(() => {
    // Only update internal state when prop actually changes
    if (initialUrl !== previousUrlRef.current) {
      setUrl(initialUrl || '')
      const valid = validateUrl(initialUrl)
      setIsValid(valid)
      if (valid) {
        setIconName(getIconForUrl(initialUrl))
      }
      previousUrlRef.current = initialUrl;
    }
  }, [initialUrl])

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  // Get the simple-icon for the current URL if available
  const simpleIcon = iconName ? getSimpleIcon(iconName) : null

  return (
    <div className={className}>
      <div className="relative flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            value={url}
            onChange={handleInputChange}
            onBlur={handleBlur}
            placeholder={placeholder}
            className={cn(
              "pr-28",
              error && "border-destructive focus-visible:ring-destructive"
            )}
            required={required}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <Badge variant="outline">
              {simpleIcon ? (
                <div className="flex items-center">
                  <svg 
                    width="12" 
                    height="12" 
                    viewBox="0 0 24 24" 
                    fill={`#${simpleIcon.hex}`}
                    className="mr-1"
                  >
                    <path d={simpleIcon.path} />
                  </svg>
                  <span>{String(simpleIcon.title || "URL").charAt(0).toUpperCase() + String(simpleIcon.title || "URL").slice(1)}</span>
                </div>
              ) : (
                <>
                  <Link className="h-3 w-3 mr-1" /> URL
                </>
              )}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  )
}
