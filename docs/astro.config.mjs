// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import icon from 'astro-icon';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';
import { llmsTxtIntegration } from './src/integrations/llms-txt';

// https://astro.build/config
export default defineConfig({
  site: 'https://docs.superglue.ai',
  integrations: [
    icon(),
    tailwind({ applyBaseStyles: false }),
    sitemap(),
    llmsTxtIntegration(),
    starlight({
      title: 'DOCUMENTATION',
      description: 'AI-native integration platform for glue code, migrations, and legacy system automation',
      logo: {
        light: './src/assets/logo-light.svg',
        dark: './src/assets/logo-dark.svg',
        replacesTitle: false,
      },
      favicon: '/favicon.png',
      expressiveCode: {
        themes: ['github-dark', 'github-light'],
        styleOverrides: {
          borderRadius: '0.75rem',
          borderWidth: '1px',
          codePaddingInline: '1rem',
          codePaddingBlock: '0.875rem',
          codeFontFamily: "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          codeFontSize: '0.875rem',
          codeLineHeight: '1.6',
          uiFontFamily: "'Noto Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        },
        defaultProps: {
          wrap: true,
        },
      },
      components: {
        ThemeSelect: './src/components/ThemeSelect.astro',
        Sidebar: './src/components/Sidebar.astro',
        SocialIcons: './src/components/SocialIcons.astro',
        TableOfContents: './src/components/TableOfContents.astro',
        SiteTitle: './src/components/SiteTitle.astro',
        PageFrame: './src/components/PageFrame.astro',
      },
      defaultLocale: 'root',
      locales: {
        root: {
          label: 'English',
          lang: 'en',
        },
      },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/superglue-ai/superglue' },
        { icon: 'discord', label: 'Discord', href: 'https://discord.gg/vUKnuhHtfW' },
        { icon: 'linkedin', label: 'LinkedIn', href: 'https://www.linkedin.com/company/superglue-ai/' },
      ],
      customCss: ['./src/styles/custom.css'],
      head: [
        // Google Fonts - Noto Sans
        {
          tag: 'link',
          attrs: { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        },
        {
          tag: 'link',
          attrs: { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: true },
        },
        {
          tag: 'link',
          attrs: { 
            rel: 'stylesheet', 
            href: 'https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wght@0,100..900;1,100..900&display=swap' 
          },
        },
        // Open Graph meta tags
        {
          tag: 'meta',
          attrs: { property: 'og:image', content: '/og-image.png' },
        },
        {
          tag: 'meta',
          attrs: { property: 'og:image:width', content: '1200' },
        },
        {
          tag: 'meta',
          attrs: { property: 'og:image:height', content: '630' },
        },
        {
          tag: 'meta',
          attrs: { property: 'og:type', content: 'website' },
        },
        // Twitter Card
        {
          tag: 'meta',
          attrs: { name: 'twitter:card', content: 'summary_large_image' },
        },
        {
          tag: 'meta',
          attrs: { name: 'twitter:image', content: '/og-image.png' },
        },
        // Keywords
        {
          tag: 'meta',
          attrs: { 
            name: 'keywords', 
            content: 'API integration, legacy systems, data migration, ETL, workflow automation, AI tools, system integration' 
          },
        },
        // Structured Data
        {
          tag: 'script',
          attrs: { type: 'application/ld+json' },
          content: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'superglue',
            applicationCategory: 'DeveloperApplication',
            description: 'AI-native integration platform for glue code, migrations, and legacy system automation',
            operatingSystem: 'Cross-platform',
            offers: {
              '@type': 'Offer',
              price: '0',
              priceCurrency: 'USD',
            },
            url: 'https://docs.superglue.ai',
            documentation: 'https://docs.superglue.ai',
          }),
        },
      ],
      sidebar: [
        { label: 'Introduction', slug: 'index' },
        {
          label: 'Getting Started',
          items: [
            { label: 'Core Concepts', slug: 'getting-started/core-concepts' },
            { label: 'Setup', slug: 'getting-started/setup' },
            { label: 'LLM-Driven Development', slug: 'getting-started/llm-driven-development' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'Creating a System', slug: 'guides/creating-a-system' },
            { label: 'Creating a Tool', slug: 'guides/creating-a-tool' },
            { label: 'Debugging a Tool', slug: 'guides/debugging-a-tool' },
            { label: 'Deploying a Tool', slug: 'guides/deploying-a-tool' },
            { label: 'Using Template Expressions', slug: 'guides/using-template-expressions' },
            { label: 'Using the Agent', slug: 'guides/using-the-agent' },
            { label: 'MCP Integration', slug: 'mcp/using-the-mcp' },
          ],
        },
        // API Reference - single page with Scalar, with endpoint links
        {
          label: 'API Reference',
          items: [
            { label: 'Overview', slug: 'api/reference' },
            {
              label: 'Tools',
              items: [
                { label: 'List tools', link: '/api/reference/#tag/tools/GET/tools' },
                { label: 'Get tool details', link: '/api/reference/#tag/tools/GET/tools/{toolId}' },
                { label: 'Run a tool', link: '/api/reference/#tag/tools/POST/tools/{toolId}/run' },
              ],
            },
            {
              label: 'Runs',
              items: [
                { label: 'List runs', link: '/api/reference/#tag/runs/GET/runs' },
                { label: 'Get run status', link: '/api/reference/#tag/runs/GET/runs/{runId}' },
                { label: 'Cancel a run', link: '/api/reference/#tag/runs/POST/runs/{runId}/cancel' },
              ],
            },
            {
              label: 'Webhooks',
              items: [
                { label: 'Handle webhook', link: '/api/reference/#tag/webhooks/POST/hooks/{toolId}' },
              ],
            },
          ],
        },
        {
          label: 'Enterprise',
          badge: 'EE',
          items: [
            { label: 'Metrics & Telemetry', slug: 'enterprise/metrics' },
            { label: 'Scheduling', slug: 'enterprise/scheduling' },
            { label: 'Webhooks', slug: 'enterprise/webhooks' },
            { label: 'Notifications', slug: 'enterprise/notifications' },
            { label: 'Run History', slug: 'enterprise/run-history' },
            { label: 'Permissioning', slug: 'enterprise/permissioning' },
            { label: 'End Users', slug: 'enterprise/end-users' },
            { label: 'Tool Versioning', slug: 'enterprise/tool-versioning' },
          ],
        },
      ],
    }),
  ],
});
