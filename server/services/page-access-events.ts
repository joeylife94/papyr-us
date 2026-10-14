import logger from './logger.js';

/**
 * In-process notice that a user's page access may have shrunk, for example because they left a
 * team. Long-lived connections that checked page permissions once (the realtime collaboration
 * sockets) subscribe and check again, so the change applies to open sessions immediately rather
 * than at the next reconnect. Only sockets connected to this process are reached.
 */
type PageAccessListener = (userId: number) => Promise<void>;

const listeners = new Set<PageAccessListener>();

export function onPageAccessChanged(listener: PageAccessListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Resolves once every subscriber has re-checked; a failing subscriber is logged, not thrown. */
export async function notifyPageAccessChanged(userId: number): Promise<void> {
  const results = await Promise.allSettled([...listeners].map((listener) => listener(userId)));
  for (const result of results) {
    if (result.status === 'rejected') {
      logger.error('Failed to re-check page access after an access change', {
        userId,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  }
}
