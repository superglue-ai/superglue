'use client'

import { useRouter } from 'next/navigation'
import { usePostHog } from 'posthog-js/react'
import { useEffect, useState } from 'react'
import { useConfig } from '../config-context'

export default function WelcomePage() {
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const posthog = usePostHog()
  const config = useConfig()

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DISABLE_WELCOME_SCREEN === 'true') {
      router.push('/')
      return
    }
    
    const checkTenantInfo = async () => {
      try {
        // TODO: remove once client SDK is updated
        const response = await fetch(`${config.superglueEndpoint}/graphql`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.superglueApiKey}`,
          },
          body: JSON.stringify({
            query: `
              query GetTenantInfo {
                getTenantInfo {
                  email
                  hasAskedForEmail
                }
              }
            `,
          }),
        })
        
        if (!response.ok) {
          console.error('GraphQL request failed:', response.statusText)
          setLoading(false)
          return
        }
        
        const { data } = await response.json()
        
        if (data?.getTenantInfo?.hasAskedForEmail) {
          router.push('/')
        }
      } catch (err) {
        console.error('Error checking tenant info:', err)
      } finally {
        setLoading(false)
      }
    }
    
    checkTenantInfo()
  }, [router, config.superglueEndpoint])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    if (!email) {
      setError('Email is required')
      return
    }

    // Simple email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address')
      return
    }

    setIsSubmitting(true)

    try {
      posthog.capture('sh_email_acquired', { 
        email,
        distinct_id: email,
        userProperty: {
          email: email
        }
      })

      // TODO: remove once client SDK is updated
      const response = await fetch(`${config.superglueEndpoint}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.superglueApiKey}`,
        },
        body: JSON.stringify({
          query: `
            mutation SetTenantInfo($email: String!) {
              setTenantInfo(email: $email) {
                email
                hasAskedForEmail
              }
            }
          `,
          variables: {
            email,
          },
        }),
      })
      
      if (!response.ok) {
        throw new Error('GraphQL request failed')
      }

      const result = await response.json()
      if (result.errors) {
        throw new Error(result.errors[0]?.message || 'Failed to store email')
      }

      // Store in cookies for better performance
      document.cookie = `sg_tenant_email=${encodeURIComponent(email)}; path=/; max-age=31536000; SameSite=Strict`
      document.cookie = `sg_tenant_hasAskedForEmail=true; path=/; max-age=31536000; SameSite=Strict`

      posthog.identify(email, {
        email: email
      })

      router.push('/')
    } catch (err) {
      console.error(err)
      setError('Failed to submit email. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-50">
        <div className="w-full max-w-md p-8 space-y-8 bg-white rounded-lg shadow-lg">
          <div className="text-center">
            <h2 className="mt-6 text-3xl font-bold text-gray-900">Loading...</h2>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-50">
      <div className="w-full max-w-md p-8 space-y-8 bg-white rounded-lg shadow-lg">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-bold text-gray-900">Welcome to Superglue</h2>
          <p className="mt-2 text-sm text-gray-600">
            Please enter your email to continue
          </p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="email" className="sr-only">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {error && (
            <div className="text-red-500 text-sm">{error}</div>
          )}

          <div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {isSubmitting ? 'Submitting...' : 'Continue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
} 