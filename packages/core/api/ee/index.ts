import { readdirSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Automatically import all .js files in this directory (except index.js)
// At runtime, we're in the compiled dist directory where files are .js
const enterpriseFeaturesDir = __dirname;
const files = readdirSync(enterpriseFeaturesDir)
  .filter(file => file.endsWith('.js') && file !== 'index.js' && !file.endsWith('.js.map'));

// Dynamically import all files (side-effect imports)
for (const file of files) {
  await import(`./${file}`);
}

