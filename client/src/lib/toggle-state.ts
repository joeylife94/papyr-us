import { useCallback, useState } from 'react';

/**
 * Which toggles a viewer has collapsed on a page (WP11). It is the viewer's own: nothing is
 * saved to the page and nobody else sees it. It is kept in `sessionStorage`, keyed by page, so
 * it survives a reload of the tab; where storage is blocked it lives in memory only. A toggle
 * that was never collapsed is open (new toggles start open).
 */
const key = (pageId: number | undefined) => `papyrus:collapsed-toggles:${pageId ?? 'new'}`;

function readCollapsed(pageId: number | undefined): Set<string> {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(key(pageId)) ?? '[]');
    return new Set(
      Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
    );
  } catch {
    return new Set();
  }
}

function writeCollapsed(pageId: number | undefined, collapsed: Set<string>) {
  try {
    window.sessionStorage.setItem(key(pageId), JSON.stringify([...collapsed]));
  } catch {
    // Storage is blocked: the state stays in memory for this visit.
  }
}

export function useCollapsedToggles(pageId: number | undefined) {
  const [state, setState] = useState(() => ({ pageId, collapsed: readCollapsed(pageId) }));
  // Another page opened in the same editor: its own collapsed toggles.
  const current = state.pageId === pageId ? state.collapsed : readCollapsed(pageId);

  const setCollapsed = useCallback(
    (blockId: string, collapsed: boolean) => {
      setState((previous) => {
        const base = previous.pageId === pageId ? previous.collapsed : readCollapsed(pageId);
        if (base.has(blockId) === collapsed) return { pageId, collapsed: base };
        const next = new Set(base);
        if (collapsed) next.add(blockId);
        else next.delete(blockId);
        writeCollapsed(pageId, next);
        return { pageId, collapsed: next };
      });
    },
    [pageId]
  );

  const isCollapsed = useCallback((blockId: string) => current.has(blockId), [current]);
  return { isCollapsed, setCollapsed };
}
