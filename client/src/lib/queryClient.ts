import { QueryClient, QueryFunction } from '@tanstack/react-query';

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { 'Content-Type': 'application/json' } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: 'include',
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = 'returnNull' | 'throw';
export const getQueryFn: <T>(options: { on401: UnauthorizedBehavior }) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey[0] as string, {
      credentials: 'include',
    });

    if (unauthorizedBehavior === 'returnNull' && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: 'throw' }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

/**
 * Refresh every cached page list after a page's title, icon, folder or place changed: the
 * document table and command palette (`/api/pages…`), per-folder lists (`/api/folders/:f/pages`)
 * and the sidebar page tree (`/api/page-tree…`). These queries never go stale on their own, so a
 * save has to invalidate them.
 */
export function invalidatePageLists(client: QueryClient = queryClient) {
  return client.invalidateQueries({
    predicate: ({ queryKey }) => {
      const key = queryKey[0];
      return (
        typeof key === 'string' &&
        (key === '/api/pages' ||
          key.startsWith('/api/page-tree') ||
          (key.startsWith('/api/folders/') && key.endsWith('/pages')))
      );
    },
  });
}
