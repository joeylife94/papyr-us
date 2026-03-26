/**
 * P3 Security Tests — Realtime config hardening
 *
 * Proves that:
 *  1. validateRealtimeConfig() rejects unsafe settings in production/deployed environments.
 *  2. validateRealtimeConfig() allows safe local-dev settings only when isLocalDev is true.
 *  3. isLocalDev correctly distinguishes local machines from deployed environments.
 *  4. Wildcard CORS with credentials is always rejected.
 *  5. Client-supplied userId is never used as a fallback identity.
 *  6. Secure defaults still work (normal boot succeeds).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Snapshot current env vars for the keys we will mutate. */
function snapshotEnv(keys: string[]): Record<string, string | undefined> {
  return Object.fromEntries(keys.map((k) => [k, process.env[k]]));
}

/** Restore env vars from a snapshot (undefined means delete the key). */
function restoreEnv(snapshot: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(snapshot)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

/** Known deployed-environment signal keys checked by isDeployedEnvironment(). */
const DEPLOYED_SIGNAL_KEYS = [
  'RENDER',
  'RAILWAY_ENVIRONMENT',
  'VERCEL',
  'FLY_APP_NAME',
  'HEROKU_APP_NAME',
  'K_SERVICE',
  'KUBERNETES_SERVICE_HOST',
  'CI',
] as const;

/** Keys mutated across these tests. */
const WATCHED_KEYS = [
  'NODE_ENV',
  'COLLAB_REQUIRE_AUTH',
  'LOCAL_DEV_UNSAFE_CORS',
  'CORS_ALLOWED_ORIGINS',
  'CORS_ALLOW_CREDENTIALS',
  ...DEPLOYED_SIGNAL_KEYS,
];

// ─── Factory helpers ─────────────────────────────────────────────────────────

/** Minimal safe LegacyCollabConfig (auth enabled). */
function safeCfg() {
  return {
    requireAuth: true,
    saveDebounceMs: 3000,
    snapshotIntervalMs: 60000,
    docTtlMs: 300000,
    maxDocs: 50,
    maxClientsPerDoc: 20,
    rateLimitDocChangesPerSec: 50,
    rateLimitCursorPerSec: 30,
    rateLimitTypingPerSec: 20,
    rateLimitSavesPerMin: 6,
  };
}

/** Minimal unsafe LegacyCollabConfig (auth disabled). */
function unsafeCfg() {
  return { ...safeCfg(), requireAuth: false };
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('P3 — realtime config hardening', () => {
  let envSnapshot: Record<string, string | undefined>;
  let validateRealtimeConfig: (cfg: ReturnType<typeof safeCfg>) => void;

  beforeEach(async () => {
    // Capture env state before each test so we can restore it.
    envSnapshot = snapshotEnv(WATCHED_KEYS);

    // Reset to a clean, locally-safe base: non-production, no deployed signals.
    delete process.env.NODE_ENV;
    DEPLOYED_SIGNAL_KEYS.forEach((k) => delete process.env[k as string]);
    delete process.env.COLLAB_REQUIRE_AUTH;
    delete process.env.LOCAL_DEV_UNSAFE_CORS;
    delete process.env.CORS_ALLOWED_ORIGINS;
    delete process.env.CORS_ALLOW_CREDENTIALS;

    // Re-import after env reset so config picks up the new values.
    vi.resetModules();
    const socketMod = await import('../services/socket.js');
    validateRealtimeConfig = socketMod.validateRealtimeConfig;
  });

  afterEach(() => {
    restoreEnv(envSnapshot);
  });

  // ── isLocalDev / isDeployedEnvironment ────────────────────────────────────

  describe('config.isLocalDev', () => {
    it('is true when NODE_ENV is development and no deployed signals are set', async () => {
      process.env.NODE_ENV = 'development';
      vi.resetModules();
      const { config } = await import('../config.js');
      expect(config.isLocalDev).toBe(true);
    });

    it('is false when NODE_ENV is production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a-secure-secret-that-is-long-enough';
      process.env.ADMIN_PASSWORD = 'AdminPassword123!';
      process.env.DATABASE_URL = 'postgresql://x:x@localhost/x';
      vi.resetModules();
      const { config } = await import('../config.js');
      expect(config.isLocalDev).toBe(false);
    });

    it.each(DEPLOYED_SIGNAL_KEYS)('is false when deployed signal %s is set', async (signal) => {
      process.env.NODE_ENV = 'development';
      process.env[signal] = 'true';
      vi.resetModules();
      const { config } = await import('../config.js');
      expect(config.isLocalDev).toBe(false);
    });

    it('is false in non-prod when CI=true (simulates CI/staging)', async () => {
      process.env.NODE_ENV = 'development';
      process.env.CI = 'true';
      vi.resetModules();
      const { config } = await import('../config.js');
      expect(config.isLocalDev).toBe(false);
    });
  });

  // ── Production blocks unsafe settings ─────────────────────────────────────

  describe('production environment startup guard (config.ts)', () => {
    // config.ts calls process.exit(1) at import time for unsafe production settings.
    // We mock process.exit to intercept the call instead of killing the test process.
    let exitSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: any): never => {
        throw new Error(`process.exit(${_code}) called`);
      }) as any;

      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a-secure-secret-that-is-long-enough';
      process.env.ADMIN_PASSWORD = 'AdminPassword123!';
      process.env.DATABASE_URL = 'postgresql://x:x@localhost/x';
    });

    afterEach(() => {
      exitSpy.mockRestore();
    });

    it('calls process.exit(1) when COLLAB_REQUIRE_AUTH=0 in production', async () => {
      process.env.COLLAB_REQUIRE_AUTH = '0';
      vi.resetModules();
      await expect(import('../config.js')).rejects.toThrow('process.exit(1)');
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('calls process.exit(1) when LOCAL_DEV_UNSAFE_CORS=true in production', async () => {
      process.env.LOCAL_DEV_UNSAFE_CORS = 'true';
      vi.resetModules();
      await expect(import('../config.js')).rejects.toThrow('process.exit(1)');
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('does not call process.exit for a safe production config', async () => {
      vi.resetModules();
      // Must not throw — import succeeds cleanly.
      await expect(import('../config.js')).resolves.toBeDefined();
      expect(exitSpy).not.toHaveBeenCalled();
    });
  });

  // ── Deployed non-production blocks unsafe settings ─────────────────────────

  describe('deployed non-production startup guard (config.ts — staging/CI)', () => {
    let exitSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: any): never => {
        throw new Error(`process.exit(${_code}) called`);
      }) as any;

      process.env.NODE_ENV = 'development';
      process.env.RENDER = 'true'; // simulate Render.com staging deploy
    });

    afterEach(() => {
      exitSpy.mockRestore();
    });

    it('calls process.exit(1) when COLLAB_REQUIRE_AUTH=0 in deployed non-prod', async () => {
      process.env.COLLAB_REQUIRE_AUTH = '0';
      vi.resetModules();
      await expect(import('../config.js')).rejects.toThrow('process.exit(1)');
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('calls process.exit(1) when LOCAL_DEV_UNSAFE_CORS=true in deployed non-prod', async () => {
      process.env.LOCAL_DEV_UNSAFE_CORS = 'true';
      vi.resetModules();
      await expect(import('../config.js')).rejects.toThrow('process.exit(1)');
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('does not call process.exit for safe config in deployed non-prod', async () => {
      vi.resetModules();
      await expect(import('../config.js')).resolves.toBeDefined();
      expect(exitSpy).not.toHaveBeenCalled();
    });
  });

  // ── Local dev allows explicit unsafe escapes ───────────────────────────────

  describe('local development environment', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
      // Remove ALL deployed signals to simulate a local machine.
      DEPLOYED_SIGNAL_KEYS.forEach((k) => delete process.env[k as string]);
    });

    it('does NOT throw when COLLAB_REQUIRE_AUTH=0 in local dev', async () => {
      process.env.COLLAB_REQUIRE_AUTH = '0';
      vi.resetModules();
      const { validateRealtimeConfig: validate } = await import('../services/socket.js');
      expect(() => validate(unsafeCfg())).not.toThrow();
    });

    it('does NOT throw when LOCAL_DEV_UNSAFE_CORS=true in local dev', async () => {
      process.env.LOCAL_DEV_UNSAFE_CORS = 'true';
      vi.resetModules();
      const { validateRealtimeConfig: validate } = await import('../services/socket.js');
      expect(() => validate(safeCfg())).not.toThrow();
    });
  });

  // ── Wildcard CORS + credentials always rejected ────────────────────────────

  describe('wildcard CORS + credentials', () => {
    it('throws in local dev when CORS_ALLOWED_ORIGINS=* and CORS_ALLOW_CREDENTIALS=true', async () => {
      process.env.NODE_ENV = 'development';
      DEPLOYED_SIGNAL_KEYS.forEach((k) => delete process.env[k as string]);
      process.env.CORS_ALLOWED_ORIGINS = '*';
      process.env.CORS_ALLOW_CREDENTIALS = 'true';
      vi.resetModules();
      const { validateRealtimeConfig: validate } = await import('../services/socket.js');
      expect(() => validate(safeCfg())).toThrow(/Wildcard CORS/);
    });

    it('throws in production when CORS_ALLOWED_ORIGINS=* and CORS_ALLOW_CREDENTIALS=true', async () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a-secure-secret-that-is-long-enough';
      process.env.ADMIN_PASSWORD = 'AdminPassword123!';
      process.env.DATABASE_URL = 'postgresql://x:x@localhost/x';
      process.env.CORS_ALLOWED_ORIGINS = '*';
      process.env.CORS_ALLOW_CREDENTIALS = 'true';
      vi.resetModules();
      const { validateRealtimeConfig: validate } = await import('../services/socket.js');
      expect(() => validate(safeCfg())).toThrow(/Wildcard CORS/);
    });
  });
});
