'use client'
import posthog, { PostHog } from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'
import SuspendedPostHogPageView from '../components/PHPageView'

export function CSPostHogProvider({ children }: { children: any }) {
  return (
    <PostHogProvider client={posthog}>
      <SuspendedPostHogPageView />
      {children}
    </PostHogProvider>
  )
}
let postHog: PostHog | undefined = undefined;

// Only in components
if (typeof window !== 'undefined' && !postHog) {
  postHog = posthog.init("phc_89mcVkZ9osPaFQwTp3oFA2595ne95OSNk47qnhqCCbE", {
      ui_host: "https://us.posthog.com",
      api_host: 'https://d22ze2hfwgrlye.cloudfront.net',
      person_profiles: 'always',
    })
}
