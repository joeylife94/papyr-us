#!/usr/bin/env node
/**
 * Regenerate Layer 6 visual baselines through the canonical Docker runner.
 *
 * This intentionally delegates infrastructure, Playwright image selection,
 * database wiring, and teardown to run-visual-layer6.mjs so compare and update
 * modes cannot drift apart.
 */
import { spawnSync } from 'child_process';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const runner = resolve(__dirname, 'run-visual-layer6.mjs');

const result = spawnSync(process.execPath, [runner, '--update-snapshots'], {
  stdio: 'inherit',
  shell: false,
});

process.exit(result.status ?? 1);
