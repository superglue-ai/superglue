import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import matter from 'gray-matter';

async function generateLlmsFull() {
  try {
    const files = await glob('src/content/docs/**/*.mdx');
    
    let output = '# superglue Full Documentation\n\n';
    output += '> Complete documentation including all pages, guides, API reference, and enterprise features\n\n';
    output += '> Generated on: ' + new Date().toISOString() + '\n\n';
    
    // Sort files by path for consistent ordering
    files.sort();
    
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const { data, content: mdx } = matter(content);
      
      const urlPath = file
        .replace('src/content/docs/', '/')
        .replace('.mdx', '');
      
      output += `\n## ${data.title || path.basename(file, '.mdx')}\n`;
      output += `URL: ${urlPath}\n`;
      if (data.description) {
        output += `Description: ${data.description}\n`;
      }
      output += '\n';
      
      // Strip JSX/components but keep markdown
      let cleanContent = mdx
        // Remove import statements
        .replace(/^import\s+.*?;?\s*$/gm, '')
        // Remove opening JSX tags (keep content)
        .replace(/<[A-Z][a-zA-Z]*[^>]*>/g, '')
        // Remove closing JSX tags
        .replace(/<\/[A-Z][a-zA-Z]*>/g, '')
        // Remove self-closing JSX components
        .replace(/<[A-Z][a-zA-Z]*[^>]*\/>/g, '')
        // Remove HTML comments
        .replace(/<!--[\s\S]*?-->/g, '')
        // Clean up multiple newlines
        .replace(/\n{3,}/g, '\n\n');
      
      output += cleanContent.trim();
      output += '\n\n---\n';
    }
    
    // Write to dist if it exists (production build)
    if (fs.existsSync('dist')) {
      fs.writeFileSync('dist/llms-full.txt', output);
      console.log(`✓ Generated dist/llms-full.txt with ${files.length} pages`);
    }
    
    // Always write to public for dev mode
    fs.writeFileSync('public/llms-full.txt', output);
    console.log(`✓ Generated public/llms-full.txt with ${files.length} pages`);
  } catch (error) {
    console.error('Error generating llms-full.txt:', error);
    process.exit(1);
  }
}

generateLlmsFull();
