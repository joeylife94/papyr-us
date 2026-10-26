import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ForceGraphMethods } from 'react-force-graph-2d';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { ScrollArea } from '../ui/scroll-area';
import { Skeleton } from '../ui/skeleton';
import { PageIcon } from '../page/page-icon';
import { cn } from '@/lib/utils';
import {
  Network,
  Search,
  Maximize2,
  Minimize2,
  RefreshCw,
  AlertCircle,
  FileText,
  X,
} from 'lucide-react';
import {
  ForceGraph2D,
  drawGraphNode,
  escapeGraphLabel,
  graphNodeText,
  linkEndId,
  useElementSize,
  useGraphPalette,
  type GraphPalette,
} from './graph-canvas';

/** A node of GET /api/knowledge-graph: ids, titles, slugs and icons only, never content. */
interface GraphNode {
  id: string;
  name: string;
  type: 'page' | 'tag' | 'orphan';
  val: number;
  pageId?: number;
  slug?: string;
  icon?: string | null;
  connections: number;
  tags?: string[];
}

/** `link`: a page link (page_links); `content`: a legacy `[[Title]]` text link. */
type GraphLinkType = 'link' | 'content' | 'tag' | 'ai-recommended';

interface GraphLink {
  source: string;
  target: string;
  type: GraphLinkType;
  strength: number;
  relevance?: number;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

interface KnowledgeGraphProps {
  /** Team id or name; omitted = every team of the caller. */
  teamId?: string;
}

const EDGE_LABELS: Record<GraphLinkType, string> = {
  link: '페이지 링크',
  content: '[[제목]] 텍스트 링크',
  tag: '태그 연결',
  'ai-recommended': 'AI 추천',
};

function edgeStyle(type: GraphLinkType, palette: GraphPalette) {
  switch (type) {
    case 'link':
      return { color: palette.edge, dash: null, width: 1.4, arrow: 3.5 };
    case 'content':
      return { color: palette.edge, dash: [4, 3], width: 1, arrow: 3 };
    case 'tag':
      return { color: palette.tagEdge, dash: [1, 3], width: 0.8, arrow: 0 };
    default:
      return { color: palette.aiEdge, dash: [6, 4], width: 1, arrow: 0 };
  }
}

function nodeColor(node: GraphNode, palette: GraphPalette) {
  if (node.type === 'tag') return palette.tag;
  if (node.type === 'orphan') return palette.orphan;
  return palette.page;
}

/** Legend swatch for an edge type, drawn with the same dash pattern as the canvas. */
function EdgeSwatch({ type, palette }: { type: GraphLinkType; palette: GraphPalette }) {
  const style = edgeStyle(type, palette);
  return (
    <svg aria-hidden="true" width="28" height="6" className="shrink-0">
      <line
        x1="1"
        y1="3"
        x2="27"
        y2="3"
        stroke={style.color}
        strokeWidth={Math.max(style.width, 1.2)}
        strokeDasharray={style.dash?.join(' ')}
      />
    </svg>
  );
}

function GraphLegend({ palette, className }: { palette: GraphPalette; className?: string }) {
  return (
    <ul className={className}>
      {(
        [
          ['페이지', palette.page],
          ['태그', palette.tag],
          ['고아 페이지', palette.orphan],
        ] as const
      ).map(([label, color]) => (
        <li key={label} className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
          {label}
        </li>
      ))}
      {(Object.keys(EDGE_LABELS) as GraphLinkType[]).map((type) => (
        <li key={type} className="flex items-center gap-2">
          <EdgeSwatch type={type} palette={palette} />
          {EDGE_LABELS[type]}
        </li>
      ))}
    </ul>
  );
}

export function KnowledgeGraph({ teamId }: KnowledgeGraphProps) {
  const navigate = useNavigate();
  const palette = useGraphPalette();
  const canvasRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<ForceGraphMethods>();
  const fitted = useRef(false);
  const configuredFor = useRef<ForceGraphMethods>();
  const { width, height } = useElementSize(canvasRef);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [includeAILinks, setIncludeAILinks] = useState(false);

  const params = new URLSearchParams();
  if (teamId) params.append('teamId', teamId);
  if (includeAILinks) params.append('includeAI', 'true');
  const query = params.toString();
  const {
    data: graph,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useQuery<GraphData>({
    queryKey: [`/api/knowledge-graph${query ? `?${query}` : ''}`],
    staleTime: 30_000,
  });

  const nodes = useMemo(() => graph?.nodes ?? [], [graph]);
  const links = useMemo(() => graph?.links ?? [], [graph]);
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const selectedNode = selectedId ? (nodeById.get(selectedId) ?? null) : null;
  const orphanPages = useMemo(() => nodes.filter((node) => node.type === 'orphan'), [nodes]);

  // force-graph mutates what it is given (positions, resolved link ends): hand it copies, and
  // keep the query data itself untouched for filtering and the side panel.
  const filteredData = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    const visible = nodes.filter((node) => !needle || node.name.toLowerCase().includes(needle));
    const ids = new Set(visible.map((node) => node.id));
    return {
      nodes: visible.map((node) => ({ ...node })),
      links: links
        .filter((link) => ids.has(link.source) && ids.has(link.target))
        .map((link) => ({ ...link })),
    };
  }, [nodes, links, searchQuery]);

  useEffect(() => {
    fitted.current = false;
  }, [filteredData]);

  const neighbourIds = useMemo(() => {
    const focus = hoveredId ?? selectedId;
    const ids = new Set<string>();
    if (!focus) return ids;
    for (const link of links) {
      if (link.source === focus) ids.add(link.target);
      if (link.target === focus) ids.add(link.source);
    }
    return ids;
  }, [links, hoveredId, selectedId]);

  /** Pages the selected page links to and pages linking to it (page and legacy links). */
  const selectedRelations = useMemo(() => {
    if (!selectedNode) return { outgoing: [], incoming: [] };
    const pick = (ids: string[]) =>
      ids
        .map((id) => nodeById.get(id))
        .filter((node): node is GraphNode => !!node && node.type !== 'tag');
    const pageLinks = links.filter((link) => link.type === 'link' || link.type === 'content');
    return {
      outgoing: pick(pageLinks.filter((l) => l.source === selectedNode.id).map((l) => l.target)),
      incoming: pick(pageLinks.filter((l) => l.target === selectedNode.id).map((l) => l.source)),
    };
  }, [selectedNode, links, nodeById]);

  const paintNode = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, scale: number) => {
      const focus = hoveredId ?? selectedId;
      const isFocus = node.id === focus;
      const isNear = neighbourIds.has(node.id);
      const dimmed = !!focus && !isFocus && !isNear;
      ctx.globalAlpha = dimmed ? 0.25 : 1;
      drawGraphNode(ctx, node, {
        radius: Math.min(3 + Math.sqrt(node.connections ?? 0) * 1.6, 10),
        color: isFocus ? palette.accent : nodeColor(node, palette),
        // Labels appear once zoomed in, or for the focused page and its neighbours.
        label:
          scale > 1.4 || isFocus || isNear
            ? graphNodeText(node.name, node.type === 'tag' ? null : node.icon)
            : undefined,
        labelColor: isFocus ? palette.label : palette.labelMuted,
        halo: palette.halo,
        scale,
        ring: node.id === selectedId ? palette.accent : undefined,
      });
      ctx.globalAlpha = 1;
    },
    [hoveredId, selectedId, neighbourIds, palette]
  );

  const stats = {
    totalPages: nodes.filter((node) => node.type !== 'tag').length,
    pageLinks: links.filter((link) => link.type === 'link').length,
    legacyLinks: links.filter((link) => link.type === 'content').length,
    orphanPages: orphanPages.length,
  };

  const openPage = (node: GraphNode | null) => {
    if (node?.slug) navigate(`/page/${node.slug}`);
  };

  const pageRow = (node: GraphNode, onSelect: () => void) => (
    <li key={node.id}>
      <button
        type="button"
        onClick={onSelect}
        className="flex min-h-[34px] w-full min-w-0 items-center gap-2 rounded-md px-2.5 text-left text-[13.5px] text-foreground-secondary transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <PageIcon icon={node.icon} />
        <span className="truncate">{node.name || '제목 없음'}</span>
      </button>
    </li>
  );

  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden border border-border bg-panel',
        isFullscreen ? 'fixed inset-0 z-50 rounded-none' : 'rounded-lg md:h-[640px]'
      )}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-3 sm:p-4">
        <div className="flex items-center gap-2">
          <Network aria-hidden="true" className="h-5 w-5 text-highlight" />
          <h2 className="text-base font-semibold">지식 그래프</h2>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="relative w-full min-w-0 sm:w-64">
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              placeholder="페이지 검색..."
              aria-label="그래프에서 페이지 검색"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button
            variant={includeAILinks ? 'default' : 'outline'}
            onClick={() => setIncludeAILinks(!includeAILinks)}
            disabled={includeAILinks && isFetching}
            aria-pressed={includeAILinks}
            className="gap-2"
          >
            {includeAILinks && isFetching ? (
              <RefreshCw aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <span aria-hidden="true" className="font-mono text-[11px]">
                AI
              </span>
            )}
            {includeAILinks && isFetching
              ? 'AI 링크 생성 중...'
              : includeAILinks
                ? 'AI 링크 ON'
                : 'AI 링크 OFF'}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => refetch()}
            title="새로고침"
            aria-label="새로고침"
          >
            <RefreshCw aria-hidden="true" className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? '최소화' : '전체화면'}
            aria-label={isFullscreen ? '최소화' : '전체화면'}
          >
            {isFullscreen ? (
              <Minimize2 aria-hidden="true" className="h-4 w-4" />
            ) : (
              <Maximize2 aria-hidden="true" className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Graph canvas: visual only; the side panel lists the same pages as text. */}
        <div
          ref={canvasRef}
          className="relative h-[420px] min-w-0 bg-muted/20 md:h-auto md:flex-1"
          aria-hidden="true"
        >
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <RefreshCw className="mx-auto mb-2 h-8 w-8 animate-spin text-highlight" />
                <p className="text-sm text-muted-foreground">그래프 생성 중...</p>
              </div>
            </div>
          ) : isError ? (
            <div className="absolute inset-0 flex items-center justify-center p-4 text-center">
              <p className="text-sm text-muted-foreground">그래프를 불러오지 못했습니다.</p>
            </div>
          ) : filteredData.nodes.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <div className="text-center">
                <FileText className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="mb-2 text-lg font-semibold">페이지가 없습니다</h3>
                <p className="text-sm text-muted-foreground">
                  위키 페이지를 만들어 지식 그래프를 구축하세요
                </p>
              </div>
            </div>
          ) : (
            width > 0 &&
            height > 0 && (
              <Suspense fallback={<Skeleton className="absolute inset-0 rounded-none" />}>
                <ForceGraph2D
                  ref={graphRef}
                  graphData={filteredData}
                  width={width}
                  height={height}
                  nodeId="id"
                  nodeLabel={(node: any) =>
                    escapeGraphLabel(
                      graphNodeText(node.name, node.type === 'tag' ? null : node.icon, 80)
                    )
                  }
                  nodeVal={(node: any) => node.val}
                  nodeCanvasObject={paintNode}
                  nodePointerAreaPaint={(node: any, color, ctx) => {
                    ctx.fillStyle = color;
                    ctx.beginPath();
                    ctx.arc(node.x ?? 0, node.y ?? 0, 8, 0, 2 * Math.PI);
                    ctx.fill();
                  }}
                  linkColor={(link: any) => edgeStyle(link.type, palette).color}
                  linkLineDash={(link: any) => edgeStyle(link.type, palette).dash}
                  linkWidth={(link: any) => edgeStyle(link.type, palette).width}
                  linkDirectionalArrowLength={(link: any) => edgeStyle(link.type, palette).arrow}
                  linkDirectionalArrowRelPos={0.92}
                  linkVisibility={(link: any) => {
                    const focus = hoveredId ?? selectedId;
                    if (!focus || link.type !== 'tag') return true;
                    return linkEndId(link.source) === focus || linkEndId(link.target) === focus;
                  }}
                  onNodeClick={(node: any) => setSelectedId(node.id)}
                  onNodeHover={(node: any) => setHoveredId(node?.id ?? null)}
                  onBackgroundClick={() => setSelectedId(null)}
                  cooldownTicks={100}
                  d3VelocityDecay={0.3}
                  onEngineTick={() => {
                    // Bound the repulsion so unconnected pages stay near the rest of the graph.
                    const graph = graphRef.current;
                    if (!graph || configuredFor.current === graph) return;
                    configuredFor.current = graph;
                    graph.d3Force('charge')?.distanceMax(160);
                  }}
                  onEngineStop={() => {
                    if (fitted.current) return;
                    fitted.current = true;
                    graphRef.current?.zoomToFit(400, 48);
                  }}
                />
              </Suspense>
            )
          )}

          {/* Statistics */}
          <div className="pointer-events-none absolute left-3 top-3 hidden w-52 rounded-lg border border-border bg-raised/90 p-3 text-xs shadow-sm sm:block">
            <p className="mb-2 font-mono text-[11px] uppercase text-muted-foreground">통계</p>
            <dl className="space-y-1">
              {[
                ['총 페이지', stats.totalPages],
                ['페이지 링크', stats.pageLinks],
                ['텍스트 링크', stats.legacyLinks],
                ['고아 페이지', stats.orphanPages],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Legend (overlay from sm up; below the canvas on phones) */}
          <div className="pointer-events-none absolute bottom-3 left-3 hidden rounded-lg border border-border bg-raised/90 p-3 text-xs shadow-sm sm:block">
            <p className="mb-2 font-mono text-[11px] uppercase text-muted-foreground">범례</p>
            <GraphLegend palette={palette} className="space-y-1.5" />
          </div>
        </div>
        <div aria-hidden="true" className="border-t border-border px-4 py-3 text-xs sm:hidden">
          <GraphLegend palette={palette} className="flex flex-wrap gap-x-4 gap-y-1.5" />
        </div>

        {/* Side panel: the selected node, or the orphan pages */}
        <aside
          aria-label={selectedNode ? '선택한 노드' : '고아 페이지'}
          className="flex max-h-[480px] w-full flex-col overflow-hidden border-t border-border bg-panel md:max-h-none md:w-80 md:border-l md:border-t-0"
        >
          {selectedNode ? (
            <>
              <div className="border-b border-border p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h3 className="flex min-w-0 items-center gap-2 font-semibold">
                    {selectedNode.type !== 'tag' && (
                      <PageIcon icon={selectedNode.icon} className="text-base" />
                    )}
                    <span className="line-clamp-2">{selectedNode.name}</span>
                  </h3>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedId(null)}
                    aria-label="선택 해제"
                  >
                    <X aria-hidden="true" className="h-4 w-4" />
                  </Button>
                </div>
                <Badge variant={selectedNode.type === 'orphan' ? 'destructive' : 'secondary'}>
                  {selectedNode.type === 'page'
                    ? '페이지'
                    : selectedNode.type === 'tag'
                      ? '태그'
                      : '고아 페이지'}
                </Badge>
              </div>
              <ScrollArea className="flex-1">
                <div className="space-y-4 p-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">연결 수</span>
                    <span className="font-medium">{selectedNode.connections}</span>
                  </div>
                  {selectedNode.tags && selectedNode.tags.length > 0 && (
                    <div>
                      <p className="mb-1 text-sm text-muted-foreground">태그</p>
                      <div className="flex flex-wrap gap-1">
                        {selectedNode.tags.map((tag) => (
                          <Badge key={tag} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedNode.type !== 'tag' &&
                    (
                      [
                        ['나가는 링크', selectedRelations.outgoing],
                        ['들어오는 링크', selectedRelations.incoming],
                      ] as const
                    ).map(([label, list]) => (
                      <div key={label}>
                        <p className="pb-1.5 font-mono text-[11px] uppercase text-muted-foreground">
                          {label}
                        </p>
                        {list.length === 0 ? (
                          <p className="text-[13px] text-muted-foreground">없음</p>
                        ) : (
                          <ul className="space-y-0.5">
                            {list.map((node) => pageRow(node, () => setSelectedId(node.id)))}
                          </ul>
                        )}
                      </div>
                    ))}

                  {selectedNode.slug && (
                    <Button className="w-full" onClick={() => openPage(selectedNode)}>
                      <FileText aria-hidden="true" className="mr-2 h-4 w-4" />
                      페이지 열기
                    </Button>
                  )}

                  {selectedNode.type === 'orphan' && (
                    <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                        <div>
                          <p className="mb-1 text-sm font-medium text-destructive">고아 페이지</p>
                          <p className="text-xs text-muted-foreground">
                            다른 페이지와 연결이 없습니다. 태그를 추가하거나 다른 페이지에서 링크를
                            추가하세요.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </>
          ) : (
            <>
              <div className="border-b border-border p-4">
                <h3 className="flex items-center gap-2 font-semibold">
                  <AlertCircle aria-hidden="true" className="h-5 w-5 text-destructive" />
                  고아 페이지
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">연결이 없는 페이지들</p>
              </div>
              <ScrollArea className="flex-1">
                {orphanPages.length === 0 ? (
                  <p className="p-4 text-center text-sm text-muted-foreground">
                    고아 페이지가 없습니다.
                  </p>
                ) : (
                  <ul className="space-y-0.5 p-2">
                    {orphanPages.map((node) => pageRow(node, () => setSelectedId(node.id)))}
                  </ul>
                )}
              </ScrollArea>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
