#!/usr/bin/env node
/**
 * Layer 6 Visual & A11y test runner -- Source of Truth via Docker.
 *
 * Playwright ITSELF runs inside the official Playwright Linux image so
 * browser rendering (anti-aliasing, sub-pixel layout, font rasterisation) is
 * always performed by the same Chromium build regardless of the host OS.
 *
 * Lifecycle:
 *   1. Fail-fast: Docker daemon must be running (exit 1 if not).
 *   2. Start docker-compose.test.yml (Postgres + Redis).
 *   3. Wait for Postgres readiness.
 *   4. Run `npx playwright test` INSIDE the official Playwright Linux container
 *      connected to the compose network so the bundled app server can reach DB.
 *   5. Teardown compose stack (always runs, even on error/signal).
 *
 * node_modules strategy: a named Docker volume (NM_VOLUME) shadows the
 * host's node_modules directory inside the container. Linux-compatible binaries
 * are installed once on first run and cached for subsequent runs. Host
 * node_modules (Windows/macOS binaries) are never modified.
 */
import { execSync, spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

const COMPOSE_FILE = 'docker-compose.test.yml';
// Explicit project name avoids collisions with other compose stacks.
const COMPOSE_PROJECT = 'papyrus-visual';
// Keep in sync with @playwright/test version in package.json devDependencies.
const PLAYWRIGHT_IMAGE = 'mcr.microsoft.com/playwright:v1.54.2-jammy';
// Compose-network service-name URLs -- resolvable only from inside the network.
const TEST_DATABASE_URL = 'postgresql://test_user:test_password@db-test:5432/test_db';
const TEST_REDIS_URL = 'redis://redis-test:6379';
// Named volume caches Linux node_modules between container runs.
const NM_VOLUME = 'papyrus-visual-node-modules';
// Compose assigns <project>_default automatically.
const COMPOSE_NETWORK = `${COMPOSE_PROJECT}_default`;

const MAX_WAIT_MS = 60_000;
const POLL_INTERVAL_MS = 2_000;

function spawnInherit(bin, args, opts = {}) {
  return spawnSync(bin, args, { stdio: 'inherit', shell: false, ...opts });
}

function runCapture(cmd) {
  try {
    return execSync(cmd, { stdio: 'pipe' }).toString().trim();
  } catch {
    return null;
  }
}

// -- 1. Fail-fast: Docker daemon must be running ---------------------------------
const dockerCheck = runCapture('docker info');
if (!dockerCheck) {
  console.error(
    'Fatal: Docker is not running. Visual tests MUST run in a Linux container to ensure Source of Truth.'
  );
  process.exit(1);
}

console.log('[Layer 6 Visual] Docker available -- starting test infrastructure...');

// -- 2. Start DB + Redis containers ----------------------------------------------
const up = spawnInherit('docker', [
  'compose', '-p', COMPOSE_PROJECT, '-f', COMPOSE_FILE, 'up', '-d', '--wait',
]);
if (up.status !== 0) {
  console.error('[Layer 6 Visual] Failed to start docker-compose.test.yml -- check Docker logs.');
  process.exit(1);
}

// Ensure containers are torn down on Ctrl-C / SIGTERM.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`\n[Layer 6 Visual] ${sig} received -- tearing down test infrastructure...`);
    spawnInherit('docker', ['compose', '-p', COMPOSE_PROJECT, '-f', COMPOSE_FILE, 'down']);
    process.exit(1);
  });
}

// -- Guarded section: teardown always runs ---------------------------------------
let exitCode = 1;
try {
  // -- 3. Wait for Postgres readiness --------------------------------------------
  console.log('[Layer 6 Visual] Waiting for Postgres to be ready...');
  const deadline = Date.now() + MAX_WAIT_MS;
  let ready = false;

  while (Date.now() < deadline) {
    const ping = runCapture(
      `docker compose -p ${COMPOSE_PROJECT} -f ${COMPOSE_FILE} exec -T db-test pg_isready -U test_user -d test_db`
    );
    if (ping && ping.includes('accepting connections')) {
      ready = true;
      break;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  if (!ready) {
    console.error('[Layer 6 Visual] Postgres did not become ready within 60s -- aborting.');
  } else {
    // -- 4. Run Playwright INSIDE the official Linux container -------------------
    console.log(
      '[Layer 6 Visual] Infrastructure ready -- launching Playwright inside Linux container...\n' +
        `  Image  : ${PLAYWRIGHT_IMAGE}\n` +
        `  Network: ${COMPOSE_NETWORK}`
    );

    // Shell command executed inside the container:
    //  - npm install ensures Linux-compatible binaries and respects the cached
    //    named volume; --ignore-scripts suppresses husky/prepare hooks.
    //  - playwright test runs against the visual config, chromium-only.
    const containerCmd =
      'npm install --ignore-scripts && ' +
      'npx playwright test --config playwright.visual.config.ts --project=chromium';

    const result = spawnInherit('docker', [
      'run', '--rm',
      '--network', COMPOSE_NETWORK,
      '--ipc=host',
      // Mount project root; the named volume shadows host node_modules so
      // Windows/macOS binaries are never exposed inside the container.
      '-v', `${PROJECT_ROOT}:/work`,
      '-v', `${NM_VOLUME}:/work/node_modules`,
      '-w', '/work',
      // Inject DB/Redis URLs using compose-network service hostnames.
      '-e', `DATABASE_URL=${TEST_DATABASE_URL}`,
      '-e', `REDIS_URL=${TEST_REDIS_URL}`,
      '-e', 'NODE_ENV=test',
      '-e', 'CI=true',
      PLAYWRIGHT_IMAGE,
      '/bin/bash', '-c', containerCmd,
    ]);

    exitCode = result.status ?? 1;
  }
} finally {
  // -- 5. Teardown (always executes, even on uncaught exceptions) ----------------
  console.log('[Layer 6 Visual] Tearing down test infrastructure...');
  spawnInherit('docker', ['compose', '-p', COMPOSE_PROJECT, '-f', COMPOSE_FILE, 'down']);
}

process.exit(exitCode);
