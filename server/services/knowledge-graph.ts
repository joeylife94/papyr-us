/**
 * Knowledge graph and page-neighbourhood views (#111 §1, §2, §5).
 *
 * The storage layer returns only rows the viewer may read (`readablePageCondition` /
 * `readablePagesInScope`); this module turns them into response shapes and enforces the
 * remaining invariants on its own, so a caller passing wider input still cannot leak:
 *
 * - every edge has both ends inside the returned node set;
 * - responses never carry page content or any body text (except the short mention snippet of a
 *   page the viewer can read);
 * - AI suggestions are untrusted: an edge to a page outside the node set is dropped.
 */
import { splitPageLinks } from '../../shared/page-links.js';
import logger from './logger.js';

/** A readable page as the graph builder receives it. `content` is used here, never returned. */
export interface GraphSourcePage {
  id: number;
  title: string;
  slug: string;
  icon: string | null;
  tags: string[] | null;
  content: string | null;
}

/** One `page_links` row. */
export interface GraphSourceLink {
  sourcePageId: number;
  targetPageId: number;
}

/** An AI-suggested relation between two pages (untrusted model output). */
export interface AiLinkSuggestion {
  sourcePageId: number;
  targetPageId: number;
  relevance: number;
  reason?: string;
}

export type KnowledgeGraphNodeType = 'page' | 'orphan' | 'tag';
/** `link`: a `[[page:<id>]]` link (page_links); `content`: a legacy `[[Title]]` text link. */
export type KnowledgeGraphEdgeType = 'link' | 'content' | 'tag' | 'ai-recommended';

export interface KnowledgeGraphNode {
  id: string;
  name: string;
  type: KnowledgeGraphNodeType;
  val: number;
  color: string;
  connections: number;
  pageId?: number;
  slug?: string;
  icon?: string | null;
  tags?: string[];
}

export interface KnowledgeGraphEdge {
  source: string;
  target: string;
  type: KnowledgeGraphEdgeType;
  strength: number;
  relevance?: number;
  reason?: string;
}

export interface KnowledgeGraph {
  nodes: KnowledgeGraphNode[];
  links: KnowledgeGraphEdge[];
}

const NODE_COLORS: Record<KnowledgeGraphNodeType, string> = {
  page: '#3B82F6',
  orphan: '#EF4444',
  tag: '#F59E0B',
};
const EDGE_STRENGTH: Record<KnowledgeGraphEdgeType, number> = {
  link: 2,
  content: 2,
  tag: 1,
  'ai-recommended': 1,
};
const AI_MIN_RELEVANCE = 0.5;
const MAX_AI_REASON_LENGTH = 300;

const pageNodeId = (pageId: number) => `page-${pageId}`;
/** Whether `text` is exactly one `[[page:<id>]]` token. */
function isPageLinkToken(text: string): boolean {
  const parts = splitPageLinks(text);
  return parts.length === 1 && parts[0].kind === 'link';
}

/** `text` with every `[[page:<id>]]` token replaced by a space. */
function withoutPageLinks(text: string): string {
  return splitPageLinks(text)
    .map((part) => (part.kind === 'text' ? part.text : ' '))
    .join('');
}

/**
 * Titles referenced by legacy `[[Title]]` text links in `content`. Page link tokens
 * (`[[page:<id>]]`) are not titles: they become edges through `page_links` instead.
 */
export function extractLegacyLinkTitles(content: string | null | undefined): string[] {
  if (!content) return [];
  const titles: string[] = [];
  for (const match of content.matchAll(/\[\[([^\]]+)\]\]/g)) {
    if (isPageLinkToken(match[0])) continue;
    const title = match[1].trim();
    if (title) titles.push(title);
  }
  return titles;
}

/**
 * Build the knowledge graph from readable pages, the `page_links` rows among them, and optional
 * AI suggestions. Page edges, legacy text edges and AI edges are kept only when both ends are in
 * `pages`; duplicate pairs collapse to the strongest kind (link, then legacy text, then AI).
 */
export function buildKnowledgeGraph(
  pages: GraphSourcePage[],
  links: GraphSourceLink[],
  options: { aiLinks?: AiLinkSuggestion[] } = {}
): KnowledgeGraph {
  const pageIds = new Set(pages.map((page) => page.id));
  const nodes: KnowledgeGraphNode[] = pages.map((page) => ({
    id: pageNodeId(page.id),
    name: page.title,
    type: 'page',
    val: 10,
    color: NODE_COLORS.page,
    connections: 0,
    pageId: page.id,
    slug: page.slug,
    icon: page.icon ?? null,
    tags: page.tags ?? [],
  }));
  const edges: KnowledgeGraphEdge[] = [];
  const directed = new Set<string>();
  const undirected = new Set<string>();
  const addPageEdge = (
    sourceId: number,
    targetId: number,
    type: KnowledgeGraphEdgeType,
    extra: Partial<KnowledgeGraphEdge> = {}
  ) => {
    if (sourceId === targetId || !pageIds.has(sourceId) || !pageIds.has(targetId)) return;
    const key = `${sourceId}->${targetId}`;
    const pairKey = sourceId < targetId ? `${sourceId}-${targetId}` : `${targetId}-${sourceId}`;
    // AI suggestions only fill gaps: they never sit beside a real edge in either direction.
    if (directed.has(key) || (type === 'ai-recommended' && undirected.has(pairKey))) return;
    directed.add(key);
    undirected.add(pairKey);
    edges.push({
      source: pageNodeId(sourceId),
      target: pageNodeId(targetId),
      type,
      strength: EDGE_STRENGTH[type],
      ...extra,
    });
  };

  // 1. Page links (`[[page:<id>]]`, indexed in page_links).
  for (const link of links) addPageEdge(link.sourcePageId, link.targetPageId, 'link');

  // 2. Legacy `[[Title]]` text links, matched only among the returned (readable) pages.
  const idByTitle = new Map<string, number>();
  for (const page of pages) {
    const key = page.title.trim().toLowerCase();
    if (key && !idByTitle.has(key)) idByTitle.set(key, page.id);
  }
  for (const page of pages) {
    for (const title of extractLegacyLinkTitles(page.content)) {
      const targetId = idByTitle.get(title.toLowerCase());
      if (targetId !== undefined) addPageEdge(page.id, targetId, 'content');
    }
  }

  // 3. Tags shared by more than one page become tag nodes.
  const pagesByTag = new Map<string, number[]>();
  for (const page of pages) {
    for (const tag of new Set(page.tags ?? [])) {
      if (!tag) continue;
      pagesByTag.set(tag, [...(pagesByTag.get(tag) ?? []), page.id]);
    }
  }
  pagesByTag.forEach((ids, tag) => {
    if (ids.length < 2) return;
    nodes.push({
      id: `tag-${tag}`,
      name: `#${tag}`,
      type: 'tag',
      val: 10,
      color: NODE_COLORS.tag,
      connections: 0,
    });
    for (const id of ids) {
      edges.push({
        source: pageNodeId(id),
        target: `tag-${tag}`,
        type: 'tag',
        strength: EDGE_STRENGTH.tag,
      });
    }
  });

  // 4. AI suggestions (untrusted): only between returned pages, only where no edge exists.
  for (const suggestion of options.aiLinks ?? []) {
    if (!(suggestion.relevance > AI_MIN_RELEVANCE)) continue;
    addPageEdge(suggestion.sourcePageId, suggestion.targetPageId, 'ai-recommended', {
      relevance: suggestion.relevance,
      reason: String(suggestion.reason ?? '').slice(0, MAX_AI_REASON_LENGTH),
    });
  }

  const degree = new Map<string, number>();
  for (const edge of edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }
  for (const node of nodes) {
    node.connections = degree.get(node.id) ?? 0;
    node.val = 10 + node.connections * 3;
    if (node.type !== 'tag' && node.connections === 0) {
      node.type = 'orphan';
      node.color = NODE_COLORS.orphan;
    }
  }

  return { nodes, links: edges };
}

type FindRelatedPages = (
  content: string,
  title: string,
  pages: Array<{ id: number; title: string; content: string; tags: string[] }>
) => Promise<Array<{ pageId: number; relevance: number; reason?: string }> | undefined>;

/**
 * AI-suggested relations for a random sample of pages with enough content (the opt-in
 * `includeAI` graph mode). Only readable pages are sent to the provider; failures are logged
 * and skipped, so the graph still renders without suggestions.
 */
export async function suggestAiLinks(
  pages: GraphSourcePage[],
  findRelatedPages: FindRelatedPages,
  options: { sampleSize?: number; random?: () => number } = {}
): Promise<AiLinkSuggestion[]> {
  const random = options.random ?? Math.random;
  const candidates = pages.map((page) => ({
    id: page.id,
    title: page.title,
    content: page.content ?? '',
    tags: page.tags ?? [],
  }));
  const sample = candidates
    .filter((page) => page.content.length > 100)
    .map((page) => ({ page, order: random() }))
    .sort((a, b) => a.order - b.order)
    .slice(0, options.sampleSize ?? 20)
    .map(({ page }) => page);

  const suggestions: AiLinkSuggestion[] = [];
  for (const page of sample) {
    try {
      const related = await findRelatedPages(
        page.content,
        page.title,
        candidates.filter((candidate) => candidate.id !== page.id)
      );
      for (const item of (related ?? []).slice(0, 3)) {
        suggestions.push({
          sourcePageId: page.id,
          targetPageId: Number(item.pageId),
          relevance: Number(item.relevance) || 0,
          reason: item.reason,
        });
      }
    } catch (error) {
      logger.warn('AI link suggestion failed for a graph page', {
        pageId: page.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return suggestions;
}

/** A page in a local graph or mention list: never its content. */
export interface PageGraphNode {
  id: number;
  title: string;
  slug: string;
  icon: string | null;
}

export interface LocalPageGraph {
  nodes: PageGraphNode[];
  edges: Array<{ source: number; target: number }>;
}

/**
 * Normalise a local graph: the centre page first, neighbours by title, and only edges whose ends
 * are both nodes (no self-loops, no duplicates).
 */
export function shapeLocalGraph(
  centre: PageGraphNode,
  neighbours: PageGraphNode[],
  links: GraphSourceLink[]
): LocalPageGraph {
  const byId = new Map<number, PageGraphNode>([[centre.id, centre]]);
  for (const node of [...neighbours].sort(
    (a, b) => a.title.localeCompare(b.title) || a.id - b.id
  )) {
    if (!byId.has(node.id)) byId.set(node.id, node);
  }
  const seen = new Set<string>();
  const edges: LocalPageGraph['edges'] = [];
  for (const link of links) {
    const { sourcePageId: source, targetPageId: target } = link;
    const key = `${source}->${target}`;
    if (source === target || !byId.has(source) || !byId.has(target) || seen.has(key)) continue;
    seen.add(key);
    edges.push({ source, target });
  }
  edges.sort((a, b) => a.source - b.source || a.target - b.target);
  const pick = ({ id, title, slug, icon }: PageGraphNode) => ({ id, title, slug, icon });
  return { nodes: [...byId.values()].map(pick), edges };
}

/** Local graph depth from a query value: absent → 1; only 1 and 2 are valid. */
export function parseLocalGraphDepth(value: unknown): 1 | 2 | null {
  if (value === undefined || value === '') return 1;
  if (value === '1' || value === 1) return 1;
  if (value === '2' || value === 2) return 2;
  return null;
}

/** Titles shorter than this produce no unlinked mentions (too many false matches). */
export const MIN_MENTION_TITLE_LENGTH = 2;
export const MENTION_SNIPPET_LENGTH = 120;

/** Whether `title` is long enough to look for unlinked mentions of it. */
export function isMentionableTitle(title: string): boolean {
  return [...title.trim()].length >= MIN_MENTION_TITLE_LENGTH;
}

/**
 * A ≈120-character plain-text snippet around the first case-insensitive, literal occurrence of
 * `title` in `excerpt` (a window of the page content starting at character `offset`).
 * Link tokens are dropped and whitespace collapsed; the result is untrusted text, never HTML.
 */
export function buildMentionSnippet(
  excerpt: string,
  title: string,
  options: { offset?: number; contentLength?: number; length?: number } = {}
): string {
  const length = options.length ?? MENTION_SNIPPET_LENGTH;
  const cleaned = withoutPageLinks(excerpt).replace(/\s+/g, ' ');
  const needle = title.trim().replace(/\s+/g, ' ');
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const index = needle ? cleaned.search(new RegExp(escaped, 'i')) : -1;
  const at = index < 0 ? 0 : index;

  const lead = Math.max(0, Math.floor((length - needle.length) / 3));
  let start = Math.max(0, at - lead);
  const end = Math.min(cleaned.length, start + length);
  start = Math.max(0, Math.min(start, end - length));
  const snippet = cleaned.slice(start, end).trim();

  const startsInside = start > 0 || (options.offset ?? 0) > 0;
  const excerptEnd = (options.offset ?? 0) + excerpt.length;
  const endsInside =
    end < cleaned.length ||
    (options.contentLength !== undefined && excerptEnd < options.contentLength);
  return `${startsInside ? '…' : ''}${snippet}${endsInside ? '…' : ''}`;
}
