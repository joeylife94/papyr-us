import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import { ChevronDown, ChevronRight, Hash, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageIcon } from '@/components/page/page-icon';
import { useWorkspaceScope } from '@/hooks/useActiveWorkspace';
import { TAG_CHIP_CLASS } from '@/lib/inline-markdown';
import { PERSONAL_SCOPE_LABEL } from '@/lib/page-scope';
import {
  buildTagTree,
  filterTagTree,
  flattenTagTree,
  matchesTagFilter,
  tagFromPanePath,
  tagPanePath,
  type TagSort,
  type TagTreeNode,
} from '@/lib/tag-pane';
import { cn } from '@/lib/utils';
import { tagAncestors, type TagCount } from '@shared/tags';

/** GET /api/tags/tree */
interface TagPaneList {
  tags: TagCount[];
  scannedPages: number;
  truncated: { pages: boolean; tags: boolean };
}

/** GET /api/tags/pages */
interface TagPanePages {
  tag: string;
  pages: Array<{
    id: number;
    title: string;
    slug: string;
    icon: string | null;
    teamId: number | null;
    updatedAt: string;
    tags: string[];
  }>;
  total: number;
  truncated: { pages: boolean; results: boolean };
}

class TagPaneError extends Error {
  constructor(readonly status: number) {
    super(`tag pane ${status}`);
  }
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { credentials: 'include', signal });
  if (!res.ok) throw new TagPaneError(res.status);
  return res.json();
}

function errorText(error: unknown, what: string): string {
  const status = error instanceof TagPaneError ? error.status : 0;
  if (status === 403) return '이 워크스페이스의 태그를 볼 수 없습니다.';
  return `${what}을 불러오지 못했습니다.`;
}

/**
 * The tag pane (#137): every tag of the workspace's readable pages (the tags field and inline
 * `#tags`), nested by `/`, with page counts; selecting a tag lists its pages. `/tags` is the
 * personal pane, `/teams/:teamName/tags` a team's; `/…/tags/<tag>` selects a tag (shareable).
 * Tag names are page text: they render as text and are URL-encoded in links.
 */
export default function TagsPage() {
  const { teamName } = useParams<{ teamName?: string }>();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const workspaceScope = useWorkspaceScope();
  const [searchParams, setSearchParams] = useSearchParams();

  const scopePath = teamName ? `/teams/${encodeURIComponent(teamName)}` : '';
  const scopeLabel = teamName
    ? workspaceScope.kind === 'team'
      ? workspaceScope.workspace.displayName
      : teamName
    : PERSONAL_SCOPE_LABEL;
  const teamQuery = teamName ? `teamId=${encodeURIComponent(teamName)}` : '';
  const selected = tagFromPanePath(pathname);
  const sort: TagSort = searchParams.get('sort') === 'count' ? 'count' : 'name';
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());

  const list = useQuery<TagPaneList>({
    queryKey: ['/api/tags/tree', teamName ?? ''],
    queryFn: ({ signal }) => fetchJson(`/api/tags/tree${teamQuery ? `?${teamQuery}` : ''}`, signal),
    // Pages change all the time: reload whenever the pane opens.
    staleTime: 0,
  });
  const pages = useQuery<TagPanePages>({
    queryKey: ['/api/tags/pages', teamName ?? '', selected],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ tag: selected ?? '' });
      if (teamName) params.set('teamId', teamName);
      return fetchJson(`/api/tags/pages?${params}`, signal);
    },
    enabled: !!selected,
    staleTime: 0,
  });

  // Open the parents of the selected tag, so it shows in the tree.
  useEffect(() => {
    if (!selected) return;
    setExpanded((current) => {
      const parents = tagAncestors(selected).slice(0, -1);
      if (parents.every((parent) => current.has(parent))) return current;
      return new Set([...current, ...parents]);
    });
  }, [selected]);

  const tree = useMemo(() => buildTagTree(list.data?.tags ?? [], sort), [list.data, sort]);
  const filtering = filter.trim().replace(/^#/, '') !== '';
  const shown = useMemo(() => filterTagTree(tree, filter), [tree, filter]);

  const toggle = (name: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(name)) next.add(name);
      return next;
    });
  const setSort = (next: TagSort) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'name') params.delete('sort');
    else params.set('sort', next);
    setSearchParams(params, { replace: true });
  };
  const sortSuffix = sort === 'count' ? '?sort=count' : '';
  const tagPath = (name: string) => `${tagPanePath(scopePath, name)}${sortSuffix}`;

  return (
    <div className="space-y-6 pb-16 lg:pb-0">
      <header className="space-y-1.5">
        <p className="truncate text-[13px] text-muted-foreground">{scopeLabel} · 워크스페이스</p>
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-[28px]">
            태그
          </h1>
          {list.data && (
            <span className="font-mono text-sm tabular-nums text-muted-foreground">
              태그 {list.data.tags.length}개
            </span>
          )}
        </div>
        <p className="text-sm text-foreground-secondary">
          문서의 태그 속성과 본문의 #태그를 모았습니다. 태그를 고르면 그 태그의 문서가 나옵니다.
        </p>
        {list.data?.truncated.pages && (
          <p className="text-[13px] text-muted-foreground" data-testid="tag-pane-truncated">
            최근 수정된 문서 {list.data.scannedPages}개의 태그만 셉니다.
          </p>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(240px,320px)_minmax(0,1fr)]">
        <section aria-label="태그 목록" className="min-w-0 space-y-3">
          <div className="flex items-center gap-2">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">태그 거르기</span>
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.keyCode === 229) return;
                  // The first tag that matches itself, not a parent shown on its way.
                  const first = flattenTagTree(shown).find((node) =>
                    matchesTagFilter(node.name, filter)
                  );
                  if (filtering && first) {
                    e.preventDefault();
                    navigate(tagPath(first.name));
                  }
                }}
                placeholder="태그 거르기"
                autoComplete="off"
                spellCheck={false}
                className="h-9 w-full rounded-lg border border-border bg-card pl-8 pr-2.5 text-[13.5px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <div role="group" aria-label="정렬" className="flex shrink-0 rounded-lg border p-0.5">
              {(['name', 'count'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={sort === option}
                  onClick={() => setSort(option)}
                  className={cn(
                    'h-7 rounded-md px-2 text-[12.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    sort === option
                      ? 'bg-raised font-semibold text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {option === 'name' ? '이름순' : '개수순'}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-1.5">
            {list.isLoading ? (
              <div className="space-y-1.5 p-1">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-7 w-full" />
                ))}
              </div>
            ) : list.isError ? (
              <div className="space-y-2 p-3 text-sm" role="alert">
                <p className="text-destructive">{errorText(list.error, '태그')}</p>
                <Button variant="outline" size="sm" onClick={() => list.refetch()}>
                  다시 시도
                </Button>
              </div>
            ) : tree.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">
                이 워크스페이스의 문서에 태그가 없습니다. 본문에 #태그를 쓰거나 태그 속성을
                추가하세요.
              </p>
            ) : shown.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">일치하는 태그가 없습니다.</p>
            ) : (
              <TagTree
                nodes={shown}
                selected={selected}
                isOpen={(name) => filtering || expanded.has(name)}
                onToggle={toggle}
                tagPath={tagPath}
              />
            )}
          </div>
          {list.data?.truncated.tags && (
            <p className="text-[12px] text-muted-foreground">
              문서가 많은 태그부터 {list.data.tags.length}개까지 보여 줍니다.
            </p>
          )}
        </section>

        <section aria-label="태그 문서" className="min-w-0">
          {!selected ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
              태그를 고르면 그 태그와 하위 태그가 붙은 문서가 여기에 나옵니다.
            </div>
          ) : (
            <TagPages
              tag={selected}
              query={pages}
              scopeLabel={scopeLabel}
              truncatedScan={!!list.data?.truncated.pages}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function TagTree({
  nodes,
  selected,
  isOpen,
  onToggle,
  tagPath,
  depth = 0,
}: {
  nodes: TagTreeNode[];
  selected: string | null;
  isOpen: (name: string) => boolean;
  onToggle: (name: string) => void;
  tagPath: (name: string) => string;
  depth?: number;
}) {
  return (
    <ul className="space-y-px" aria-label={depth === 0 ? '태그' : undefined}>
      {nodes.map((node) => {
        const open = node.children.length > 0 && isOpen(node.name);
        const current = node.name === selected;
        return (
          <li key={node.name}>
            <div
              className={cn(
                'flex min-h-[32px] items-center gap-1 rounded-md pr-1.5',
                current ? 'bg-raised' : 'hover:bg-raised/60'
              )}
              style={{ paddingLeft: depth * 14 }}
            >
              {node.children.length > 0 ? (
                <button
                  type="button"
                  onClick={() => onToggle(node.name)}
                  aria-expanded={open}
                  aria-label={`${node.name} ${open ? '접기' : '펼치기'}`}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {open ? (
                    <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </button>
              ) : (
                <span className="w-6 shrink-0" aria-hidden="true" />
              )}
              <Link
                to={tagPath(node.name)}
                aria-current={current ? 'page' : undefined}
                aria-label={`#${node.name}, 문서 ${node.count}개`}
                title={`#${node.name}`}
                data-tag={node.name}
                className={cn(
                  'flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1 text-[13.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  current ? 'font-semibold text-foreground' : 'text-foreground-secondary'
                )}
              >
                <Hash className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{node.label}</span>
                <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-muted-foreground">
                  {node.count}
                </span>
              </Link>
            </div>
            {open && (
              <TagTree
                nodes={node.children}
                selected={selected}
                isOpen={isOpen}
                onToggle={onToggle}
                tagPath={tagPath}
                depth={depth + 1}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function TagPages({
  tag,
  query,
  scopeLabel,
  truncatedScan,
}: {
  tag: string;
  query: { data?: TagPanePages; isLoading: boolean; isError: boolean; error: unknown };
  scopeLabel: string;
  truncatedScan: boolean;
}) {
  const data = query.data?.tag === tag ? query.data : undefined;
  return (
    <div className="space-y-3">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="min-w-0 break-words text-lg font-bold text-foreground">
          <span className={TAG_CHIP_CLASS}>#{tag}</span>
        </h2>
        {data && (
          <span className="font-mono text-sm tabular-nums text-muted-foreground">
            문서 {data.total}개
          </span>
        )}
      </div>
      {query.isError ? (
        <p className="text-sm text-destructive" role="alert">
          {errorText(query.error, '문서 목록')}
        </p>
      ) : !data ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : data.pages.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
          이 태그가 붙은 문서가 없습니다.
        </p>
      ) : (
        <ul aria-label={`#${tag} 태그 문서`} className="divide-y divide-border rounded-lg border">
          {data.pages.map((page) => {
            const nested = page.tags.filter((pageTag) => pageTag !== tag);
            return (
              <li key={page.id}>
                <Link
                  to={`/page/${encodeURIComponent(page.slug)}`}
                  className="flex min-h-[52px] items-center gap-3 px-3 py-2.5 transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <PageIcon icon={page.icon} className="w-5 text-center text-[16px]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-semibold text-foreground">
                      {page.title}
                    </span>
                    {nested.length > 0 && (
                      <span className="block truncate text-[12px] text-muted-foreground">
                        {nested.map((name) => `#${name}`).join(' ')}
                      </span>
                    )}
                  </span>
                  <span className="hidden shrink-0 rounded-md border border-border px-1.5 py-0.5 text-[11.5px] text-foreground-secondary sm:inline">
                    {page.teamId === null ? PERSONAL_SCOPE_LABEL : scopeLabel}
                  </span>
                  <span className="shrink-0 font-mono text-[11.5px] text-muted-foreground">
                    {formatDistanceToNow(new Date(page.updatedAt), { addSuffix: true, locale: ko })}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {data && (data.truncated.results || truncatedScan) && (
        <p className="text-[12px] text-muted-foreground">
          {data.truncated.results
            ? `최근 수정된 문서 ${data.pages.length}개를 보여 줍니다.`
            : '최근 수정된 문서에서만 찾았습니다.'}
        </p>
      )}
    </div>
  );
}
