import { spawnSync } from 'node:child_process';

const checks = [
  'test:static',
  'test:unit',
  'test:domain',
  'test:contract',
  'test:smoke',
  'build',
];

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

for (const check of checks) {
  console.log(`\n[verify:contributor] npm run ${check}`);

  const result = spawnSync(npmCommand, ['run', check], {
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    console.error(`[verify:contributor] failed to start npm run ${check}:`, result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`[verify:contributor] npm run ${check} failed with exit code ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

console.log('\n[verify:contributor] all baseline contributor checks passed');
