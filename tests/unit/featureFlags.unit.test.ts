/**
 * Layer 1 Unit · FeatureFlags
 * Invariant: resolveFeatureFlags must always return a complete, type-safe flags
 * object — unknown env values must fall back to safe defaults without throwing.
 */
import { describe, it, expect } from 'vitest';
import { resolveFeatureFlags } from '../../shared/featureFlags';

describe('resolveFeatureFlags()', () => {
  it('defaults to team mode when PAPYR_MODE is absent', () => {
    const flags = resolveFeatureFlags({});
    expect(flags.PAPYR_MODE).toBe('team');
    expect(flags.FEATURE_TEAMS).toBe(true);
  });

  it('activates personal mode when PAPYR_MODE=personal', () => {
    const flags = resolveFeatureFlags({ PAPYR_MODE: 'personal' });
    expect(flags.PAPYR_MODE).toBe('personal');
    expect(flags.FEATURE_TEAMS).toBe(false);
    expect(flags.FEATURE_ADMIN).toBe(false);
  });

  it('falls back to team mode for an unrecognised PAPYR_MODE value', () => {
    const flags = resolveFeatureFlags({ PAPYR_MODE: 'enterprise' });
    expect(flags.PAPYR_MODE).toBe('team');
    expect(flags.FEATURE_TEAMS).toBe(true);
  });

  it('explicit flag env overrides mode default (team + FEATURE_TEAMS=0 → false)', () => {
    const flags = resolveFeatureFlags({ PAPYR_MODE: 'team', FEATURE_TEAMS: '0' });
    expect(flags.FEATURE_TEAMS).toBe(false);
  });

  it('accepts truthy string variants for boolean flags (yes/on/1/true)', () => {
    for (const v of ['1', 'true', 'yes', 'on']) {
      const flags = resolveFeatureFlags({ PAPYR_MODE: 'personal', FEATURE_TEAMS: v });
      expect(flags.FEATURE_TEAMS).toBe(true);
    }
  });

  it('returns false for falsy string variants (0/false/no/off)', () => {
    for (const v of ['0', 'false', 'no', 'off']) {
      const flags = resolveFeatureFlags({ PAPYR_MODE: 'team', FEATURE_TEAMS: v });
      expect(flags.FEATURE_TEAMS).toBe(false);
    }
  });

  it('never returns undefined for any known flag key', () => {
    const flags = resolveFeatureFlags({});
    const keys: (keyof typeof flags)[] = [
      'PAPYR_MODE',
      'FEATURE_TEAMS',
      'FEATURE_ADMIN',
      'FEATURE_CALENDAR',
      'FEATURE_TEMPLATES',
      'FEATURE_AUTOMATION',
      'FEATURE_NOTIFICATIONS',
      'FEATURE_AI_SEARCH',
      'FEATURE_COLLABORATION',
    ];
    for (const key of keys) {
      expect(flags[key]).toBeDefined();
    }
  });
});
