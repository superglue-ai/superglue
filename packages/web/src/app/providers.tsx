'use client'
import { PostHogProvider } from 'posthog-js/react'
import SuspendedPostHogPageView from '../components/utils/PHPageView'

let posthog: any = undefined;

export function CSPostHogProvider({ children }: { children: React.ReactNode }) {
  return (
    <PostHogProvider client={posthog}>
      <SuspendedPostHogPageView />
      {children}
    </PostHogProvider>
  );
}

// Only in components
if (typeof window !== 'undefined' && !posthog) {
  posthog = posthog.init("phc_89mcVkZ9osPaFQwTp3oFA2595ne95OSNk47qnhqCCbE", {
      ui_host: "https://us.posthog.com",
      api_host: 'https://d22ze2hfwgrlye.cloudfront.net',
      person_profiles: 'always',
    })
}
