import { resolveFeatureFlags, type FeatureFlags } from '../shared/featureFlags.js';

export const featureFlags: FeatureFlags = resolveFeatureFlags(
  process.env as Record<string, string | undefined>
);

export function isFeatureEnabled(key: keyof Omit<FeatureFlags, 'PAPYR_MODE'>): boolean {
  return featureFlags[key];
}
