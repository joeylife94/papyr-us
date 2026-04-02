import { defineConfig } from 'vitest/config';

// Layer 3: Contract tests — lock API response shapes with Zod schemas + fixtures.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/contract/**/*.test.{ts,tsx}'],
  },
});
