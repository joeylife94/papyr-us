import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { ChevronDown, ChevronRight, GripVertical, Plus } from 'lucide-react';
import { PageIcon } from '@/components/page/page-icon';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  ancestorIds,
  applyMove,
  dropToMove,
  flattenVisible,
  keyboardToMove,
  searchTree,
  type KeyboardMove,
  type PageTreeNode,
  type TreeMove,
  type VisibleNode,
} from '@/lib/page-tree';

interface PageTreeProps {
  /** `/api/page-tree?…` for the active workspace; null while it is being resolved. */
  treeUrl: string | null;
  /** Where "새 문서" goes for this workspace; a child page adds `?parent=<id>`. */
  createHref: string;
  searchQuery: string;
  onNavigate?: () => void;
}

const MOVE_MESSAGES: Record<KeyboardMove, string> = {
  up: '문서를 한 칸 위로 옮겼습니다',
  down: '문서를 한 칸 아래로 옮겼습니다',
  indent: '문서를 앞 문서의 하위 문서로 옮겼습니다',
  outdent: '문서를 한 단계 위 수준으로 옮겼습니다',
};
const KEY_TO_MOVE: Record<string, KeyboardMove> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowRight: 'indent',
  ArrowLeft: 'outdent',
};

function readExpanded(key: string): Set<number> {
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? '[]');
    return new Set(Array.isArray(stored) ? stored.filter(Number.isInteger) : []);
  } catch {
    return new Set();
  }
}

function findBySlug(nodes: PageTreeNode[], slug: string | null): PageTreeNode | null {
  if (!slug) return null;
  for (const node of nodes) {
    if (node.slug === slug) return node;
    const found = findBySlug(node.children, slug);
    if (found) return found;
  }
  return null;
}

/**
 * The sidebar page tree (issue #103 E5), an ARIA tree rendered as one flat list:
 * - arrows move focus, → / ← expand and collapse, Enter opens the page;
 * - Alt+↑/↓ reorders among siblings, Alt+→ nests under the previous sibling, Alt+← moves out;
 * - the ⋮⋮ grip drags a page: drop between rows to place it, or onto a page to nest it;
 * - "+" adds a child page.
 * Moves are applied optimistically and confirmed by POST /api/pages/:id/move.
 */
export function PageTree({ treeUrl, createHref, searchQuery, onNavigate }: PageTreeProps) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: tree = [], isLoading } = useQuery<PageTreeNode[]>({
    queryKey: [treeUrl],
    enabled: !!treeUrl,
  });

  const storageKey = `papyrus.tree.expanded:${treeUrl ?? 'none'}`;
  const [expanded, setExpanded] = useState<Set<number>>(() => readExpanded(storageKey));
  useEffect(() => setExpanded(readExpanded(storageKey)), [storageKey]);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify([...expanded]));
    } catch {
      // Remembering expanded pages is a convenience; private windows may refuse storage.
    }
  }, [expanded, storageKey]);

  const currentSlug = pathname.startsWith('/page/')
    ? decodeURIComponent(pathname.slice('/page/'.length))
    : null;
  const current = useMemo(() => findBySlug(tree, currentSlug), [tree, currentSlug]);

  // Reveal the open page.
  useEffect(() => {
    if (!current) return;
    const path = ancestorIds(tree, current.id);
    if (path.some((id) => !expanded.has(id))) {
      setExpanded((prev) => new Set([...prev, ...path]));
    }
    // Only when the open page or the tree changes, not on every expand/collapse.
  }, [current?.id, tree]);

  const [draggingId, setDraggingId] = useState<number | null>(null);
  const visible = useMemo(
    () => flattenVisible(tree, expanded, draggingId),
    [tree, expanded, draggingId]
  );

  const [activeId, setActiveId] = useState<number | null>(null);
  const focusableId =
    (activeId !== null && visible.some((v) => v.node.id === activeId) && activeId) ||
    (current && visible.some((v) => v.node.id === current.id) && current.id) ||
    visible[0]?.node.id;
  const rowRefs = useRef(new Map<number, HTMLElement>());
  const focusRow = (id: number) => {
    setActiveId(id);
    requestAnimationFrame(() => rowRefs.current.get(id)?.focus());
  };
  const [announcement, setAnnouncement] = useState('');

  const setOpen = (id: number, open: boolean) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });

  const commitMove = async (id: number, move: TreeMove, message: string) => {
    const key = [treeUrl];
    const previous = queryClient.getQueryData<PageTreeNode[]>(key);
    if (previous) queryClient.setQueryData(key, applyMove(previous, id, move));
    if (move.parentId !== null) setOpen(move.parentId, true);
    setAnnouncement(message);
    try {
      const res = await fetch(`/api/pages/${id}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(move),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(typeof body?.message === 'string' ? body.message : '');
      }
    } catch (error) {
      if (previous) queryClient.setQueryData(key, previous);
      setAnnouncement('문서를 옮기지 못했습니다');
      toast({
        title: '문서를 옮기지 못했습니다',
        description: (error as Error).message || '잠시 후 다시 시도하세요.',
        variant: 'destructive',
      });
    } finally {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  };

  const open = (node: PageTreeNode) => {
    navigate(`/page/${node.slug}`);
    onNavigate?.();
  };

  const addChild = (node: PageTreeNode) => {
    setOpen(node.id, true);
    navigate(`${createHref}${createHref.includes('?') ? '&' : '?'}parent=${node.id}`);
    onNavigate?.();
  };

  const onRowKeyDown = (event: React.KeyboardEvent, row: VisibleNode, index: number) => {
    const id = row.node.id;
    if (event.altKey && !event.ctrlKey && !event.metaKey) {
      const direction = KEY_TO_MOVE[event.key];
      if (!direction) return;
      event.preventDefault();
      const move = keyboardToMove(tree, id, direction);
      if (!move) {
        setAnnouncement('이 방향으로는 옮길 수 없습니다');
        return;
      }
      void commitMove(id, move, MOVE_MESSAGES[direction]);
      focusRow(id);
      return;
    }
    const at = (i: number) => visible[Math.max(0, Math.min(visible.length - 1, i))]?.node.id;
    switch (event.key) {
      case 'ArrowDown':
        focusRow(at(index + 1));
        break;
      case 'ArrowUp':
        focusRow(at(index - 1));
        break;
      case 'Home':
        focusRow(at(0));
        break;
      case 'End':
        focusRow(at(visible.length - 1));
        break;
      case 'ArrowRight':
        if (row.hasChildren && !row.expanded) setOpen(id, true);
        else if (row.expanded) focusRow(at(index + 1));
        break;
      case 'ArrowLeft':
        if (row.expanded) setOpen(id, false);
        else if (row.parentId !== null) focusRow(row.parentId);
        break;
      case 'Enter':
        open(row.node);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  const onDragEnd = (result: DropResult) => {
    const draggedId = Number(result.draggableId);
    const during = flattenVisible(tree, expanded, draggedId);
    setDraggingId(null);
    const move = dropToMove(
      tree,
      during,
      draggedId,
      result.destination?.index ?? null,
      result.combine ? Number(result.combine.draggableId) : null
    );
    if (move) void commitMove(draggedId, move, '문서를 옮겼습니다');
  };

  if (!treeUrl || isLoading) {
    return (
      <div className="space-y-2 px-2.5 py-1" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-4 animate-pulse rounded bg-raised" />
        ))}
      </div>
    );
  }

  if (searchQuery.trim()) {
    const matches = searchTree(tree, searchQuery);
    return matches.length === 0 ? (
      <p className="px-2.5 py-2 text-xs text-muted-foreground">일치하는 문서가 없습니다</p>
    ) : (
      <ul className="flex flex-col">
        {matches.map((node) => (
          <li key={node.id}>
            <Link
              to={`/page/${node.slug}`}
              onClick={onNavigate}
              className="flex min-h-[32px] items-center gap-2 rounded-md px-2.5 text-[13.5px] text-foreground-secondary hover:bg-raised hover:text-foreground"
            >
              <PageIcon icon={node.icon} className="text-[14px]" />
              <span className="truncate">{node.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  if (tree.length === 0) {
    return <p className="px-2.5 py-2 text-xs text-muted-foreground">아직 문서가 없습니다</p>;
  }

  return (
    <>
      <p id="page-tree-help" className="sr-only">
        화살표 키로 이동하고 Enter로 엽니다. Alt와 화살표 키로 문서 위치를 옮깁니다.
      </p>
      <DragDropContext
        onBeforeCapture={(before) => setDraggingId(Number(before.draggableId))}
        onDragEnd={onDragEnd}
      >
        <Droppable droppableId="page-tree" isCombineEnabled>
          {(dropProvided) => (
            <div
              ref={dropProvided.innerRef}
              {...dropProvided.droppableProps}
              role="tree"
              aria-label="페이지 트리"
              aria-describedby="page-tree-help"
              className="flex flex-col"
            >
              {visible.map((row, index) => {
                const { node } = row;
                const isCurrent = current?.id === node.id;
                return (
                  <Draggable key={node.id} draggableId={String(node.id)} index={index}>
                    {(dragProvided, snapshot) => (
                      <div
                        ref={(element) => {
                          dragProvided.innerRef(element);
                          if (element) rowRefs.current.set(node.id, element);
                          else rowRefs.current.delete(node.id);
                        }}
                        {...dragProvided.draggableProps}
                        role="treeitem"
                        aria-level={row.depth + 1}
                        aria-setsize={row.siblingCount}
                        aria-posinset={row.index + 1}
                        aria-expanded={row.hasChildren ? row.expanded : undefined}
                        aria-selected={isCurrent}
                        aria-current={isCurrent ? 'page' : undefined}
                        tabIndex={focusableId === node.id ? 0 : -1}
                        onFocus={() => setActiveId(node.id)}
                        onKeyDown={(event) => onRowKeyDown(event, row, index)}
                        data-tree-page={node.id}
                        style={{
                          ...dragProvided.draggableProps.style,
                          paddingLeft: row.depth * 14,
                        }}
                        className={cn(
                          'group/tree flex min-h-[32px] items-center gap-0.5 rounded-md pr-1 text-[13.5px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                          isCurrent
                            ? 'bg-raised font-semibold text-foreground'
                            : 'text-foreground-secondary hover:bg-raised hover:text-foreground',
                          snapshot.isDragging && 'bg-card shadow-lg ring-1 ring-border',
                          snapshot.combineTargetFor && 'bg-highlight/15 ring-2 ring-highlight'
                        )}
                      >
                        <span
                          {...dragProvided.dragHandleProps}
                          tabIndex={-1}
                          aria-hidden="true"
                          title="드래그해서 옮기기"
                          data-testid="tree-drag-handle"
                          className="flex h-6 w-4 shrink-0 cursor-grab items-center justify-center text-muted-foreground opacity-0 transition-opacity group-hover/tree:opacity-100 active:cursor-grabbing [@media(hover:none)]:opacity-50"
                        >
                          <GripVertical className="h-3.5 w-3.5" />
                        </span>
                        <button
                          type="button"
                          tabIndex={-1}
                          aria-hidden="true"
                          onClick={() => row.hasChildren && setOpen(node.id, !row.expanded)}
                          className={cn(
                            'flex h-6 w-5 !min-h-0 !min-w-0 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent',
                            !row.hasChildren && 'invisible'
                          )}
                        >
                          {row.expanded ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <Link
                          to={`/page/${node.slug}`}
                          tabIndex={-1}
                          onClick={onNavigate}
                          className="flex min-w-0 flex-1 items-center gap-2 py-1"
                        >
                          <PageIcon icon={node.icon} className="text-[14px]" />
                          <span className="truncate">{node.title}</span>
                        </Link>
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={() => addChild(node)}
                          aria-label={`${node.title} 아래에 문서 추가`}
                          title="하위 문서 추가"
                          className="flex h-6 w-6 !min-h-0 !min-w-0 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover/tree:opacity-100 [@media(hover:none)]:opacity-60"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </Draggable>
                );
              })}
              {dropProvided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </>
  );
}
