/**
 * The "최근 문서" list: the pages this browser's signed-in account last opened, kept in
 * localStorage under a key naming the account AND its organization. Only a page id and title are
 * stored (never a body, slug or any other field). The sidebar shows an entry only after the server
 * confirms the account can still read that page (GET /api/pages/:id/link-preview); an entry the
 * server does not confirm is hidden, not deleted (a restored page reappears), and only the cap of
 * the newest RECENT_LIMIT pages evicts. Signing out, or a session that ends, clears every list.
 */

export const RECENT_LIMIT = 10;
export const RECENT_PREFIX = 'papyrus.recent:';

export interface RecentEntry {
  id: number;
  title: string;
}

/** The part of Storage this module needs (so tests can pass a stand-in). */
export type RecentStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

const isId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

/** The storage key of one account in one organization; null unless both ids are known. */
export function recentKey(userId: unknown, organizationId: unknown): string | null {
  return isId(userId) && isId(organizationId)
    ? `${RECENT_PREFIX}${userId}:${organizationId}`
    : null;
}

function clean(value: unknown): RecentEntry[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  const entries: RecentEntry[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue;
    const { id, title } = item as Record<string, unknown>;
    if (!isId(id) || typeof title !== 'string' || seen.has(id)) continue;
    seen.add(id);
    entries.push({ id, title });
    if (entries.length === RECENT_LIMIT) break;
  }
  return entries;
}

export function readRecent(store: RecentStore, key: string): RecentEntry[] {
  try {
    const raw = store.getItem(key);
    return raw ? clean(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

function write(store: RecentStore, key: string, entries: RecentEntry[]) {
  try {
    store.setItem(key, JSON.stringify(entries));
  } catch {
    // A convenience only: private windows and blocked storage keep an empty list.
  }
}

/** Puts a page first (once), keeping only its id and title and the newest RECENT_LIMIT pages. */
export function recordRecent(store: RecentStore, key: string, entry: RecentEntry): RecentEntry[] {
  const next = clean([
    { id: entry.id, title: entry.title },
    ...readRecent(store, key).filter((item) => item.id !== entry.id),
  ]);
  write(store, key, next);
  return next;
}

/** Removes every account's and organization's list (sign out). */
export function clearAllRecent(store: RecentStore): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const name = store.key(i);
      if (name?.startsWith(RECENT_PREFIX)) keys.push(name);
    }
    for (const name of keys) store.removeItem(name);
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}
