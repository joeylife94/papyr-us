import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A session that ends because the token refresh failed clears the recent-page lists of the browser,
// like signing out does.
describe('http: a refresh failure ends the session and clears the recent lists', () => {
  const store = new Map<string, string>([
    ['papyrus.recent:7:3', '[{"id":1,"title":"One"}]'],
    ['papyrus.tree.expanded:x', '[1]'],
  ]);
  const replace = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    replace.mockReset();
    vi.stubGlobal('window', {
      location: { pathname: '/page/a', search: '', origin: 'http://x.test', replace },
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
        key: (i: number) => [...store.keys()][i] ?? null,
        get length() {
          return store.size;
        },
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 401 }))
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('removes the recent lists and nothing else, then goes to the login page', async () => {
    const { http } = await import('../../client/src/lib/http');
    await expect(http('/api/pages')).rejects.toThrow(/Auth error/);
    expect([...store.keys()]).toEqual(['papyrus.tree.expanded:x']);
    expect(replace).toHaveBeenCalledTimes(1);
  });
});
