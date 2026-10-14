import { spawnSync } from 'node:child_process';

const checks = ['test:static', 'test:unit', 'test:domain', 'test:contract', 'test:smoke', 'build'];

// Node refuses to spawn .cmd files without a shell (EINVAL since the CVE-2024-27980 fix),
// so on Windows npm runs through the shell. The command line is built only from the fixed
// script names above.
function runNpmScript(script) {
  if (process.platform === 'win32') {
    return spawnSync(`npm run ${script}`, { stdio: 'inherit', env: process.env, shell: true });
  }
  return spawnSync('npm', ['run', script], { stdio: 'inherit', env: process.env });
}

for (const check of checks) {
  console.log(`\n[verify:contributor] npm run ${check}`);

  const result = runNpmScript(check);

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
