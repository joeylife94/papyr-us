/**
 * Layer 2 Domain · Feature-flag & deployment environment invariants.
 * Invariant: business rules encoded in the domain layer must hold regardless of
 * implementation changes — adding new features must not silently break these contracts.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { resolveFeatureFlags } from '../../shared/featureFlags';
import { isDeployedEnvironment } from '../../server/config';

// ─── Feature-flag domain invariants ─────────────────────────────────────────

describe('Domain invariant: personal mode must disable multi-tenant features', () => {
  it('[happy path] personal mode sets FEATURE_TEAMS=false by default', () => {
    const flags = resolveFeatureFlags({ PAPYR_MODE: 'personal' });
    expect(flags.FEATURE_TEAMS).toBe(false);
  });

  it('[violation path] passing enterprise flags into personal mode does not enable FEATURE_ADMIN by default', () => {
    // Invariant: without an explicit env override, personal mode keeps FEATURE_ADMIN off.
    const flags = resolveFeatureFlags({ PAPYR_MODE: 'personal' });
    expect(flags.FEATURE_ADMIN).toBe(false);
  });
});

describe('Domain invariant: team mode must enable collaborative features by default', () => {
  it('[happy path] team mode enables FEATURE_TEAMS', () => {
    const flags = resolveFeatureFlags({ PAPYR_MODE: 'team' });
    expect(flags.FEATURE_TEAMS).toBe(true);
  });

  it('[happy path] team mode enables FEATURE_NOTIFICATIONS', () => {
    const flags = resolveFeatureFlags({ PAPYR_MODE: 'team' });
    expect(flags.FEATURE_NOTIFICATIONS).toBe(true);
  });

  it('[violation path] explicit FEATURE_TEAMS=false overrides team default', () => {
    // Invariant: operator can consciously opt out, but must do so explicitly.
    const flags = resolveFeatureFlags({ PAPYR_MODE: 'team', FEATURE_TEAMS: 'false' });
    expect(flags.FEATURE_TEAMS).toBe(false);
  });
});

describe('Domain invariant: flags object must be fully populated (no missing/undefined keys)', () => {
  const allModes = [undefined, 'personal', 'team', 'unknown-value'];

  it.each(allModes)('resolveFeatureFlags({PAPYR_MODE:%s}) returns all 9 flags', (mode) => {
    const flags = resolveFeatureFlags(mode ? { PAPYR_MODE: mode } : {});
    expect(Object.keys(flags)).toHaveLength(9);
    for (const v of Object.values(flags)) {
      expect(v).toBeDefined();
    }
  });
});

// ─── Deployment environment domain invariants ────────────────────────────────

describe('Domain invariant: isDeployedEnvironment() must correctly detect CI / cloud', () => {
  const envBackup: Record<string, string | undefined> = {};
  const deployVars = [
    'RENDER',
    'RAILWAY_ENVIRONMENT',
    'VERCEL',
    'FLY_APP_NAME',
    'HEROKU_APP_NAME',
    'K_SERVICE',
    'KUBERNETES_SERVICE_HOST',
    'CI',
  ];

  // Save and clear all deployment vars before each test
  const clearDeployVars = () => {
    deployVars.forEach((k) => {
      envBackup[k] = process.env[k];
      delete process.env[k];
    });
  };

  const restoreDeployVars = () => {
    deployVars.forEach((k) => {
      if (envBackup[k] === undefined) delete process.env[k];
      else process.env[k] = envBackup[k];
    });
  };

  afterEach(restoreDeployVars);

  it('[happy path] returns false when NO deployment env vars are set', () => {
    clearDeployVars();
    expect(isDeployedEnvironment()).toBe(false);
  });

  it('[happy path] returns true when CI is set (GitHub Actions, GitLab, etc.)', () => {
    clearDeployVars();
    process.env.CI = 'true';
    expect(isDeployedEnvironment()).toBe(true);
  });

  it('[happy path] returns true when RENDER is set', () => {
    clearDeployVars();
    process.env.RENDER = '1';
    expect(isDeployedEnvironment()).toBe(true);
  });

  it('[violation path] empty string for CI must NOT trigger deployed detection', () => {
    clearDeployVars();
    process.env.CI = ''; // falsy — not a deployed env
    expect(isDeployedEnvironment()).toBe(false);
  });
});
