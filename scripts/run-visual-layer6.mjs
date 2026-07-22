#!/usr/bin/env node
/**
 * Layer 6 Visual & A11y test runner -- Source of Truth via Docker.
 *
 * Playwright runs inside the pinned official Playwright Linux image so browser
 * rendering is independent from the host OS. Pass `--update-snapshots` to
 * regenerate committed baselines through exactly the same infrastructure.
 */
import { execSync, spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

const COMPOSE_FILE = 'docker-compose.test.yml';
const COMPOSE_PROJECT = 'papyrus-visual';
// Keep in sync with @playwright/test in package-lock.json.
const PLAYWRIGHT_IMAGE = 'mcr.microsoft.com/playwright:v1.54.2-jammy';
const TEST_DATABASE_URL = 'postgresql://test_user:test_password@db-test:5432/test_db';
const TEST_REDIS_URL = 'redis://redis-test:6379';
const NM_VOLUME = 'papyrus-visual-node-modules';
const COMPOSE_NETWORK = `${COMPOSE_PROJECT}_default`;
const UPDATE_SNAPSHOTS = process.argv.includes('--update-snapshots');

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

const dockerCheck = runCapture('docker info');
if (!dockerCheck) {
  console.error(
    'Fatal: Docker is not running. Visual tests MUST run in a Linux container to ensure Source of Truth.'
  );
  process.exit(1);
}

console.log(
  `[Layer 6 Visual] Docker available -- ${UPDATE_SNAPSHOTS ? 'updating baselines' : 'running comparisons'}...`
);

const up = spawnInherit('docker', [
  'compose',
  '-p',
  COMPOSE_PROJECT,
  '-f',
  COMPOSE_FILE,
  'up',
  '-d',
  '--wait',
]);
if (up.status !== 0) {
  console.error('[Layer 6 Visual] Failed to start docker-compose.test.yml -- check Docker logs.');
  process.exit(1);
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`\n[Layer 6 Visual] ${sig} received -- tearing down test infrastructure...`);
    spawnInherit('docker', ['compose', '-p', COMPOSE_PROJECT, '-f', COMPOSE_FILE, 'down']);
    process.exit(1);
  });
}

let exitCode = 1;
try {
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
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  if (!ready) {
    console.error('[Layer 6 Visual] Postgres did not become ready within 60s -- aborting.');
  } else {
    console.log(
      '[Layer 6 Visual] Infrastructure ready -- launching Playwright inside Linux container...\n' +
        `  Image  : ${PLAYWRIGHT_IMAGE}\n` +
        `  Network: ${COMPOSE_NETWORK}\n` +
        `  Mode   : ${UPDATE_SNAPSHOTS ? 'update snapshots' : 'compare snapshots'}`
    );

    const updateFlag = UPDATE_SNAPSHOTS ? ' --update-snapshots' : '';
    const containerCmd =
      'npm ci --ignore-scripts && ' +
      `npx playwright test --config playwright.visual.config.ts --project=chromium${updateFlag}`;

    const result = spawnInherit('docker', [
      'run',
      '--rm',
      '--network',
      COMPOSE_NETWORK,
      '--ipc=host',
      '-v',
      `${PROJECT_ROOT}:/work`,
      '-v',
      `${NM_VOLUME}:/work/node_modules`,
      '-w',
      '/work',
      '-e',
      `DATABASE_URL=${TEST_DATABASE_URL}`,
      '-e',
      `REDIS_URL=${TEST_REDIS_URL}`,
      '-e',
      'NODE_ENV=test',
      '-e',
      'CI=true',
      PLAYWRIGHT_IMAGE,
      '/bin/bash',
      '-c',
      containerCmd,
    ]);

    exitCode = result.status ?? 1;
  }
} finally {
  console.log('[Layer 6 Visual] Tearing down test infrastructure...');
  spawnInherit('docker', ['compose', '-p', COMPOSE_PROJECT, '-f', COMPOSE_FILE, 'down']);
}

process.exit(exitCode);
