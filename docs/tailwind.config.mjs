/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Brand colors - match main app
        accent: {
          DEFAULT: '#191c20',
          light: '#32343a',
          dark: '#000000',
          low: '#f7f8fa',
        },
        // Dark theme
        dark: {
          bg: '#000000',
          nav: 'rgba(0, 0, 0, 0.95)',
          border: '#404040',
          text: '#ffffff',
          muted: '#999999',
        },
        // Light theme
        light: {
          bg: '#ffffff',
          nav: 'rgba(255, 255, 255, 0.95)',
          border: '#e5e7eb',
          text: '#191c20',
          muted: '#555555',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['Geist Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
