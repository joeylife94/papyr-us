import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const scriptPath = 'scripts/smoke-test-firebat-api.sh';
const source = readFileSync(scriptPath, 'utf8');

describe('Firebat API smoke-test script', () => {
  it('has valid POSIX shell syntax', () => {
    const result = spawnSync('sh', ['-n', scriptPath], { encoding: 'utf8' });

    expect(result.status, result.stderr).toBe(0);
  });

  it('covers the deployed authentication and document lifecycle', () => {
    expect(source).toContain('/api/auth/login');
    expect(source).toContain('/api/auth/me');
    expect(source).toContain('/api/dashboard/overview');
    expect(source).toContain('/api/pages/$PAGE1_ID/versions');
    expect(source).toContain('/api/pages/$PAGE1_ID/versions/$VERSION_ID/restore');
    expect(source).toContain('page-scoped version isolation');
  });

  it('does not silently read or print the seeded admin password', () => {
    expect(source).not.toContain('read_env_value FIREBAT_SEED_ADMIN_PASSWORD');
    expect(source).not.toContain('printf \'%s\\n\' "$PASSWORD"');
    expect(source).toContain("stty -echo");
    expect(source).toContain('unset PASSWORD');
  });

  it('cleans up created pages on success and failure', () => {
    expect(source).toContain('trap cleanup EXIT INT TERM HUP');
    expect(source).toContain('cleanup_page "$PAGE1_ID"');
    expect(source).toContain('cleanup_page "$PAGE2_ID"');
    expect(source).toContain('/api/trash/$page_id');
  });
});
