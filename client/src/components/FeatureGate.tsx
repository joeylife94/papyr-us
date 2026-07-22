import React from 'react';
import type { FeatureFlags } from '@shared/featureFlags';
import { useFeatureFlags } from '@/features/FeatureFlagsContext';
import { isFeatureFlagEnabled } from '@/features/runtimeFeatureGates';
import FeatureDisabledPage from '@/pages/feature-disabled';

const featureLabels: Partial<Record<keyof FeatureFlags, string>> = {
  FEATURE_TEAMS: 'Teams',
  FEATURE_ADMIN: 'Admin',
  FEATURE_CALENDAR: 'Calendar',
  FEATURE_TEMPLATES: 'Templates',
  FEATURE_AUTOMATION: 'Automation',
  FEATURE_NOTIFICATIONS: 'Notifications',
  FEATURE_AI_SEARCH: 'AI Search',
  FEATURE_COLLABORATION: 'Realtime Collaboration',
};

export function FeatureGate({
  flag,
  children,
}: {
  flag: keyof Omit<FeatureFlags, 'PAPYR_MODE'>;
  children: React.ReactNode;
}) {
  const { flags } = useFeatureFlags();

  if (isFeatureFlagEnabled(flags, flag)) {
    return <>{children}</>;
  }

  return <FeatureDisabledPage featureName={featureLabels[flag] || String(flag)} />;
}
