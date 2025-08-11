import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// https://vitejs.dev/config/
export default defineConfig({
  root: path.resolve(__dirname, "client"),
  base: "/papyr-us/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client/src"),
    },
  },
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    rollupOptions: {
      output: {
        manualChunks: {
          // React and core dependencies
          'react-vendor': ['react', 'react-dom'],
          
          // UI libraries
          'ui-vendor': [
            '@radix-ui/react-accordion',
            '@radix-ui/react-alert-dialog',
            '@radix-ui/react-avatar',
            '@radix-ui/react-checkbox',
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-popover',
            '@radix-ui/react-select',
            '@radix-ui/react-tabs',
            '@radix-ui/react-toast',
            'framer-motion'
          ],
          
          // Utility libraries
          'utils-vendor': [
            'clsx',
            'class-variance-authority',
            'tailwind-merge',
            'date-fns',
            'zod'
          ],
          
          // Query and routing
          'app-vendor': [
            '@tanstack/react-query',
            'wouter'
          ],
          
          // Markdown and content
          'content-vendor': [
            'remark',
            'remark-gfm',
            'remark-parse',
            'remark-rehype',
            'rehype-highlight',
            'rehype-stringify',
            'gray-matter'
          ]
        }
      }
    },
    // Increase chunk size warning limit
    chunkSizeWarningLimit: 600,
    // Enable source maps for better debugging
    sourcemap: false
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.NODE_ENV === 'test' ? 'http://localhost:5001' : 'http://app:5001',
        changeOrigin: true,
      },
    },
  },
});