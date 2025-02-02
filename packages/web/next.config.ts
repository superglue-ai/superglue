import type { NextConfig } from "next";

const nextConfig = {
  env: {
    NEXT_PUBLIC_POSTHOG_KEY: 'phc_89mcVkZ9osPaFQwTp3oFA2595ne95OSNk47qnhqCCbE',
    NEXT_PUBLIC_POSTHOG_HOST: 'https://us.i.posthog.com',
  },
} satisfies NextConfig;

export default nextConfig;
