import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const baseUrl = process.env.FIREBAT_BASE_URL || 'http://127.0.0.1:8801';
const email = process.env.FIREBAT_SMOKE_EMAIL || 'firebat-ci@example.com';
const password = process.env.FIREBAT_SMOKE_PASSWORD || 'FirebatSmoke!123';
const envFile = process.env.FIREBAT_ENV_FILE || '.env.firebat';
const composeFile = process.env.FIREBAT_COMPOSE_FILE || 'compose.firebat.yml';
const allowDestructive = process.env.FIREBAT_RECOVERY_ALLOW_DESTRUCTIVE === '1';
const expectedVolume = 'firebat-papyr-us-postgres';
const evidenceDir = resolve(process.env.FIREBAT_RECOVERY_DIR || 'firebat-recovery');
const backupFile = resolve(evidenceDir, 'papyr-firebat-recovery.dump');

function fail(message) {
  throw new Error(`[firebat-recovery] ${message}`);
}

function parseEnvFile(path) {
  const values = {};
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index < 1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.capture ? ['pipe', 'pipe', 'pipe'] : 'inherit',
    input: options.input,
    env: process.env,
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const stderr = options.capture ? result.stderr?.toString() : '';
    fail(`${command} ${args.join(' ')} failed with ${result.status}${stderr ? `: ${stderr}` : ''}`);
  }
  return result;
}

const composeArgs = (...args) => ['compose', '--env-file', envFile, '-f', composeFile, ...args];
const dockerCompose = (...args) => run('docker', composeArgs(...args));

async function jsonRequest(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

function getCookieHeader(response) {
  const values =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [response.headers.get('set-cookie')].filter(Boolean);
  return values.map((value) => value.split(';', 1)[0]).join('; ');
}

async function login() {
  const result = await jsonRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (!result.response.ok) {
    fail(`login failed: ${result.response.status} ${JSON.stringify(result.body)}`);
  }
  const cookie = getCookieHeader(result.response);
  if (!cookie.includes('accessToken=')) fail('login did not return accessToken cookie');
  return cookie;
}

async function authedJson(cookie, path, init = {}) {
  return jsonRequest(path, {
    ...init,
    headers: { Cookie: cookie, ...(init.headers || {}) },
  });
}

async function waitForHealthy(timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let last = 'no response';
  while (Date.now() < deadline) {
    try {
      const health = await jsonRequest('/health');
      last = `${health.response.status} ${JSON.stringify(health.body)}`;
      if (
        health.response.ok &&
        health.body.status === 'healthy' &&
        health.body.database === 'ready' &&
        health.body.redis === 'ready'
      ) {
        return health.body;
      }
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  fail(`application did not become healthy: ${last}`);
}

async function assertPage(cookie, pageId, expectedContent) {
  const result = await authedJson(cookie, `/api/pages/${pageId}`);
  if (!result.response.ok) {
    fail(`page read failed: ${result.response.status} ${JSON.stringify(result.body)}`);
  }
  if (result.body.content !== expectedContent) {
    fail(`page content mismatch: expected ${expectedContent}, got ${result.body.content}`);
  }
  return result.body;
}

if (!allowDestructive) {
  fail('refusing destructive restore without FIREBAT_RECOVERY_ALLOW_DESTRUCTIVE=1');
}
if (envFile !== '.env.firebat') {
  fail(`refusing non-Firebat env file: ${envFile}`);
}
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(baseUrl)) {
  fail(`refusing non-local recovery target: ${baseUrl}`);
}

const firebatEnv = parseEnvFile(envFile);
const dbUser = firebatEnv.POSTGRES_USER;
const dbName = firebatEnv.POSTGRES_DB;
if (!dbUser || !dbName) fail('POSTGRES_USER and POSTGRES_DB are required in .env.firebat');

const mountInspect = run(
  'docker',
  ['inspect', '--format', '{{range .Mounts}}{{println .Name .Destination}}{{end}}', 'firebat-papyr-us-db'],
  { capture: true }
).stdout.toString();
if (!mountInspect.includes(`${expectedVolume} /var/lib/postgresql/data`)) {
  fail(`refusing destructive restore: expected disposable Firebat volume ${expectedVolume}`);
}

const version = await jsonRequest('/version');
if (!version.response.ok || !version.body.revision || version.body.revision === 'unknown') {
  fail(`invalid /version response: ${version.response.status} ${JSON.stringify(version.body)}`);
}
await waitForHealthy();

let cookie = await login();
const stamp = `${Date.now()}-${process.pid}`;
const originalContent = `gj08-before-backup-${stamp}`;
const mutatedContent = `gj08-after-backup-${stamp}`;

const teamCreate = await authedJson(cookie, '/api/teams', {
  method: 'POST',
  body: JSON.stringify({
    name: `gj08-${stamp}`,
    displayName: `GJ08 Recovery ${stamp}`,
    description: 'Disposable Firebat recovery proof team',
  }),
});
if (teamCreate.response.status !== 201) {
  fail(`team creation failed: ${teamCreate.response.status} ${JSON.stringify(teamCreate.body)}`);
}

const pageCreate = await authedJson(cookie, '/api/pages', {
  method: 'POST',
  body: JSON.stringify({
    title: `GJ08 Recovery ${stamp}`,
    slug: `gj08-recovery-${stamp}`,
    content: originalContent,
    folder: 'docs',
    author: 'Firebat Recovery CI',
    tags: ['gj08', 'recovery'],
    teamId: teamCreate.body.id,
  }),
});
if (pageCreate.response.status !== 201) {
  fail(`page creation failed: ${pageCreate.response.status} ${JSON.stringify(pageCreate.body)}`);
}
const pageId = String(pageCreate.body.id);
await assertPage(cookie, pageId, originalContent);

// Recreate the accepted Firebat containers without deleting named volumes.
dockerCompose('up', '-d', '--force-recreate', 'db', 'redis');
dockerCompose('up', '-d', '--force-recreate', 'app');
await waitForHealthy();
cookie = await login();
await assertPage(cookie, pageId, originalContent);

mkdirSync(evidenceDir, { recursive: true });
const backup = run(
  'docker',
  composeArgs('exec', '-T', 'db', 'pg_dump', '-U', dbUser, '-d', dbName, '--format=custom'),
  { capture: true }
).stdout;
writeFileSync(backupFile, backup);
if (statSync(backupFile).size <= 0) fail('backup artifact is empty');

const mutate = await authedJson(cookie, `/api/pages/${pageId}`, {
  method: 'PUT',
  body: JSON.stringify({ content: mutatedContent }),
});
if (!mutate.response.ok) {
  fail(`destructive mutation failed: ${mutate.response.status} ${JSON.stringify(mutate.body)}`);
}
await assertPage(cookie, pageId, mutatedContent);

// Stop the app before restoring the full database to avoid application-held connections.
dockerCompose('stop', 'app');
const restoreInput = readFileSync(backupFile);
run(
  'docker',
  composeArgs(
    'exec',
    '-T',
    'db',
    'pg_restore',
    '-U',
    dbUser,
    '-d',
    dbName,
    '--clean',
    '--if-exists',
    '--no-owner',
    '--no-privileges'
  ),
  { capture: true, input: restoreInput }
);

dockerCompose('up', '-d', 'app');
await waitForHealthy();
cookie = await login();
await assertPage(cookie, pageId, originalContent);

// Fresh app recreation proves the restored database state remains durable beyond restore process memory.
dockerCompose('up', '-d', '--force-recreate', 'app');
await waitForHealthy();
cookie = await login();
await assertPage(cookie, pageId, originalContent);

console.log(
  JSON.stringify({
    status: 'passed',
    revision: version.body.revision,
    pageId,
    teamId: teamCreate.body.id,
    recreatePersistence: 'passed',
    backupFile,
    backupBytes: statSync(backupFile).size,
    destructiveMutation: 'passed',
    restore: 'passed',
    postRestoreFreshRead: 'passed',
  })
);
