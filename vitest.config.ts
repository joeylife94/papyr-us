import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['server/**/*.test.{ts,tsx}'],
    exclude: ['server/tests/integration/**', 'server/tests/search-fts.test.ts'],
    setupFiles: './server/tests/setup.ts',
  },
});
