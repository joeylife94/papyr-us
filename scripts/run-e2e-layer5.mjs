#!/usr/bin/env node
/**
 * Layer 5 E2E test runner.
 * Lifecycle: check Docker → start docker-compose.test.yml → wait for DB →
 *            inject DATABASE_URL + REDIS_URL → run Playwright → teardown (always).
 * If Docker is unavailable, prints FATAL error and exits 1 (hard fail).
 * No manual DATABASE_URL setup required.
 */
import { execSync, spawnSync } from 'child_process';

const COMPOSE_FILE = 'docker-compose.test.yml';
const TEST_DATABASE_URL = 'postgresql://test_user:test_password@localhost:5434/test_db';
const TEST_REDIS_URL = 'redis://localhost:6380';
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
  console.error(
    'FATAL [Layer 5 E2E]: Docker is not available on this machine. ' +
      'Install Docker Desktop and ensure the daemon is running to enable E2E tests.'
  );
  process.exit(1);
}

console.log('[Layer 5 E2E] Docker available — starting test infrastructure…');

// ── 2. Start containers ──────────────────────────────────────────────────────
const up = run(`docker compose -f ${COMPOSE_FILE} up -d --wait`);
if (up.status !== 0) {
  console.error('[Layer 5 E2E] Failed to start docker-compose.test.yml — check Docker logs.');
  process.exit(1);
}

// Register signal handlers so containers are torn down on Ctrl-C / SIGTERM.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`\n[Layer 5 E2E] ${sig} received — tearing down test infrastructure…`);
    run(`docker compose -f ${COMPOSE_FILE} down`);
    process.exit(1);
  });
}

// ── Guarded section: teardown runs whether tests pass, fail, or throw ────────
let exitCode = 1;
try {
  // ── 3. Wait for Postgres readiness ────────────────────────────────────────
  console.log('[Layer 5 E2E] Waiting for Postgres to be ready…');
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
    console.error('[Layer 5 E2E] Postgres did not become ready within 60s — aborting.');
    // exitCode stays 1; falls through to finally for teardown
  } else {
    // ── 4. Inject credentials and run Playwright ────────────────────────────
    console.log(
      '[Layer 5 E2E] Infrastructure ready — injecting DATABASE_URL and running Playwright tests…'
    );
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.REDIS_URL = TEST_REDIS_URL;

    const result = run(
      'npx playwright test --config playwright.layer5.config.ts --project=chromium'
    );
    exitCode = result.status ?? 1;
  }
} finally {
  // ── 5. Teardown (always executes, even on uncaught exceptions) ────────────
  console.log('[Layer 5 E2E] Tearing down test infrastructure…');
  run(`docker compose -f ${COMPOSE_FILE} down`);
}

process.exit(exitCode);
