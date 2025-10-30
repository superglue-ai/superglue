'use client'

import { useEffect, useState } from 'react'
import { useConfig } from '@/src/app/config-context'
import { tokenRegistry } from '@/src/lib/token-registry'
import { useToken } from '@/src/hooks/use-token'

export default function PlaygroundPage() {
  const config = useConfig()
  const [iframeUrl, setIframeUrl] = useState('')
  const token = useToken()

  useEffect(() => {
    // Construct URL with auth token as query parameter
    const url = new URL(config.superglueEndpoint)
    url.searchParams.set('token', tokenRegistry.getToken())
    setIframeUrl(url.toString())
  }, [config.superglueEndpoint, token])

  return (
    <div className="w-full h-screen">
      {iframeUrl && (
        <iframe 
          src={iframeUrl}
          className="w-full h-full border-0"
          allow="clipboard-write"
        />
      )}
    </div>
  )
}