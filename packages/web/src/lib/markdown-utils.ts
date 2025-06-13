import { marked } from 'marked'

// Configure marked for better code highlighting
marked.setOptions({
    breaks: true,
    gfm: true,
})

// CSS styles for markdown content
export const MARKDOWN_STYLES = `
.markdown-content h1 { @apply text-2xl font-semibold mt-6 mb-4; }
.markdown-content h2 { @apply text-xl font-semibold mt-5 mb-3; }
.markdown-content h3 { @apply text-lg font-semibold mt-4 mb-2; }
.markdown-content h4,
.markdown-content h5,
.markdown-content h6 { @apply text-base font-semibold mt-3 mb-2; }
.markdown-content p { @apply mb-3; }
.markdown-content ul { @apply list-disc list-inside mb-3 pl-4; }
.markdown-content ol { @apply list-decimal list-inside mb-3 pl-4; }
.markdown-content li { @apply mb-1; }
.markdown-content blockquote { @apply border-l-4 border-primary pl-4 py-2 my-4 bg-muted/30 rounded-r; }
.markdown-content a { @apply text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:text-blue-700 dark:hover:text-blue-300 font-medium; }
.markdown-content table { @apply w-full border-collapse border border-border my-4; }
.markdown-content th { @apply border border-border px-3 py-2 bg-muted font-semibold text-left; }
.markdown-content td { @apply border border-border px-3 py-2; }
.markdown-content hr { @apply my-6 border-t border-border; }
.markdown-content code:not(pre code) { @apply bg-muted px-1.5 py-0.5 rounded text-sm font-mono; }
`

// Simple copy function
export const handleCopyCode = async (code: string, toast: any) => {
    try {
        // Decode HTML entities
        const decodedCode = code
            .replace(/&quot;/g, '"')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')

        await navigator.clipboard.writeText(decodedCode)
        toast({ title: 'Copied!', description: 'Code copied to clipboard' })
    } catch (err) {
        toast({ title: 'Failed to copy', variant: 'destructive' })
    }
}

// Update parseMarkdownContent - just add data attributes to existing code blocks
export const parseMarkdownContent = (content: string, isStreaming: boolean = false) => {
    // Handle incomplete code blocks during streaming
    if (isStreaming && content.includes('```') && !content.match(/```[\s\S]*?```$/)) {
        // If we have an opening ``` but no closing one, add a temporary indicator
        const parts = content.split('```')
        if (parts.length % 2 === 0) { // Odd number of parts means unclosed code block
            const lastPart = parts[parts.length - 1]
            const langMatch = lastPart.match(/^(\w+)\n/)
            const lang = langMatch ? langMatch[1] : 'text'
            content = content + '\n<!-- streaming -->'
        }
    }

    // Escape @ symbols in database connection strings
    content = content.replace(/(postgres:\/\/[^@]+@[^:\s]+)/g, (match) => {
        return match.replace(/@/g, '&#64;');
    });

    // Use marked to parse markdown
    let html: string
    try {
        html = marked.parse(content) as string
    } catch (error) {
        // Fallback to basic parsing if marked fails
        html = content.replace(/\n/g, '<br>')
    }

    // Add copy buttons with simpler icon
    return html.replace(
        /<pre><code class="language-(\w+)">([\s\S]*?)<\/code><\/pre>/g,
        (match, lang, code) => {
            const isStreamingBlock = code.includes('<!-- streaming -->')
            const cleanCode = code.replace('<!-- streaming -->', '')
            const streamingClass = isStreamingBlock ? 'animate-pulse' : ''

            return `
                <div class="my-4 rounded-lg border bg-muted/30 overflow-hidden ${streamingClass} group">
                    <div class="bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b flex justify-between items-center">
                        <span>${lang}${isStreamingBlock ? ' (streaming...)' : ''}</span>
                        <button class="copy-code-btn opacity-0 group-hover:opacity-100 p-1 hover:bg-background rounded transition-opacity" data-code="${cleanCode}" ${isStreamingBlock ? 'disabled' : ''} title="Copy code">
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                        </button>
                    </div>
                    <pre class="p-4 overflow-x-auto bg-background text-sm font-mono"><code class="language-${lang}">${cleanCode}</code></pre>
                </div>
            `
        }
    ).replace(
        /<pre><code>([\s\S]*?)<\/code><\/pre>/g,
        (match, code) => {
            const isStreamingBlock = code.includes('<!-- streaming -->')
            const cleanCode = code.replace('<!-- streaming -->', '')
            const streamingClass = isStreamingBlock ? 'animate-pulse' : ''

            return `
                <div class="my-4 rounded-lg border bg-muted/30 overflow-hidden ${streamingClass} group">
                    <div class="bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b flex justify-between items-center">
                        <span>text${isStreamingBlock ? ' (streaming...)' : ''}</span>
                        <button class="copy-code-btn opacity-0 group-hover:opacity-100 p-1 hover:bg-background rounded transition-opacity" data-code="${cleanCode}" ${isStreamingBlock ? 'disabled' : ''} title="Copy code">
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                        </button>
                    </div>
                    <pre class="p-4 overflow-x-auto bg-background text-sm font-mono"><code>${cleanCode}</code></pre>
                </div>
            `
        }
    ).replace(
        /<code>/g,
        '<code class="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">'
    ).replace(
        /<h1>/g,
        '<h1 class="text-2xl font-semibold mt-6 mb-4">'
    ).replace(
        /<h2>/g,
        '<h2 class="text-xl font-semibold mt-5 mb-3">'
    ).replace(
        /<h3>/g,
        '<h3 class="text-lg font-semibold mt-4 mb-2">'
    ).replace(
        /<h([456])>/g,
        '<h$1 class="text-base font-semibold mt-3 mb-2">'
    ).replace(
        /<p>/g,
        '<p class="mb-3">'
    ).replace(
        /<ul>/g,
        '<ul class="list-disc list-inside mb-3 pl-4">'
    ).replace(
        /<ol>/g,
        '<ol class="list-decimal list-inside mb-3 pl-4">'
    ).replace(
        /<li>/g,
        '<li class="mb-1">'
    ).replace(
        /<blockquote>/g,
        '<blockquote class="border-l-4 border-primary pl-4 py-2 my-4 bg-muted/30 rounded-r">'
    ).replace(
        /<a /g,
        '<a target="_blank" rel="noopener noreferrer" class="text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:text-blue-700 dark:hover:text-blue-300 font-medium" '
    ).replace(
        /<table>/g,
        '<table class="w-full border-collapse border border-border my-4">'
    ).replace(
        /<th>/g,
        '<th class="border border-border px-3 py-2 bg-muted font-semibold text-left">'
    ).replace(
        /<td>/g,
        '<td class="border border-border px-3 py-2">'
    ).replace(
        /<hr>/g,
        '<hr class="my-6 border-t border-border">'
    )
} 