'use client'

import { URLField } from '@/src/components/utils/URLField'
import { useCallback, useEffect, useState } from 'react'

interface DocumentationFieldProps {
  url: string
  onUrlChange: (url: string) => void
  className?: string
  placeholder?: string
  error?: boolean
}

export function DocumentationField({
  url,
  onUrlChange,
  className,
  placeholder = "https://docs.example.com/api",
  error = false
}: DocumentationFieldProps) {
  const [localUrl, setLocalUrl] = useState(url)

  // Update local state when prop changes
  useEffect(() => {
    setLocalUrl(url)
  }, [url])

  const isValidUrl = (urlString: string): boolean => {
    if (!urlString) return true // Empty is valid
    try {
      new URL(urlString)
      return true
    } catch {
      return false
    }
  }

  const handleUrlChange = useCallback((urlHost: string, urlPath: string, queryParams: Record<string, string>) => {
    const fullUrl = urlHost + (urlPath || '')
    setLocalUrl(fullUrl)
    // Only propagate valid URLs or empty string
    if (isValidUrl(fullUrl) || fullUrl === '') {
      onUrlChange(fullUrl)
    }
  }, [onUrlChange])

  const handleBlur = useCallback(() => {
    // On blur, ensure we have a valid URL or empty string
    if (!isValidUrl(localUrl)) {
      setLocalUrl(url) // Revert to last valid URL
    }
  }, [localUrl, url])

  return (
    <div className={className}>
      <URLField
        url={localUrl}
        onUrlChange={handleUrlChange}
        placeholder={placeholder}
        error={error}
      />
      {localUrl && !isValidUrl(localUrl) && (
        <p className="text-sm text-destructive mt-1">Please enter a valid URL</p>
      )}
    </div>
  )
}