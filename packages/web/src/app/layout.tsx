import nextConfig from "@/next.config";
import { Metadata } from "next";
import { ClientWrapper } from "./client-layout";
import { jetbrainsMono, jetbrainsSans } from "./fonts";
import { getThemeScript } from "@/src/lib/general-utils";
import "./globals.css";

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
  const apiKey = process.env.AUTH_TOKEN || process.env.NEXT_PUBLIC_SUPERGLUE_API_KEY;

  if (!apiKey) {
    throw new Error("AUTH_TOKEN is not set and no other authentication provider is configured.");
  }

  const config = {
    superglueApiKey: apiKey,
    apiEndpoint,
    postHogKey: nextConfig.env?.NEXT_PUBLIC_POSTHOG_KEY,
    postHogHost: nextConfig.env?.NEXT_PUBLIC_POSTHOG_HOST,
    serverSession: {
      userId: "oss-admin",
      email: "",
      orgId: "",
      orgName: "Personal",
      orgStatus: "free",
    },
  };

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
