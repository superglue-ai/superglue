import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    proxyClientMaxBodySize: "50mb",
  },
  env: {
    NEXT_PUBLIC_POSTHOG_KEY: "phc_89mcVkZ9osPaFQwTp3oFA2595ne95OSNk47qnhqCCbE",
    NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
    DISABLE_TELEMETRY: process.env.DISABLE_TELEMETRY,
  },
};

export default nextConfig;
