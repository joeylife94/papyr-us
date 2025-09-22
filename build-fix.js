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

    // Simple and safe approach - just replace import.meta.dirname with process.cwd()
    // This avoids any import conflicts and works reliably in production
    const fixedContent = content.replace(/import\.meta\.dirname/g, 'process.cwd()');

    writeFileSync(serverFile, fixedContent);
    console.log(
      '✓ Build fix applied successfully - replaced import.meta.dirname with process.cwd()'
    );
  } catch (error) {
    console.error('Error applying build fix:', error.message);
    console.log('Continuing without fix...');
  }
} else {
  console.log('Build file not found, skipping fix');
}
