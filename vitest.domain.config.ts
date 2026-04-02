import { defineConfig } from 'vitest/config';

// Layer 2: Domain invariant tests — business rules that must never silently break.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/domain/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/domain/setup.ts'],
  },
});
