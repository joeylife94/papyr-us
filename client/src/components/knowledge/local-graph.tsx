import { Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ForceGraphMethods } from 'react-force-graph-2d';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Network } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { PageIcon } from '@/components/page/page-icon';
import {
  ForceGraph2D,
  drawGraphNode,
  escapeGraphLabel,
  graphNodeText,
  useElementSize,
  useGraphPalette,
} from './graph-canvas';

interface LocalGraphNode {
  id: number;
  title: string;
  slug: string;
  icon: string | null;
}

interface LocalGraphResponse {
  nodes: LocalGraphNode[];
  edges: Array<{ source: number; target: number }>;
}

const OPEN_STORAGE_KEY = 'papyrus:local-graph-open';
const CANVAS_HEIGHT = 260;

function readOpen(): boolean {
  try {
    return window.localStorage.getItem(OPEN_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeOpen(open: boolean) {
  try {
    window.localStorage.setItem(OPEN_STORAGE_KEY, open ? '1' : '0');
  } catch {
    // Storage may be unavailable (private mode); the panel then simply starts collapsed.
  }
}

/** Neighbours of the centre page, grouped the way the text alternative lists them. */
function groupNeighbours(graph: LocalGraphResponse | undefined, pageId: number) {
  const byId = new Map((graph?.nodes ?? []).map((node) => [node.id, node]));
  const outgoing = new Set<number>();
  const incoming = new Set<number>();
  for (const edge of graph?.edges ?? []) {
    if (edge.source === pageId) outgoing.add(edge.target);
    if (edge.target === pageId) incoming.add(edge.source);
  }
  const pick = (ids: Iterable<number>) =>
    [...ids]
      .map((id) => byId.get(id))
      .filter((node): node is LocalGraphNode => !!node)
      .sort((a, b) => a.title.localeCompare(b.title));
  const further = (graph?.nodes ?? []).filter(
    (node) => node.id !== pageId && !outgoing.has(node.id) && !incoming.has(node.id)
  );
  return {
    outgoing: pick(outgoing),
    incoming: pick(incoming),
    further: pick(further.map((n) => n.id)),
  };
}

/**
 * "연결 그래프" (#111 §2): the page with its outgoing links and backlinks (depth 1, or 2), as a
 * force graph plus a text list of the same pages. Collapsed by default; the choice is
 * remembered per browser. The graph library loads only when the panel is opened, and the text
 * list is always in the DOM (visually hidden while collapsed) so screen readers get the same
 * neighbours without the canvas.
 */
export function LocalGraphPanel({ pageId }: { pageId: number }) {
  const [open, setOpen] = useState(readOpen);
  const [depth, setDepth] = useState<1 | 2>(1);
  const regionId = useId();
  const { data, isLoading, isError } = useQuery<LocalGraphResponse>({
    queryKey: [`/api/pages/${pageId}/graph?depth=${depth}`],
    staleTime: 30_000,
    // Keep the current neighbours on screen while the other depth loads.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[0] === `/api/pages/${pageId}/graph?depth=${depth === 1 ? 2 : 1}`
        ? previous
        : undefined,
  });
  const groups = useMemo(() => groupNeighbours(data, pageId), [data, pageId]);
  const total = Math.max((data?.nodes.length ?? 1) - 1, 0);

  const toggle = () => {
    setOpen(!open);
    writeOpen(!open);
  };

  const linkTabIndex = open ? undefined : -1;
  const list = (title: string, nodes: LocalGraphNode[]) => (
    <div className="min-w-0">
      <h3 className="pb-1.5 font-mono text-[11px] uppercase text-muted-foreground">{title}</h3>
      {nodes.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">없음</p>
      ) : (
        <ul className="space-y-0.5">
          {nodes.map((node) => (
            <li key={node.id}>
              <Link
                to={`/page/${node.slug}`}
                tabIndex={linkTabIndex}
                className="flex min-h-[30px] min-w-0 items-center gap-2 rounded-md px-2 text-[13.5px] text-foreground-secondary transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <PageIcon icon={node.icon} />
                <span className="truncate">{node.title || '제목 없음'}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="rounded-lg border border-border bg-panel" data-testid="local-graph-panel">
      <h2 className="text-sm font-medium">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={regionId}
          onClick={toggle}
          className="flex min-h-[44px] w-full items-center gap-2 rounded-lg px-4 text-left text-foreground transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight
            aria-hidden="true"
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform',
              open && 'rotate-90'
            )}
          />
          <Network aria-hidden="true" className="h-4 w-4 text-highlight" />
          연결 그래프
          <span className="ml-auto font-mono text-[11px] text-muted-foreground">
            {isLoading ? '…' : isError ? '—' : `${total}개 문서`}
          </span>
        </button>
      </h2>

      <div id={regionId} hidden={!open} className="border-t border-border px-4 pb-3 pt-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-[12.5px] text-muted-foreground">노드를 누르면 그 문서로 이동합니다.</p>
          <div
            role="group"
            aria-label="그래프 깊이"
            className="flex shrink-0 rounded-md border border-border p-0.5"
          >
            {([1, 2] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={depth === value}
                onClick={() => setDepth(value)}
                className={cn(
                  'min-h-[28px] whitespace-nowrap rounded px-2.5 text-[12.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  depth === value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {value}단계
              </button>
            ))}
          </div>
        </div>
        {open && (
          <div
            aria-hidden="true"
            className="overflow-hidden rounded-md border border-border bg-muted/30"
            style={{ height: CANVAS_HEIGHT }}
          >
            {isError ? (
              <p className="p-4 text-sm text-muted-foreground">그래프를 불러오지 못했습니다.</p>
            ) : !data ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <Suspense fallback={<Skeleton className="h-full w-full" />}>
                <LocalGraphCanvas graph={data} pageId={pageId} />
              </Suspense>
            )}
          </div>
        )}
      </div>

      {/* Text alternative of the graph: always in the DOM, visible while the panel is open. */}
      <nav
        aria-label="연결된 문서"
        className={open ? 'grid gap-4 px-4 pb-4 sm:grid-cols-2' : 'sr-only'}
        data-testid="local-graph-list"
      >
        {isError ? (
          <p className="text-sm text-muted-foreground">연결된 문서를 불러오지 못했습니다.</p>
        ) : (
          <>
            {list('나가는 링크', groups.outgoing)}
            {list('들어오는 링크', groups.incoming)}
            {depth === 2 && groups.further.length > 0 && list('2단계 연결', groups.further)}
          </>
        )}
      </nav>
    </div>
  );
}

function LocalGraphCanvas({ graph, pageId }: { graph: LocalGraphResponse; pageId: number }) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<ForceGraphMethods>();
  const fitted = useRef(false);
  const { width } = useElementSize(containerRef);
  const palette = useGraphPalette();
  // force-graph mutates what it is given (positions, resolved link ends): hand it copies.
  const graphData = useMemo(
    () => ({
      nodes: graph.nodes.map((node) => ({ ...node })),
      links: graph.edges.map((edge) => ({ ...edge })),
    }),
    [graph]
  );
  useEffect(() => {
    fitted.current = false;
  }, [graphData]);

  const paintNode = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, scale: number) => {
      const centre = node.id === pageId;
      drawGraphNode(ctx, node, {
        radius: centre ? 6 : 4,
        color: centre ? palette.accent : palette.page,
        label: graphNodeText(node.title, node.icon, 22),
        labelColor: centre ? palette.label : palette.labelMuted,
        halo: palette.halo,
        scale,
      });
    },
    [pageId, palette]
  );

  return (
    <div ref={containerRef} className="h-full w-full">
      {width > 0 && (
        <ForceGraph2D
          ref={graphRef}
          graphData={graphData}
          width={width}
          height={CANVAS_HEIGHT}
          nodeId="id"
          nodeLabel={(node: any) => escapeGraphLabel(graphNodeText(node.title, node.icon, 80))}
          nodeCanvasObject={paintNode}
          nodePointerAreaPaint={(node: any, color, ctx) => {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(node.x ?? 0, node.y ?? 0, 8, 0, 2 * Math.PI);
            ctx.fill();
          }}
          linkColor={() => palette.edge}
          linkWidth={1}
          linkDirectionalArrowLength={3}
          linkDirectionalArrowRelPos={0.9}
          onNodeClick={(node: any) => {
            if (node.id !== pageId && node.slug) navigate(`/page/${node.slug}`);
          }}
          maxZoom={2.5}
          cooldownTicks={80}
          d3VelocityDecay={0.35}
          onEngineStop={() => {
            if (fitted.current) return;
            fitted.current = true;
            graphRef.current?.zoomToFit(300, 36);
          }}
        />
      )}
    </div>
  );
}
