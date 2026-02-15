const { mdToPdf } = require("md-to-pdf");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const dir = path.join(__dirname, "markdown");
const outDir = path.join(__dirname, "pdf");
const tempDir = path.join(__dirname, "temp");

// Ensure directories exist
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

const files = fs.readdirSync(dir).filter(f => f.endsWith(".md") && f !== "README.md");

console.log(`Converting ${files.length} files...`);

// Check if file contains mermaid diagrams
function hasMermaid(content) {
  return /```mermaid\n[\s\S]*?```/.test(content);
}

// Render mermaid diagrams to SVGs and return modified content
function renderMermaidDiagrams(content, baseName) {
  const mermaidRegex = /```mermaid\n([\s\S]*?)```/g;
  let match;
  let diagramIndex = 0;
  const diagrams = [];
  
  while ((match = mermaidRegex.exec(content)) !== null) {
    diagramIndex++;
    diagrams.push({
      original: match[0],
      mermaidCode: match[1],
      index: diagramIndex
    });
  }
  
  if (diagrams.length === 0) return content;
  
  console.log(`  Found ${diagrams.length} Mermaid diagrams`);
  
  // Render each diagram
  for (const d of diagrams) {
    const mmdFile = path.join(tempDir, `${baseName}-${d.index}.mmd`);
    const svgFile = path.join(tempDir, `${baseName}-${d.index}.svg`);
    
    fs.writeFileSync(mmdFile, d.mermaidCode);
    
    try {
      execSync(`npx mmdc -i "${mmdFile}" -o "${svgFile}" -b transparent`, {
        cwd: __dirname,
        stdio: "pipe"
      });
      d.svgFile = svgFile;
    } catch (err) {
      console.error(`  Error rendering diagram ${d.index}:`, err.message);
      d.svgFile = null;
    }
  }
  
  // Replace mermaid blocks with SVG references
  let renderedContent = content;
  for (const d of diagrams) {
    if (d.svgFile) {
      const svgFilename = `${baseName}-${d.index}.svg`;
      renderedContent = renderedContent.replace(d.original, `![diagram](./${svgFilename})`);
    }
  }
  
  return renderedContent;
}

async function convertAll() {
  for (const file of files) {
    const input = path.join(dir, file);
    const output = path.join(outDir, file.replace(".md", ".pdf"));
    const baseName = file.replace(".md", "");
    
    try {
      let content = fs.readFileSync(input, "utf-8");
      let inputPath = input;
      let basedir = dir;
      
      // If file has mermaid diagrams, render them first
      if (hasMermaid(content)) {
        console.log(`Processing ${file} (with Mermaid)...`);
        const renderedContent = renderMermaidDiagrams(content, baseName);
        const renderedFile = path.join(tempDir, `${baseName}-rendered.md`);
        fs.writeFileSync(renderedFile, renderedContent);
        inputPath = renderedFile;
        basedir = tempDir;
      }
      
      const pdf = await mdToPdf(
        { path: inputPath },
        { 
          basedir: basedir,
          launch_options: { args: ['--no-sandbox'] },
          pdf_options: {
            format: 'A4',
            margin: { top: '15mm', bottom: '15mm', left: '12mm', right: '12mm' },
            printBackground: true
          },
          css: `
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 10pt; line-height: 1.4; }
            h1 { color: #1a1a1a; border-bottom: 2px solid #333; padding-bottom: 8px; font-size: 20pt; }
            h2 { color: #2a2a2a; border-bottom: 1px solid #ccc; padding-bottom: 5px; margin-top: 20px; font-size: 14pt; }
            h3 { color: #3a3a3a; margin-top: 16px; font-size: 12pt; }
            table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 9pt; }
            th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
            th { background-color: #f5f5f5; font-weight: 600; }
            tr:nth-child(even) { background-color: #fafafa; }
            code { background-color: #f4f4f4; padding: 2px 5px; border-radius: 3px; font-size: 9pt; }
            pre { background-color: #f4f4f4; padding: 10px; border-radius: 5px; overflow-x: auto; }
            img { max-width: 100%; height: auto; display: block; margin: 15px auto; }
            hr { border: none; border-top: 1px solid #eee; margin: 20px 0; }
          `
        }
      );
      fs.writeFileSync(output, pdf.content);
      console.log(`✓ ${file}`);
    } catch (err) {
      console.error(`✗ ${file}: ${err.message}`);
    }
  }
}

convertAll();
