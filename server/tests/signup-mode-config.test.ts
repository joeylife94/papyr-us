/**
 * SIGNUP_MODE is validated when the configuration loads (issue #124 X1d): an unknown value stops
 * the process like the other configuration checks, instead of being guessed at; unset is `open`.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';

const ORIGINAL = process.env.SIGNUP_MODE;
afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  if (ORIGINAL === undefined) delete process.env.SIGNUP_MODE;
  else process.env.SIGNUP_MODE = ORIGINAL;
});

async function loadConfig(value: string | undefined) {
  if (value === undefined) delete process.env.SIGNUP_MODE;
  else process.env.SIGNUP_MODE = value;
  vi.resetModules();
  const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`exit ${code}`);
  }) as never);
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    const mod = await import('../config');
    return { mod, exited: false, exit, messages: error.mock.calls.flat().join('\n') };
  } catch (e) {
    return { mod: null, exited: true, exit, messages: error.mock.calls.flat().join('\n'), e };
  }
}

describe('loading the configuration', () => {
  it.each([undefined, '', 'open', 'invite_only', 'closed'])(
    'accepts SIGNUP_MODE=%s',
    async (value) => {
      const out = await loadConfig(value as any);
      expect(out.exited).toBe(false);
      expect(out.mod!.config.signupMode).toBe(value ? value : 'open');
    }
  );

  it.each(['OPEN', 'invite-only', 'invite', 'yes', 'none'])(
    'stops the process for SIGNUP_MODE=%s and names the accepted values',
    async (value) => {
      const out = await loadConfig(value);
      expect(out.exited).toBe(true);
      expect(out.exit).toHaveBeenCalledWith(1);
      expect(out.messages).toContain('SIGNUP_MODE must be one of: open, invite_only, closed');
    }
  );
});
