import { describe, expect, it, vi } from 'vitest';
import {
  buildKnowledgeGraph,
  buildMentionSnippet,
  extractLegacyLinkTitles,
  isMentionableTitle,
  parseLocalGraphDepth,
  shapeLocalGraph,
  suggestAiLinks,
  type GraphSourcePage,
} from '../../server/services/knowledge-graph';

function page(id: number, overrides: Partial<GraphSourcePage> = {}): GraphSourcePage {
  return {
    id,
    title: `Page ${id}`,
    slug: `page-${id}`,
    icon: null,
    tags: [],
    content: '',
    ...overrides,
  };
}

const edgeKeys = (graph: ReturnType<typeof buildKnowledgeGraph>) =>
  graph.links.map((link) => `${link.source}>${link.target}:${link.type}`).sort();

describe('extractLegacyLinkTitles', () => {
  it('returns [[Title]] references and skips page link tokens', () => {
    expect(extractLegacyLinkTitles('See [[Roadmap]] and [[page:12]] and [[ Ops notes ]].')).toEqual(
      ['Roadmap', 'Ops notes']
    );
    expect(extractLegacyLinkTitles(null)).toEqual([]);
  });
});

describe('buildKnowledgeGraph', () => {
  it('turns page_links rows into link edges and carries icons, never content', () => {
    const graph = buildKnowledgeGraph(
      [page(1, { icon: '🗺️', content: 'secret body' }), page(2)],
      [{ sourcePageId: 1, targetPageId: 2 }]
    );

    expect(edgeKeys(graph)).toEqual(['page-1>page-2:link']);
    const first = graph.nodes.find((node) => node.id === 'page-1')!;
    expect(first).toMatchObject({ icon: '🗺️', pageId: 1, slug: 'page-1', type: 'page' });
    expect(first.connections).toBe(1);
    expect(JSON.stringify(graph)).not.toContain('secret body');
    expect(graph.nodes.every((node) => !('content' in node))).toBe(true);
  });

  it('drops link rows whose ends are not both in the returned pages', () => {
    const graph = buildKnowledgeGraph(
      [page(1), page(2)],
      [
        { sourcePageId: 1, targetPageId: 99 },
        { sourcePageId: 99, targetPageId: 2 },
        { sourcePageId: 1, targetPageId: 1 },
      ]
    );

    expect(graph.links).toEqual([]);
    expect(graph.nodes.map((node) => node.id)).toEqual(['page-1', 'page-2']);
    expect(graph.nodes.every((node) => node.type === 'orphan')).toBe(true);
  });

  it('keeps legacy [[Title]] edges as a second type, matched only among the given pages', () => {
    const graph = buildKnowledgeGraph(
      [
        page(1, { content: 'Links to [[page 2]], [[Hidden page]] and [[Page 2]] again.' }),
        page(2, { content: '[[Page 1]]' }),
        page(3, { content: '[[Page 1]]' }),
      ],
      [{ sourcePageId: 2, targetPageId: 1 }]
    );

    // 2→1 is already a page link, so its legacy duplicate collapses into it.
    expect(edgeKeys(graph)).toEqual([
      'page-1>page-2:content',
      'page-2>page-1:link',
      'page-3>page-1:content',
    ]);
  });

  it('adds tag nodes for tags shared by more than one page', () => {
    const graph = buildKnowledgeGraph(
      [page(1, { tags: ['ops', 'solo'] }), page(2, { tags: ['ops', 'ops'] })],
      []
    );

    const tagNodes = graph.nodes.filter((node) => node.type === 'tag');
    expect(tagNodes).toEqual([expect.objectContaining({ id: 'tag-ops', name: '#ops' })]);
    expect(tagNodes[0].connections).toBe(2);
    expect(edgeKeys(graph)).toEqual(['page-1>tag-ops:tag', 'page-2>tag-ops:tag']);
    expect(graph.nodes.filter((node) => node.type === 'orphan')).toEqual([]);
  });

  it('accepts AI suggestions only between given pages, above the threshold, without duplicates', () => {
    const graph = buildKnowledgeGraph(
      [page(1), page(2), page(3)],
      [{ sourcePageId: 1, targetPageId: 2 }],
      {
        aiLinks: [
          { sourcePageId: 2, targetPageId: 1, relevance: 0.9, reason: 'already linked' },
          { sourcePageId: 1, targetPageId: 3, relevance: 0.8, reason: 'x'.repeat(1000) },
          { sourcePageId: 2, targetPageId: 3, relevance: 0.4 },
          { sourcePageId: 3, targetPageId: 404, relevance: 0.99 },
        ],
      }
    );

    expect(edgeKeys(graph)).toEqual(['page-1>page-2:link', 'page-1>page-3:ai-recommended']);
    const ai = graph.links.find((link) => link.type === 'ai-recommended')!;
    expect(ai.relevance).toBe(0.8);
    expect(ai.reason!.length).toBeLessThanOrEqual(300);
  });
});

describe('suggestAiLinks', () => {
  it('samples pages with enough content and survives provider failures', async () => {
    const long = 'x'.repeat(150);
    const findRelated = vi
      .fn()
      .mockRejectedValueOnce(new Error('provider down'))
      .mockResolvedValueOnce([
        { pageId: 1, relevance: 0.9, reason: 'related' },
        { pageId: 3, relevance: 0.7 },
        { pageId: 4, relevance: 0.6 },
        { pageId: 5, relevance: 0.6 },
      ]);

    const suggestions = await suggestAiLinks(
      [page(1, { content: long }), page(2, { content: long }), page(3, { content: 'short' })],
      findRelated,
      { random: () => 0 }
    );

    expect(findRelated).toHaveBeenCalledTimes(2);
    // Candidates exclude the page itself.
    expect(findRelated.mock.calls[1][2].map((p: { id: number }) => p.id)).toEqual([1, 3]);
    expect(suggestions.map((s) => `${s.sourcePageId}>${s.targetPageId}`)).toEqual([
      '2>1',
      '2>3',
      '2>4',
    ]);
  });
});

describe('shapeLocalGraph', () => {
  const centre = { id: 1, title: 'Centre', slug: 'centre', icon: '⭐' };

  it('puts the centre first, sorts neighbours and keeps only edges among the nodes', () => {
    const graph = shapeLocalGraph(
      centre,
      [
        { id: 3, title: 'Zeta', slug: 'zeta', icon: null },
        { id: 2, title: 'Alpha', slug: 'alpha', icon: '📄', content: 'body' } as any,
      ],
      [
        { sourcePageId: 1, targetPageId: 3 },
        { sourcePageId: 2, targetPageId: 1 },
        { sourcePageId: 2, targetPageId: 1 },
        { sourcePageId: 1, targetPageId: 1 },
        { sourcePageId: 1, targetPageId: 77 },
      ]
    );

    expect(graph.nodes.map((node) => node.id)).toEqual([1, 2, 3]);
    expect(graph.nodes[1]).toEqual({ id: 2, title: 'Alpha', slug: 'alpha', icon: '📄' });
    expect(graph.edges).toEqual([
      { source: 1, target: 3 },
      { source: 2, target: 1 },
    ]);
  });

  it('returns the centre alone when it has no readable neighbours', () => {
    expect(shapeLocalGraph(centre, [], [])).toEqual({ nodes: [centre], edges: [] });
  });
});

describe('parseLocalGraphDepth', () => {
  it.each([
    [undefined, 1],
    ['', 1],
    ['1', 1],
    ['2', 2],
    ['3', null],
    ['0', null],
    ['1.5', null],
    ['two', null],
    [['1', '2'], null],
  ])('%j → %j', (value, expected) => {
    expect(parseLocalGraphDepth(value)).toBe(expected);
  });
});

describe('unlinked mention helpers', () => {
  it('needs a title of at least two characters', () => {
    expect(isMentionableTitle('A')).toBe(false);
    expect(isMentionableTitle('  B ')).toBe(false);
    expect(isMentionableTitle('AB')).toBe(true);
    expect(isMentionableTitle('가나')).toBe(true);
  });

  it('centres a ~120-character snippet on the first case-insensitive literal match', () => {
    const before = 'lorem ipsum '.repeat(20);
    const after = ' dolor sit amet'.repeat(20);
    const snippet = buildMentionSnippet(
      `${before}the ROAD.map (v2) plan${after}`,
      'road.map (v2)',
      {
        offset: 500,
        contentLength: 5000,
      }
    );

    expect(snippet).toContain('ROAD.map (v2)');
    expect(snippet.startsWith('…')).toBe(true);
    expect(snippet.endsWith('…')).toBe(true);
    expect(snippet.length).toBeLessThanOrEqual(122);
    expect(snippet.length).toBeGreaterThan(100);
  });

  it('drops link tokens, collapses whitespace and marks no ellipsis for a whole short text', () => {
    expect(buildMentionSnippet('About\n\n[[page:4]]  Roadmap   notes', 'roadmap')).toBe(
      'About Roadmap notes'
    );
  });

  it('falls back to the excerpt start when the title is not found literally', () => {
    expect(buildMentionSnippet('no match here', 'Roadmap')).toBe('no match here');
  });
});
