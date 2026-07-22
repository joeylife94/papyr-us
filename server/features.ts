import { resolveFeatureFlags, type FeatureFlags } from '../shared/featureFlags.js';

const resolved = resolveFeatureFlags(process.env as Record<string, string | undefined>);

export const featureFlags: FeatureFlags = resolved;

export function isFeatureEnabled(key: keyof Omit<FeatureFlags, 'PAPYR_MODE'>): boolean {
  return featureFlags[key];
}
