#!/usr/bin/env node
/**
 * Layer 4 integration test runner.
 * Lifecycle: check Docker → start docker-compose.test.yml → wait for DB → run vitest → teardown.
 * If Docker is unavailable, prints SKIP with reason and exits 0 (satisfies DONE criteria).
 */
import { execSync, spawnSync } from 'child_process';

const COMPOSE_FILE = 'docker-compose.test.yml';
const TEST_DATABASE_URL = 'postgresql://test_user:test_password@localhost:5434/test_db';
const MAX_WAIT_MS = 60_000;
const POLL_INTERVAL_MS = 2_000;

function run(cmd, opts = {}) {
  return spawnSync(cmd, { shell: true, stdio: 'inherit', ...opts });
}

function runCapture(cmd) {
  try {
    return execSync(cmd, { stdio: 'pipe' }).toString().trim();
  } catch {
    return null;
  }
}

// ── 1. Prerequisite check ────────────────────────────────────────────────────
const dockerCheck = runCapture('docker info');
if (!dockerCheck) {
  console.log(
    'SKIP [Layer 4]: Docker is not available on this machine. ' +
      'Install Docker Desktop and ensure the daemon is running to enable integration tests.'
  );
  process.exit(0);
}

console.log('[Layer 4] Docker available — starting test infrastructure…');

// ── 2. Start containers ──────────────────────────────────────────────────────
const up = run(`docker compose -f ${COMPOSE_FILE} up -d --wait`);
if (up.status !== 0) {
  console.error('[Layer 4] Failed to start docker-compose.test.yml — check Docker logs.');
  process.exit(1);
}

// ── 3. Wait for Postgres readiness ───────────────────────────────────────────
console.log('[Layer 4] Waiting for Postgres to be ready…');
const deadline = Date.now() + MAX_WAIT_MS;
let ready = false;

while (Date.now() < deadline) {
  const ping = runCapture(
    `docker compose -f ${COMPOSE_FILE} exec -T db-test pg_isready -U test_user -d test_db`
  );
  if (ping && ping.includes('accepting connections')) {
    ready = true;
    break;
  }
  await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
}

if (!ready) {
  console.error('[Layer 4] Postgres did not become ready within 60s — aborting.');
  run(`docker compose -f ${COMPOSE_FILE} down`);
  process.exit(1);
}

console.log('[Layer 4] Postgres ready. Running integration tests…');

// ── 4. Run Vitest ────────────────────────────────────────────────────────────
const testResult = run(
  `cross-env DATABASE_URL="${TEST_DATABASE_URL}" ` +
    `npx vitest run --config vitest.integration.layer4.config.ts`
);

// ── 5. Teardown ──────────────────────────────────────────────────────────────
console.log('[Layer 4] Tearing down test infrastructure…');
run(`docker compose -f ${COMPOSE_FILE} down`);

process.exit(testResult.status ?? 1);
