import { build } from 'esbuild';

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
      // Bundle all dependencies to avoid missing module errors
      external: [],
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