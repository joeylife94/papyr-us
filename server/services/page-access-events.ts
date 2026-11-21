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

/**
 * In-process notice that who may read or edit one page changed for people who are not named by
 * an account (the page's public access was lowered or removed). Open realtime sessions on that
 * page, of any account or none, check their access again.
 */
type PageGrantsListener = (pageId: number) => Promise<void>;

const pageListeners = new Set<PageGrantsListener>();

export function onPageGrantsChanged(listener: PageGrantsListener): () => void {
  pageListeners.add(listener);
  return () => {
    pageListeners.delete(listener);
  };
}

/** Resolves once every subscriber has re-checked; a failing subscriber is logged, not thrown. */
export async function notifyPageGrantsChanged(pageId: number): Promise<void> {
  const results = await Promise.allSettled([...pageListeners].map((listener) => listener(pageId)));
  for (const result of results) {
    if (result.status === 'rejected') {
      logger.error('Failed to re-check page access after a page grant change', {
        pageId,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  }
}
