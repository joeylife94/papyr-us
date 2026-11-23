import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/hooks/useOrganization';
import { readRecent, recentKey, recordRecent, type RecentEntry } from '@/lib/recent-pages';

const CHANGED = 'papyrus:recent-changed';

function browserStore(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * The signed-in account's recent pages in its organization (see lib/recent-pages.ts). Without a
 * known account and organization the list is empty and nothing is stored.
 */
export function useRecentPages() {
  const { user } = useAuth();
  const { organization } = useOrganization();
  const key = recentKey(user?.id, organization?.id);
  const [entries, setEntries] = useState<RecentEntry[]>([]);

  const reload = useCallback(() => {
    const store = browserStore();
    setEntries(key && store ? readRecent(store, key) : []);
  }, [key]);

  useEffect(() => {
    reload();
    window.addEventListener(CHANGED, reload);
    window.addEventListener('storage', reload);
    return () => {
      window.removeEventListener(CHANGED, reload);
      window.removeEventListener('storage', reload);
    };
  }, [reload]);

  /** Records an opened page; ignored for a page of another organization. */
  const record = useCallback(
    (page: { id: number; title: string; organizationId?: number | null }) => {
      const store = browserStore();
      if (!key || !store || !organization) return;
      if (page.organizationId == null || Number(page.organizationId) !== organization.id) return;
      recordRecent(store, key, { id: page.id, title: page.title });
      window.dispatchEvent(new Event(CHANGED));
    },
    [key, organization]
  );

  return { entries, record };
}
