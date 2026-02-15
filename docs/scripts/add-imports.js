import fs from 'fs';
import { glob } from 'glob';

const COMPONENT_IMPORTS = `
import { Card, CardGroup, Steps, Step, Tabs, Tab, Accordion, AccordionGroup, Info, Tip, Note, CodeGroup, Frame } from '../../../components/mintlify/index.ts';
`.trim();

async function addImports() {
  const files = await glob('src/content/docs/**/*.mdx');
  
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    
    // Check if file uses any components
    const usesComponents = /(<Card|<Steps|<Tab|<Accordion|<Info|<Tip|<Note|<CodeGroup|<Frame)/.test(content);
    
    if (usesComponents && !content.includes('from \'../../../components/mintlify')) {
      // Split frontmatter and content
      const parts = content.split('---\n');
      if (parts.length >= 3) {
        // parts[0] is empty, parts[1] is frontmatter, parts[2+] is content
        const newContent = `---\n${parts[1]}---\n${COMPONENT_IMPORTS}\n\n${parts.slice(2).join('---\n')}`;
        fs.writeFileSync(file, newContent);
        console.log(`✓ Added imports to ${file}`);
      }
    }
  }
  
  console.log('Done!');
}

addImports();
