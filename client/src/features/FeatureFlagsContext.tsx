import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { FeatureFlags } from '@shared/featureFlags';
import { resolveFeatureFlags } from '@shared/featureFlags';

type FeatureFlagsContextValue = {
  flags: FeatureFlags;
  isLoading: boolean;
  error?: string;
};

const FeatureFlagsContext = createContext<FeatureFlagsContextValue | undefined>(undefined);

const teamDefaults: FeatureFlags = resolveFeatureFlags({ PAPYR_MODE: 'team' } as any);

export function FeatureFlagsProvider({ children }: { children: React.ReactNode }) {
  const [flags, setFlags] = useState<FeatureFlags>(teamDefaults);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch('/api/features');
        if (!res.ok) throw new Error(`Failed to load feature flags (${res.status})`);
        const data = (await res.json()) as FeatureFlags;
        if (!cancelled) {
          setFlags(data);
          setIsLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load feature flags');
          // Fallback to team defaults to preserve current behavior if the endpoint is unavailable.
          setFlags(teamDefaults);
          setIsLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<FeatureFlagsContextValue>(
    () => ({ flags, isLoading, error }),
    [flags, isLoading, error]
  );

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-600">Loading…</div>
      </div>
    );
  }

  return <FeatureFlagsContext.Provider value={value}>{children}</FeatureFlagsContext.Provider>;
}

export function useFeatureFlags(): FeatureFlagsContextValue {
  const ctx = useContext(FeatureFlagsContext);
  if (!ctx) throw new Error('useFeatureFlags must be used within FeatureFlagsProvider');
  return ctx;
}
