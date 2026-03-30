import nextConfig from "@/next.config";
import { Metadata } from "next";
import { ClientWrapper } from "./client-layout";
import { jetbrainsMono, jetbrainsSans } from "./fonts";
import { getThemeScript } from "@/src/lib/general-utils";
import "./globals.css";

// we need to force dynamic to get the env vars at runtime
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "superglue",
    template: "%s | superglue",
  },
  description:
    "AI integration platform. Build and manage integrations 10x faster with AI-powered data transformation and schema mapping.",
  keywords: ["API integration", "data transformation", "AI integration", "ETL", "data mapping"],
  authors: [{ name: "superglue" }],
  openGraph: {
    title: "superglue",
    description:
      "AI integration platform. Build and manage integrations 10x faster with AI-powered data transformation.",
    url: "https://app.superglue.cloud",
    siteName: "superglue",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "superglue",
    description: "AI integration platform. Build and manage integrations 10x faster with AI.",
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  metadataBase: new URL("https://superglue.ai"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const apiEndpoint =
    process.env.API_ENDPOINT || "http://localhost:" + (process.env.API_PORT || 3002);

  const config = {
    // Never expose any env-based API keys to the browser
    // Users must authenticate via the popup
    superglueApiKey: null,
    apiEndpoint,
    postHogKey: nextConfig.env?.NEXT_PUBLIC_POSTHOG_KEY,
    postHogHost: nextConfig.env?.NEXT_PUBLIC_POSTHOG_HOST,
  };
  // Users will authenticate via popup modal (cookie-based auth)

  return (
    <html
      lang="en"
      className={`${jetbrainsSans.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: getThemeScript(),
          }}
        />
      </head>
      <body>
        <ClientWrapper config={config}>{children}</ClientWrapper>
      </body>
    </html>
  );
}
