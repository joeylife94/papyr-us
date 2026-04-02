import { defineConfig } from 'vitest/config';

// Layer 4: Integration tests — require a real Postgres instance (via Docker Compose).
// Run via: node scripts/run-layer4.mjs  (which handles docker-compose lifecycle)
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/integration-layer4/**/*.test.{ts,tsx}'],
    // No setup removing DATABASE_URL — these tests NEED a real database
    testTimeout: 30000,
  },
});
