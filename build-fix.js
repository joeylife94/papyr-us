import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Fix the built server file to handle import.meta.dirname properly
const serverFile = path.join(__dirname, 'dist', 'index.js');

if (existsSync(serverFile)) {
  try {
    let content = readFileSync(serverFile, 'utf-8');
    
    // Add proper ES module __dirname polyfill at the top
    const dirnamePolyfill = `
import { fileURLToPath } from 'url';
import path from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
`;

    // Add the polyfill after the first import statement
    const lines = content.split('\n');
    let insertIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('import ') && !lines[i].includes('fileURLToPath')) {
        insertIndex = i + 1;
        break;
      }
    }
    
    // Insert the polyfill
    lines.splice(insertIndex, 0, dirnamePolyfill);
    
    // Replace import.meta.dirname with __dirname
    const fixedContent = lines.join('\n').replace(/import\.meta\.dirname/g, '__dirname');
    
    writeFileSync(serverFile, fixedContent);
    console.log('✓ Build fix applied successfully');
  } catch (error) {
    console.error('Error applying build fix:', error.message);
    console.log('Continuing without fix...');
  }
} else {
  console.log('Build file not found, skipping fix');
}