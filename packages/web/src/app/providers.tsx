'use client'
import React from 'react'
import posthog, { PostHog } from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'

export function CSPostHogProvider({ children }: { children: any }) {
  return (
    <PostHogProvider client={posthog}>{children}</PostHogProvider>
)
}
let postHog: PostHog | undefined = undefined;

// Only in components
if (typeof window !== 'undefined' && !postHog) {
  postHog = posthog.init("phc_89mcVkZ9osPaFQwTp3oFA2595ne95OSNk47qnhqCCbE", {
      api_host: "https://us.i.posthog.com",
      person_profiles: 'always',
    })
}