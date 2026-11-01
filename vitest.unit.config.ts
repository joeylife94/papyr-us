import path from 'path';
import { defineConfig } from 'vitest/config';

// Layer 1: Unit tests — pure logic, no network, no DB, no filesystem side effects.
export default defineConfig({
  resolve: {
    // Client modules import shared code through the same alias as vite.config.ts.
    alias: { '@shared': path.resolve(__dirname, './shared') },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/unit/setup.ts'],
  },
});
