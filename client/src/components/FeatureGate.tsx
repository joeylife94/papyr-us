import React from 'react';
import type { FeatureFlags } from '@shared/featureFlags';
import { useFeatureFlags } from '@/features/FeatureFlagsContext';
import FeatureDisabledPage from '@/pages/feature-disabled';

const featureLabels: Partial<Record<keyof FeatureFlags, string>> = {
  FEATURE_TEAMS: 'Teams',
  FEATURE_ADMIN: 'Admin',
  FEATURE_CALENDAR: 'Calendar',
  FEATURE_TEMPLATES: 'Templates',
  FEATURE_AUTOMATION: 'Automation',
  FEATURE_NOTIFICATIONS: 'Notifications',
  FEATURE_AI_SEARCH: 'AI Search',
};

// Features hardcoded as production-ready — bypass the runtime flag check.
const PRODUCTION_READY = new Set<keyof Omit<FeatureFlags, 'PAPYR_MODE'>>(['FEATURE_AI_SEARCH']);

export function FeatureGate({
  flag,
  children,
}: {
  flag: keyof Omit<FeatureFlags, 'PAPYR_MODE'>;
  children: React.ReactNode;
}) {
  const { flags } = useFeatureFlags();

  if (PRODUCTION_READY.has(flag) || flags[flag]) {
    return <>{children}</>;
  }

  return <FeatureDisabledPage featureName={featureLabels[flag] || String(flag)} />;
}
