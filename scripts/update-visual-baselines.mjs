#!/usr/bin/env node
/**
 * Update VRT baselines inside the official Playwright Linux Docker container.
 * This guarantees snapshots are generated on Linux (Chromium's reference
 * rendering surface) regardless of the host OS.
 *
 * Usage: npm run test:visual:update
 *        (requires Docker Desktop or Docker Engine to be running)
 */
import { spawnSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

// Keep in sync with @playwright/test version in package.json
const PLAYWRIGHT_IMAGE = 'mcr.microsoft.com/playwright:v1.54.2-jammy';

// ── Pre-flight: verify Docker is reachable ────────────────────────────────────
const dockerCheck = spawnSync('docker', ['info'], { stdio: 'pipe' });
if (dockerCheck.status !== 0) {
  console.error(
    '[update-visual-baselines] Docker is not available. ' +
      'Start Docker Desktop (or Docker Engine) and retry.'
  );
  process.exit(1);
}

console.log(`[update-visual-baselines] Using image: ${PLAYWRIGHT_IMAGE}`);
console.log('[update-visual-baselines] Regenerating snapshots inside Linux container…');

const result = spawnSync(
  'docker',
  [
    'run',
    '--rm',
    '--ipc=host',
    '-v',
    `${projectRoot}:/work`,
    '-w',
    '/work',
    PLAYWRIGHT_IMAGE,
    '/bin/bash',                     // 1. bash 쉘을 호출
    '-c',                            // 2. 커맨드 실행 플래그
    'npm install && npx playwright test --config playwright.visual.config.ts --project=chromium --update-snapshots' // 3. 설치 후 테스트 실행
  ],
  { stdio: 'inherit', shell: false }
);

process.exit(result.status ?? 1);
