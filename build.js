import { build } from 'esbuild';
import { rmSync } from 'fs';

// Clean the dist directory before building
rmSync('dist', { recursive: true, force: true });

// Custom build script to handle dependencies properly
const buildServer = async () => {
  try {
    await build({
      entryPoints: ['server/index.ts'],
      bundle: true,
      platform: 'node',
      target: 'node18',
      format: 'esm',
      outdir: 'dist',
      // Exclude problematic dependencies from the bundle
      external: [
        '@babel/preset-typescript', 
        'lightningcss',
        'bcrypt',
        'dotenv', // Exclude dotenv from bundling
        'depd'
      ],
      minify: false,
      sourcemap: false,
      logLevel: 'info',
      define: {
        'process.env.NODE_ENV': '"production"'
      }
    });
    console.log('✓ Server build completed successfully');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
};

buildServer();