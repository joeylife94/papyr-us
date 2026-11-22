import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { invalidatePageLists } from '../../client/src/lib/queryClient';

describe('invalidatePageLists', () => {
  it('refreshes every list that shows page titles or icons, and nothing else', async () => {
    const client = new QueryClient();
    const refreshed = [
      '/api/pages',
      '/api/page-tree?scope=personal',
      '/api/folders/docs/pages',
      '/api/pages/7/link-preview',
      '/api/pages/7/embed',
      '/api/pages/7/backlinks',
      '/api/page-links/search?q=plan',
      // Trashing or restoring a page changes the trash and the favourites list without a reload
      '/api/trash',
      '/api/favorites',
    ];
    const untouched = [
      '/api/tasks',
      '/api/pages/7',
      '/api/pages/7/versions',
      '/api/favorites/check/7',
    ];
    for (const key of [...refreshed, ...untouched]) client.setQueryData([key], []);

    await invalidatePageLists(client);

    for (const key of refreshed) {
      expect(client.getQueryState([key])?.isInvalidated, key).toBe(true);
    }
    for (const key of untouched) {
      expect(client.getQueryState([key])?.isInvalidated, key).toBe(false);
    }
  });
});
