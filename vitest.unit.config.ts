import { defineConfig } from 'vitest/config';

// Layer 1: Unit tests — pure logic, no network, no DB, no filesystem side effects.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/unit/setup.ts'],
  },
});
