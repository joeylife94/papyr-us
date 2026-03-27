import { resolveFeatureFlags, type FeatureFlags } from '../shared/featureFlags.js';

const resolved = resolveFeatureFlags(process.env as Record<string, string | undefined>);

// FEATURE_AI_SEARCH and SSO are production-ready and unconditionally enabled.
export const featureFlags: FeatureFlags = {
  ...resolved,
  FEATURE_AI_SEARCH: true,
};

export function isFeatureEnabled(key: keyof Omit<FeatureFlags, 'PAPYR_MODE'>): boolean {
  return featureFlags[key];
}
