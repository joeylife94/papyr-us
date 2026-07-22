import type { FeatureFlags } from '@shared/featureFlags';

type RuntimeFeatureFlag = keyof Omit<FeatureFlags, 'PAPYR_MODE'>;

export const runtimeFeatureGates = {
  aiSearch: 'FEATURE_AI_SEARCH',
  knowledgeGraph: 'FEATURE_AI_SEARCH',
  collaborationTest: 'FEATURE_COLLABORATION',
} as const satisfies Record<string, RuntimeFeatureFlag>;

export type RuntimeFeature = keyof typeof runtimeFeatureGates;

export function isFeatureFlagEnabled(
  flags: FeatureFlags,
  flag: RuntimeFeatureFlag
): boolean {
  return flags[flag];
}

export function isRuntimeFeatureEnabled(
  flags: FeatureFlags,
  feature: RuntimeFeature
): boolean {
  return isFeatureFlagEnabled(flags, runtimeFeatureGates[feature]);
}
