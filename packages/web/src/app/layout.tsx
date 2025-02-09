import "./globals.css";
import nextConfig from "@/next.config";
import { ClientWrapper } from "@/src/app/client-layout";
import { geistSans, geistMono } from '@/src/app/fonts'

// we need to force dynamic to get the env vars at runtime
export const dynamic = 'force-dynamic'

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const config = {
    superglueEndpoint: process.env.GRAPHQL_ENDPOINT || ("http://localhost:" + process.env.GRAPHQL_PORT),
    superglueApiKey: process.env.NEXT_PUBLIC_SUPERGLUE_API_KEY || process.env.AUTH_TOKEN,
    postHogKey: nextConfig.env?.NEXT_PUBLIC_POSTHOG_KEY,
    postHogHost: nextConfig.env?.NEXT_PUBLIC_POSTHOG_HOST,
  }
  return (
    <html lang="en" className={`dark ${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <ClientWrapper config={config}>
          {children}
        </ClientWrapper>
      </body>
    </html>
  );
}

