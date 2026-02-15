import type { AstroIntegration } from 'astro';
import { readdir, readFile, writeFile } from 'fs/promises';
import { join, relative } from 'path';

interface DocFile {
  slug: string;
  title: string;
  description: string;
  content: string;
  order: number;
}

// Define section order and metadata
const SECTIONS = [
  { prefix: 'index', label: 'Introduction', order: 0 },
  { prefix: 'getting-started', label: 'Getting Started', order: 1 },
  { prefix: 'guides', label: 'Guides', order: 2 },
  { prefix: 'mcp', label: 'MCP', order: 3 },
  { prefix: 'api', label: 'API Reference', order: 4 },
  { prefix: 'enterprise', label: 'Enterprise', order: 5 },
];

function getSectionOrder(slug: string): number {
  if (slug === 'index') return 0;
  const section = SECTIONS.find(s => slug.startsWith(s.prefix + '/') || slug === s.prefix);
  return section?.order ?? 99;
}

function getSectionLabel(slug: string): string {
  if (slug === 'index') return 'Introduction';
  const section = SECTIONS.find(s => slug.startsWith(s.prefix + '/') || slug === s.prefix);
  return section?.label ?? 'Other';
}

async function getAllMdxFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  
  async function walk(currentDir: string) {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.name.endsWith('.mdx') || entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  }
  
  await walk(dir);
  return files;
}

function extractFrontmatter(content: string): { title: string; description: string; content: string } {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  
  let title = '';
  let description = '';
  let bodyContent = content;
  
  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1];
    if (frontmatter) {
      const titleMatch = frontmatter.match(/title:\s*["']?([^"'\n]+)["']?/);
      const descMatch = frontmatter.match(/description:\s*["']?([^"'\n]+)["']?/);
      
      title = titleMatch?.[1]?.trim() ?? '';
      description = descMatch?.[1]?.trim() ?? '';
    }
    bodyContent = content.slice(frontmatterMatch[0].length).trim();
  }
  
  return { title, description, content: bodyContent };
}

function stripMdxComponents(content: string): string {
  // Remove import statements
  content = content.replace(/^import\s+.*$/gm, '');
  
  // Remove JSX-style components but keep their text content
  // Handle self-closing tags
  content = content.replace(/<[A-Z][a-zA-Z]*\s*[^>]*\/>/g, '');
  
  // Handle component tags with content - extract inner content
  content = content.replace(/<([A-Z][a-zA-Z]*)[^>]*>([\s\S]*?)<\/\1>/g, '$2');
  
  // Remove any remaining HTML-like tags
  content = content.replace(/<\/?[a-zA-Z][^>]*>/g, '');
  
  // Clean up excessive whitespace
  content = content.replace(/\n{3,}/g, '\n\n');
  
  return content.trim();
}

function generateLlmsTxt(docs: DocFile[]): string {
  const lines: string[] = [
    '# superglue',
    '',
    '> AI-native integration platform for glue code, migrations, and legacy system automation',
    '',
  ];
  
  // Group by section
  const sections = new Map<string, DocFile[]>();
  
  for (const doc of docs) {
    const label = getSectionLabel(doc.slug);
    if (!sections.has(label)) {
      sections.set(label, []);
    }
    sections.get(label)!.push(doc);
  }
  
  // Output in section order
  for (const section of SECTIONS) {
    const sectionDocs = sections.get(section.label);
    if (!sectionDocs || sectionDocs.length === 0) continue;
    
    lines.push(`## ${section.label}`);
    
    for (const doc of sectionDocs) {
      const url = doc.slug === 'index' ? '/' : `/${doc.slug}`;
      const desc = doc.description || doc.title;
      lines.push(`[${doc.title}](${url}): ${desc}`);
    }
    
    lines.push('');
  }
  
  // Output any docs that didn't match a known section
  const otherDocs = sections.get('Other');
  if (otherDocs && otherDocs.length > 0) {
    lines.push(`## Other`);
    for (const doc of otherDocs) {
      const url = doc.slug === 'index' ? '/' : `/${doc.slug}`;
      const desc = doc.description || doc.title;
      lines.push(`[${doc.title}](${url}): ${desc}`);
    }
    lines.push('');
  }
  
  // Add optional links
  lines.push('## Optional');
  lines.push('[GitHub Repository](https://github.com/superglue-ai/superglue): Open source and self-hostable');
  lines.push('[Discord Community](https://discord.gg/vUKnuhHtfW): Get help and share ideas');
  lines.push('[Book a Demo](https://cal.com/superglue/superglue-demo): Talk to our team');
  
  return lines.join('\n');
}

function generateLlmsFullTxt(docs: DocFile[]): string {
  const lines: string[] = [
    '# superglue Full Documentation',
    '',
    '> Complete documentation including all pages, guides, API reference, and enterprise features',
    '',
    `> Generated on: ${new Date().toISOString()}`,
    '',
  ];
  
  for (const doc of docs) {
    const url = doc.slug === 'index' ? '/' : `/${doc.slug}`;
    
    lines.push('');
    lines.push(`## ${doc.title}`);
    lines.push(`URL: ${url}`);
    if (doc.description) {
      lines.push(`Description: ${doc.description}`);
    }
    lines.push('');
    lines.push(stripMdxComponents(doc.content));
    lines.push('');
    lines.push('---');
  }
  
  return lines.join('\n');
}

export function llmsTxtIntegration(): AstroIntegration {
  return {
    name: 'llms-txt',
    hooks: {
      'astro:build:done': async ({ dir }) => {
        // Use process.cwd() to get the docs directory reliably
        const docsDir = join(process.cwd(), 'src/content/docs');
        const outDir = dir.pathname;
        
        console.log('Generating llms.txt and llms-full.txt...');
        
        try {
          const files = await getAllMdxFiles(docsDir);
          const docs: DocFile[] = [];
          
          for (const file of files) {
            const content = await readFile(file, 'utf-8');
            const slug = relative(docsDir, file)
              .replace(/\.(mdx|md)$/, '')
              .replace(/\/index$/, '');
            
            // Skip 404 page
            if (slug === '404') continue;
            
            const { title, description, content: bodyContent } = extractFrontmatter(content);
            
            docs.push({
              slug: slug || 'index',
              title: title || slug.split('/').pop() || 'Introduction',
              description,
              content: bodyContent,
              order: getSectionOrder(slug || 'index'),
            });
          }
          
          // Sort by section order, then alphabetically within sections
          docs.sort((a, b) => {
            if (a.order !== b.order) return a.order - b.order;
            return a.slug.localeCompare(b.slug);
          });
          
          const llmsTxt = generateLlmsTxt(docs);
          const llmsFullTxt = generateLlmsFullTxt(docs);
          
          await writeFile(join(outDir, 'llms.txt'), llmsTxt);
          await writeFile(join(outDir, 'llms-full.txt'), llmsFullTxt);
          
          // Also write to public for dev mode
          const publicDir = join(process.cwd(), 'public');
          await writeFile(join(publicDir, 'llms.txt'), llmsTxt);
          await writeFile(join(publicDir, 'llms-full.txt'), llmsFullTxt);
          
          console.log(`✓ Generated llms.txt (${docs.length} docs)`);
          console.log(`✓ Generated llms-full.txt`);
        } catch (error) {
          console.error('Error generating llms.txt files:', error);
        }
      },
    },
  };
}
