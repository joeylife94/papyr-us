import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
  type ResponderProvided,
} from '@hello-pangea/dnd';
import { ChevronDown, ChevronRight, MoreHorizontal, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { PageIcon } from '@/components/page/page-icon';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ancestorIds,
  applyMove,
  describeMove,
  descendantIds,
  dropTarget,
  indexTree,
  keyboardMoveTarget,
  nestTarget,
  placeOf,
  sameTarget,
  visibleRows,
  type KeyboardMove,
  type MoveTarget,
  type TreePage,
  type TreeRow,
} from '@/lib/page-tree';

/** Every page tree query starts with this key (other views invalidate the prefix). */
export const PAGE_TREE_QUERY_KEY = '/api/pages/tree';

interface PageTreeProps {
  /** Team slug of the workspace, or null for the team-less (personal) pages. */
  teamName: string | null;
  /** Lazy creation route of the workspace (`/create` or `/teams/:teamName/create`). */
  createHref: string;
  /** The workspace panel's search text: shows matching pages with their ancestors. */
  searchQuery?: string;
  /** Called after navigating from the tree (closes the mobile drawer). */
  onNavigate?: () => void;
}

const MOVE_KEYS: Record<string, KeyboardMove> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowRight: 'in',
  ArrowLeft: 'out',
};

// 24px targets everywhere; `!min-*` overrides the global 44px mobile minimum for buttons.
const iconButton =
  'flex h-6 w-6 !min-h-0 !min-w-0 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function expandedKey(scope: string) {
  return `papyrus.pageTree.expanded.${scope}`;
}

function loadExpanded(scope: string): Set<number> {
  try {
    const raw = window.localStorage.getItem(expandedKey(scope));
    const ids = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(ids) ? ids.filter((id) => Number.isInteger(id)) : []);
  } catch {
    return new Set();
  }
}

function saveExpanded(scope: string, ids: Set<number>) {
  try {
    window.localStorage.setItem(expandedKey(scope), JSON.stringify(Array.from(ids)));
  } catch {
    // Private mode or full storage: the tree simply forgets what was open.
  }
}

function moveFailure(error: unknown): string {
  const status = Number(String((error as Error)?.message ?? '').split(':')[0]);
  if (status === 403) return '이 위치로 옮길 권한이 없습니다.';
  if (status === 400) return '문서를 자기 하위 문서 안으로 옮길 수 없습니다.';
  if (status === 404) return '문서를 찾을 수 없습니다. 목록을 새로 고칩니다.';
  return '잠시 후 다시 시도하세요.';
}

/**
 * The sidebar page tree of one workspace (#103 E5), following the ARIA tree pattern on a flat
 * list (aria-level / aria-setsize / aria-posinset carry the structure, so drag and drop works on
 * one list): ↑/↓ move, → expands or enters, ← collapses or goes to the parent, Home/End, Enter
 * opens. Pages move by drag (between rows: reorder at that level, onto a row: nest), by
 * Alt+Shift+arrows (↑/↓ reorder, → into the previous page, ← out one level) or from the row menu.
 * The server enforces every rule; a refused move is rolled back.
 */
export function PageTree({ teamName, createHref, searchQuery = '', onNavigate }: PageTreeProps) {
  const scope = teamName !== null ? `team:${teamName}` : 'personal';
  const queryKey = useMemo(() => [PAGE_TREE_QUERY_KEY, scope], [scope]);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading, isError, refetch } = useQuery<{ pages: TreePage[] }>({
    queryKey,
    queryFn: async () => {
      const query = teamName ? `?teamId=${encodeURIComponent(teamName)}` : '';
      const response = await fetch(`/api/pages/tree${query}`);
      if (!response.ok) throw new Error(`tree ${response.status}`);
      return response.json();
    },
    staleTime: 30_000,
  });
  const pages = data?.pages;
  const tree = useMemo(() => indexTree(pages ?? []), [pages]);

  const [expanded, setExpanded] = useState<Set<number>>(() => loadExpanded(scope));
  const updateExpanded = (change: (next: Set<number>) => void) =>
    setExpanded((previous) => {
      const next = new Set(previous);
      change(next);
      saveExpanded(scope, next);
      return next;
    });

  const [draggingId, setDraggingId] = useState<number | null>(null);
  const filter = searchQuery.trim();
  const rows = useMemo(
    () =>
      visibleRows(tree, expanded, {
        filter,
        hidden: draggingId !== null ? descendantIds(tree, draggingId) : undefined,
      }),
    [tree, expanded, filter, draggingId]
  );

  // The open page: highlighted, and its ancestors are opened once when it is first shown.
  const currentSlug = (() => {
    const slug = pathname.match(/^\/page\/([^/]+)\/?$/)?.[1];
    if (!slug) return null;
    try {
      return decodeURIComponent(slug);
    } catch {
      return slug;
    }
  })();
  const currentId = pages?.find((page) => page.slug === currentSlug)?.id ?? null;
  const revealedFor = useRef<number | null>(null);
  useEffect(() => {
    if (currentId === null || revealedFor.current === currentId) return;
    revealedFor.current = currentId;
    const above = ancestorIds(tree, currentId);
    if (above.some((id) => !expanded.has(id))) {
      updateExpanded((next) => above.forEach((id) => next.add(id)));
    }
  }, [currentId, tree]);

  // Roving tabindex: one row is in the tab order; arrows move focus between rows.
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const rowRefs = useRef(new Map<number, HTMLElement>());
  const tabStop = rows.some((row) => row.page.id === focusedId)
    ? focusedId
    : (rows.find((row) => row.page.id === currentId)?.page.id ?? rows[0]?.page.id ?? null);
  const focusRow = (id: number) => {
    setFocusedId(id);
    // Focus now, so the next key goes to this row; again after rendering, for a row that was
    // not on screen yet or was re-rendered by a move.
    rowRefs.current.get(id)?.focus();
    requestAnimationFrame(() => {
      const element = rowRefs.current.get(id);
      if (element && document.activeElement !== element) element.focus();
    });
  };

  const [announcement, setAnnouncement] = useState('');
  const [menuFor, setMenuFor] = useState<number | null>(null);

  // Handlers read the latest tree through a ref (drag responders may outlive a render).
  const latest = useRef({ tree, expanded, rows });
  latest.current = { tree, expanded, rows };

  const open = (page: TreePage) => {
    navigate(`/page/${page.slug}`);
    onNavigate?.();
  };

  const addChild = (page: TreePage) => {
    updateExpanded((next) => next.add(page.id));
    navigate(`${createHref}?parent=${page.id}`);
    onNavigate?.();
  };

  async function move(id: number, target: MoveTarget, announce: (message: string) => void) {
    const current = latest.current.tree;
    if (sameTarget(placeOf(current, id), target)) return;
    const message = describeMove(current, id, target);
    const previous = queryClient.getQueryData<{ pages: TreePage[] }>(queryKey);
    if (previous) {
      queryClient.setQueryData(queryKey, { pages: applyMove(previous.pages, id, target) });
    }
    if (target.parentId !== null) updateExpanded((next) => next.add(target.parentId!));
    announce(message);
    try {
      const response = await fetch(`/api/pages/${id}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(target),
      });
      if (!response.ok) throw new Error(`${response.status}: move`);
    } catch (error) {
      if (previous) queryClient.setQueryData(queryKey, previous);
      // The drag library's announcer only works during its callbacks; use the tree's own.
      setAnnouncement('문서를 옮기지 못했습니다');
      toast({
        title: '문서를 옮기지 못했습니다',
        description: moveFailure(error),
        variant: 'destructive',
      });
    } finally {
      queryClient.invalidateQueries({ queryKey: [PAGE_TREE_QUERY_KEY] });
    }
  }

  const keyboardMove = (id: number, direction: KeyboardMove) => {
    const target = keyboardMoveTarget(latest.current.tree, id, direction);
    if (!target) {
      setAnnouncement('더 이상 옮길 수 없습니다');
      return;
    }
    void move(id, target, setAnnouncement);
    focusRow(id);
  };

  const handleDragEnd = (result: DropResult, provided: ResponderProvided) => {
    setDraggingId(null);
    const id = Number(result.draggableId);
    const { tree: current, rows: during } = latest.current;
    let target: MoveTarget | null = null;
    if (result.combine) {
      target = nestTarget(current, Number(result.combine.draggableId), id);
    } else if (result.destination) {
      target = dropTarget(
        current,
        during.filter((row) => row.page.id !== id),
        result.destination.index,
        id
      );
    }
    if (!target) {
      provided.announce('문서 이동을 취소했습니다');
      return;
    }
    void move(id, target, provided.announce);
  };

  const handleKeyDown = (event: React.KeyboardEvent, row: TreeRow, index: number) => {
    // Keys typed in the row menu or its trigger are theirs.
    if (event.target !== event.currentTarget) return;
    const { page } = row;
    if (event.altKey && event.shiftKey && MOVE_KEYS[event.key]) {
      event.preventDefault();
      if (!filter) keyboardMove(page.id, MOVE_KEYS[event.key]);
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const go = (to: TreeRow | undefined) => {
      if (!to) return;
      event.preventDefault();
      focusRow(to.page.id);
    };
    switch (event.key) {
      case 'ArrowDown':
        return go(rows[index + 1]);
      case 'ArrowUp':
        return go(rows[index - 1]);
      case 'Home':
        return go(rows[0]);
      case 'End':
        return go(rows[rows.length - 1]);
      case 'ArrowRight':
        event.preventDefault();
        if (row.hasChildren && !row.expanded) updateExpanded((next) => next.add(page.id));
        else if (row.expanded) go(rows[index + 1]);
        return;
      case 'ArrowLeft':
        event.preventDefault();
        if (row.expanded && !filter) updateExpanded((next) => next.delete(page.id));
        else if (row.level > 1) {
          go(
            rows
              .slice(0, index)
              .reverse()
              .find((candidate) => candidate.level < row.level)
          );
        }
        return;
      case 'Enter':
        event.preventDefault();
        return open(page);
      case 'ContextMenu':
        event.preventDefault();
        return setMenuFor(page.id);
      case 'F10':
        if (event.shiftKey) {
          event.preventDefault();
          setMenuFor(page.id);
        }
        return;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-1.5 px-1" aria-label="페이지 트리를 불러오는 중">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-7 animate-pulse rounded-md bg-raised" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="px-2.5 py-1 text-xs text-muted-foreground">
        <p>페이지 트리를 불러오지 못했습니다.</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="mt-1 font-medium text-highlight hover:underline"
        >
          다시 시도
        </button>
      </div>
    );
  }

  const newPageLink = (
    <Link
      to={createHref}
      onClick={onNavigate}
      className="flex min-h-[30px] items-center gap-2 rounded-md px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Plus className="h-3.5 w-3.5" aria-hidden="true" /> 새 문서
    </Link>
  );

  if ((pages ?? []).length === 0) {
    return (
      <div className="flex flex-col">
        <p className="px-2.5 py-1.5 text-xs text-muted-foreground">아직 문서가 없습니다</p>
        {newPageLink}
      </div>
    );
  }

  const renderRow = (row: TreeRow, index: number) => {
    const { page } = row;
    const isCurrent = page.id === currentId;
    const canMove = (direction: KeyboardMove) =>
      !filter && keyboardMoveTarget(tree, page.id, direction) !== null;
    return (
      <Draggable
        key={page.id}
        draggableId={String(page.id)}
        index={index}
        isDragDisabled={!!filter}
      >
        {(drag, snapshot) => (
          <li
            ref={(element) => {
              drag.innerRef(element);
              if (element) rowRefs.current.set(page.id, element);
              else rowRefs.current.delete(page.id);
            }}
            {...drag.draggableProps}
            {...drag.dragHandleProps}
            role="treeitem"
            tabIndex={tabStop === page.id ? 0 : -1}
            aria-level={row.level}
            aria-setsize={row.setSize}
            aria-posinset={row.posInSet}
            aria-expanded={row.hasChildren ? row.expanded : undefined}
            aria-current={isCurrent ? 'page' : undefined}
            aria-label={page.title || '제목 없음'}
            data-page-id={page.id}
            data-drop-into={snapshot.combineTargetFor ? 'true' : undefined}
            onFocus={(event) => {
              if (event.target === event.currentTarget) setFocusedId(page.id);
            }}
            onKeyDown={(event) => handleKeyDown(event, row, index)}
            className={cn(
              'group/tree-row rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring',
              snapshot.combineTargetFor && 'bg-primary/15 ring-2 ring-primary/60'
            )}
          >
            <div
              className={cn(
                'flex min-h-[30px] items-center gap-0.5 rounded-md pr-1 text-[13.5px] transition-colors',
                isCurrent
                  ? 'bg-raised font-semibold text-foreground'
                  : 'text-foreground-secondary hover:bg-raised hover:text-foreground'
              )}
              style={{ paddingLeft: 4 + (row.level - 1) * 14 }}
            >
              {row.hasChildren ? (
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden="true"
                  onClick={() =>
                    updateExpanded((next) =>
                      next.has(page.id) ? next.delete(page.id) : next.add(page.id)
                    )
                  }
                  className={iconButton}
                >
                  {row.expanded ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                </button>
              ) : (
                <span className="h-6 w-6 shrink-0" aria-hidden="true" />
              )}
              <Link
                to={`/page/${page.slug}`}
                tabIndex={-1}
                onClick={onNavigate}
                draggable={false}
                className="flex !min-h-0 !min-w-0 flex-1 items-center gap-1.5 self-stretch truncate py-1"
              >
                <PageIcon icon={page.icon} className="text-[13px]" />
                <span className="truncate">{page.title || '제목 없음'}</span>
              </Link>
              {/* Row actions take no room until the row is hovered or focused (or the menu is
                  open), so titles keep their width; touch screens always show them. */}
              <span
                className={cn(
                  'shrink-0 items-center group-focus-within/tree-row:flex group-hover/tree-row:flex [@media(hover:none)]:flex',
                  menuFor === page.id ? 'flex' : 'hidden'
                )}
              >
                <DropdownMenu
                  open={menuFor === page.id}
                  onOpenChange={(isOpen) => setMenuFor(isOpen ? page.id : null)}
                >
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-label={`${page.title || '제목 없음'} 메뉴`}
                      title="메뉴"
                      className={iconButton}
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    onCloseAutoFocus={(event) => {
                      event.preventDefault();
                      focusRow(page.id);
                    }}
                  >
                    <DropdownMenuItem onSelect={() => addChild(page)}>
                      하위 문서 추가
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={!canMove('up')}
                      onSelect={() => keyboardMove(page.id, 'up')}
                    >
                      위로 옮기기
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!canMove('down')}
                      onSelect={() => keyboardMove(page.id, 'down')}
                    >
                      아래로 옮기기
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!canMove('in')}
                      onSelect={() => keyboardMove(page.id, 'in')}
                    >
                      위 문서의 하위로 옮기기
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!canMove('out')}
                      onSelect={() => keyboardMove(page.id, 'out')}
                    >
                      한 단계 밖으로 옮기기
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => addChild(page)}
                  aria-label={`${page.title || '제목 없음'} 하위 문서 추가`}
                  title="하위 문서 추가"
                  className={iconButton}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </span>
            </div>
          </li>
        )}
      </Draggable>
    );
  };

  return (
    <div className="flex flex-col">
      <DragDropContext
        onBeforeCapture={(before) => setDraggingId(Number(before.draggableId))}
        onDragStart={(start, provided) => {
          const title = latest.current.tree.byId.get(Number(start.draggableId))?.title;
          provided.announce(`"${title || '제목 없음'}" 문서를 들었습니다`);
        }}
        onDragUpdate={(update, provided) => {
          if (update.combine) {
            const parent = latest.current.tree.byId.get(Number(update.combine.draggableId));
            provided.announce(`"${parent?.title || '제목 없음'}" 문서 안으로`);
          } else if (update.destination) {
            provided.announce(`${update.destination.index + 1}번째 줄`);
          }
        }}
        onDragEnd={handleDragEnd}
        dragHandleUsageInstructions="스페이스바로 문서를 들고 위아래 화살표로 옮긴 뒤 스페이스바로 놓습니다. Esc로 취소합니다. Alt+Shift+위/아래 화살표로 순서를, Alt+Shift+오른쪽 화살표로 위 문서의 하위로, Alt+Shift+왼쪽 화살표로 한 단계 밖으로 옮길 수 있습니다."
      >
        <Droppable
          droppableId={`page-tree-${scope}`}
          isCombineEnabled
          isDropDisabled={!!filter}
          renderClone={(drag, _snapshot, rubric) => {
            const page = tree.byId.get(Number(rubric.draggableId));
            // The clone lives in document.body, so transformed ancestors (the mobile drawer)
            // cannot offset it.
            return (
              <div
                ref={drag.innerRef}
                {...drag.draggableProps}
                {...drag.dragHandleProps}
                className="flex min-h-[30px] items-center gap-1.5 rounded-md bg-card px-2.5 text-[13.5px] text-foreground shadow-lg ring-1 ring-border"
              >
                <PageIcon icon={page?.icon} className="text-[13px]" />
                <span className="truncate">{page?.title || '제목 없음'}</span>
              </div>
            );
          }}
        >
          {(drop) => (
            <ul
              ref={drop.innerRef}
              {...drop.droppableProps}
              role="tree"
              aria-label="페이지 트리"
              className="flex flex-col"
            >
              {rows.map(renderRow)}
              {drop.placeholder}
            </ul>
          )}
        </Droppable>
      </DragDropContext>
      {filter && rows.length === 0 && (
        <p className="px-2.5 py-1.5 text-xs text-muted-foreground">일치하는 문서가 없습니다</p>
      )}
      {newPageLink}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}

type PageAncestor = Pick<TreePage, 'id' | 'title' | 'slug' | 'icon'>;

/**
 * The breadcrumb entries above a page (GET /api/pages/:id/ancestors): its readable ancestors,
 * root first, each followed by a separator. Nothing shows above a parent the viewer cannot read.
 * The query key starts with the tree key, so moves and renames refresh it too.
 */
export function PageAncestorCrumbs({ pageId }: { pageId: number }) {
  const { data } = useQuery<{ ancestors: PageAncestor[] }>({
    queryKey: [PAGE_TREE_QUERY_KEY, 'ancestors', pageId],
    queryFn: async () => {
      const response = await fetch(`/api/pages/${pageId}/ancestors`);
      if (!response.ok) throw new Error(`ancestors ${response.status}`);
      return response.json();
    },
    staleTime: 30_000,
  });
  return (
    <>
      {(data?.ancestors ?? []).map((ancestor) => (
        <Fragment key={ancestor.id}>
          <li className="min-w-0">
            <Link
              to={`/page/${ancestor.slug}`}
              className="inline-flex max-w-[12rem] items-center gap-1 transition-colors hover:text-highlight"
            >
              <PageIcon icon={ancestor.icon} fallback={false} />
              <span className="truncate">{ancestor.title || '제목 없음'}</span>
            </Link>
          </li>
          <li aria-hidden="true">/</li>
        </Fragment>
      ))}
    </>
  );
}
