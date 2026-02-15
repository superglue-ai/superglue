import fs from 'fs';
import { glob } from 'glob';

async function convertCodeGroups() {
  const files = await glob('src/content/docs/**/*.mdx');
  
  for (const file of files) {
    let content = fs.readFileSync(file, 'utf-8');
    
    // Pattern to match CodeGroup with code blocks inside
    // Matches: <CodeGroup>\n```lang Label\ncode\n```\n```lang2 Label2\ncode2\n```\n</CodeGroup>
    const codeGroupRegex = /<CodeGroup>\s*([\s\S]*?)\s*<\/CodeGroup>/g;
    
    content = content.replace(codeGroupRegex, (match, inner) => {
      // Extract all code blocks with their labels
      const codeBlockRegex = /```(\w+)\s+([^\n]+)\n([\s\S]*?)```/g;
      const blocks = [];
      let blockMatch;
      
      while ((blockMatch = codeBlockRegex.exec(inner)) !== null) {
        blocks.push({
          lang: blockMatch[1],
          label: blockMatch[2].trim(),
          code: blockMatch[3]
        });
      }
      
      if (blocks.length === 0) {
        return match; // No code blocks found, return original
      }
      
      // Convert to Tabs format
      let result = '<Tabs>\n';
      for (const block of blocks) {
        result += `  <Tab label="${block.label}">\n`;
        result += `\`\`\`${block.lang}\n${block.code}\`\`\`\n`;
        result += `  </Tab>\n`;
      }
      result += '</Tabs>';
      
      return result;
    });
    
    fs.writeFileSync(file, content);
    console.log(`Processed: ${file}`);
  }
  
  console.log('Done!');
}

convertCodeGroups();
