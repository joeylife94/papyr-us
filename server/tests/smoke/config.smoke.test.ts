import { describe, it, expect, vi } from 'vitest';

// Helper to (re)load config with controlled env
async function loadConfigWithEnv(env: Record<string, string | undefined>) {
  const original = { ...process.env };
  // Apply overrides: delete key if value is undefined, else set string value
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete (process.env as any)[k];
    else (process.env as any)[k] = v;
  }
  // Ensure the module reads fresh env
  vi.resetModules();
  const { config } = await import('../../config.ts');
  // Take a snapshot so getters (which read process.env) are evaluated under this env
  const snapshot = {
    port: config.port,
    nodeEnv: config.nodeEnv,
    host: config.host,
    isProduction: config.isProduction,
    isDevelopment: config.isDevelopment,
    isReplit: config.isReplit,
  } as const;
  // restore original env for next tests
  // First clear all keys set by env overrides
  for (const k of Object.keys(env)) delete (process.env as any)[k];
  Object.assign(process.env, original);
  return snapshot;
}

describe('smoke: config defaults', () => {
  it('uses development defaults when env is not set', async () => {
    const config = await loadConfigWithEnv({
      NODE_ENV: undefined,
      PORT: undefined,
      REPL_ID: undefined,
    });
    expect(config.nodeEnv).toBe('development');
    expect(config.port).toBe(5001);
    expect(config.host).toBe('localhost');
  });

  it('host is 0.0.0.0 in production', async () => {
    const config = await loadConfigWithEnv({ NODE_ENV: 'production', REPL_ID: undefined });
    expect(config.isProduction).toBe(true);
    expect(config.host).toBe('0.0.0.0');
  });

  it('host is 0.0.0.0 on Replit even if not production', async () => {
    const config = await loadConfigWithEnv({ NODE_ENV: 'development', REPL_ID: 'dummy' });
    expect(config.isDevelopment).toBe(true);
    expect(config.isReplit).toBe(true);
    expect(config.host).toBe('0.0.0.0');
  });
});
