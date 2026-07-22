import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isFeatureFlagEnabled,
  isRuntimeFeatureEnabled,
  runtimeFeatureGates,
} from '../../client/src/features/runtimeFeatureGates';
import { resolveFeatureFlags } from '../../shared/featureFlags';

const runtimeEnvKeys = ['PAPYR_MODE', 'FEATURE_AI_SEARCH', 'FEATURE_COLLABORATION'] as const;

afterEach(() => {
  for (const key of runtimeEnvKeys) {
    delete process.env[key];
  }
  vi.resetModules();
});

describe('runtime feature gates', () => {
  it('keeps menu and route mappings on the same runtime flags', () => {
    expect(runtimeFeatureGates.aiSearch).toBe('FEATURE_AI_SEARCH');
    expect(runtimeFeatureGates.knowledgeGraph).toBe('FEATURE_AI_SEARCH');
    expect(runtimeFeatureGates.collaborationTest).toBe('FEATURE_COLLABORATION');
  });

  it('does not bypass explicitly disabled client feature flags', () => {
    const flags = resolveFeatureFlags({
      PAPYR_MODE: 'team',
      FEATURE_AI_SEARCH: 'false',
      FEATURE_COLLABORATION: 'false',
    });

    expect(isFeatureFlagEnabled(flags, 'FEATURE_AI_SEARCH')).toBe(false);
    expect(isFeatureFlagEnabled(flags, 'FEATURE_COLLABORATION')).toBe(false);
    expect(isRuntimeFeatureEnabled(flags, 'aiSearch')).toBe(false);
    expect(isRuntimeFeatureEnabled(flags, 'knowledgeGraph')).toBe(false);
    expect(isRuntimeFeatureEnabled(flags, 'collaborationTest')).toBe(false);
  });

  it('exposes runtime features only when their flags are enabled', () => {
    const flags = resolveFeatureFlags({
      PAPYR_MODE: 'team',
      FEATURE_AI_SEARCH: 'true',
      FEATURE_COLLABORATION: 'true',
    });

    expect(isRuntimeFeatureEnabled(flags, 'aiSearch')).toBe(true);
    expect(isRuntimeFeatureEnabled(flags, 'knowledgeGraph')).toBe(true);
    expect(isRuntimeFeatureEnabled(flags, 'collaborationTest')).toBe(true);
  });

  it('respects explicit false values in the server runtime module', async () => {
    process.env.PAPYR_MODE = 'team';
    process.env.FEATURE_AI_SEARCH = 'false';
    process.env.FEATURE_COLLABORATION = 'false';
    vi.resetModules();

    const { featureFlags } = await import('../../server/features');

    expect(featureFlags.FEATURE_AI_SEARCH).toBe(false);
    expect(featureFlags.FEATURE_COLLABORATION).toBe(false);
  });
});
