import { describe, expect, it } from 'vitest';
import {
  buildTagTree,
  filterTagTree,
  flattenTagTree,
  matchesTagFilter,
  tagFromPanePath,
  tagPanePath,
  tagScopePath,
  type TagTreeNode,
} from '../../client/src/lib/tag-pane';
import { resolveWorkspaceScope } from '../../client/src/lib/active-workspace';
import { countTags } from '../../shared/tags';

// The tag pane (#137) in the browser: its URLs (shareable, the tag URL-encoded, scoped to the
// workspace) and the tree it builds from the server's flat, counted list.

const names = (nodes: TagTreeNode[]): unknown[] =>
  nodes.map((node) => (node.children.length ? [node.label, names(node.children)] : node.label));

describe('tag pane URLs', () => {
  it('scopes the pane to the workspace: personal, or the team of the route', () => {
    const teams = [{ id: 3, name: 'alpha team' }];
    expect(tagScopePath(resolveWorkspaceScope('/tags', teams))).toBe('');
    expect(tagScopePath(resolveWorkspaceScope('/dashboard', teams))).toBe('');
    expect(tagScopePath(resolveWorkspaceScope('/teams/alpha%20team/tags', teams))).toBe(
      '/teams/alpha%20team'
    );
    expect(tagScopePath(resolveWorkspaceScope('/page/x', teams, { teamId: 3 }))).toBe(
      '/teams/alpha%20team'
    );
  });

  it('builds pane paths with the tag encoded as one segment', () => {
    expect(tagPanePath('')).toBe('/tags');
    expect(tagPanePath('/teams/alpha')).toBe('/teams/alpha/tags');
    expect(tagPanePath('', 'project/alpha')).toBe('/tags/project%2Falpha');
    expect(tagPanePath('/teams/alpha', '회의')).toBe('/teams/alpha/tags/%ED%9A%8C%EC%9D%98');
    expect(tagPanePath('', '"><script>')).toBe('/tags/%22%3E%3Cscript%3E');
  });

  it('reads the selected tag back, encoded or with plain slashes, normalized', () => {
    expect(tagFromPanePath('/tags')).toBeNull();
    expect(tagFromPanePath('/tags/')).toBeNull();
    expect(tagFromPanePath('/tags/project%2Falpha')).toBe('project/alpha');
    expect(tagFromPanePath('/tags/project/alpha')).toBe('project/alpha');
    expect(tagFromPanePath('/teams/alpha/tags/%ED%9A%8C%EC%9D%98')).toBe('회의');
    expect(tagFromPanePath('/tags/%23todo%2F')).toBe('todo');
    expect(tagFromPanePath('/tags/a%25b')).toBe('a%b');
    expect(tagFromPanePath('/tags/%E0%A4%A')).toBeNull();
    expect(tagFromPanePath('/tags/%2F%2F')).toBeNull();
    expect(tagFromPanePath('/page/tags/x')).toBeNull();
    for (const tag of ['project/alpha', '회의', 'a b', 'x?y#z&w', '"><img>']) {
      expect(tagFromPanePath(tagPanePath('/teams/t', tag))).toBe(tag);
    }
  });
});

describe('tag tree', () => {
  const { tags } = countTags(
    [['project/beta'], ['project/alpha'], ['project/alpha', 'idea'], ['Zeta'], ['zeta/2'], ['ä']],
    100
  );

  it('nests the flat list by `/`, siblings by name (Korean collation, numeric)', () => {
    expect(names(buildTagTree(tags, 'name'))).toEqual([
      'ä',
      'idea',
      ['project', ['alpha', 'beta']],
      'Zeta',
      ['zeta', ['2']],
    ]);
  });

  it('sorts siblings by count, then name', () => {
    expect(names(buildTagTree(tags, 'count'))).toEqual([
      ['project', ['alpha', 'beta']],
      'ä',
      'idea',
      'Zeta',
      ['zeta', ['2']],
    ]);
    const project = buildTagTree(tags, 'count')[0];
    expect(project).toMatchObject({ name: 'project', count: 3, direct: 0 });
    expect(project.children[0]).toMatchObject({ name: 'project/alpha', count: 2, direct: 2 });
  });

  it('shows an orphan at the top level instead of dropping it', () => {
    const tree = buildTagTree([{ name: 'a/b', count: 1, direct: 1 }], 'name');
    expect(tree.map((node) => node.name)).toEqual(['a/b']);
  });

  it('filters by path, case-insensitive, keeping the parents of a match', () => {
    const tree = buildTagTree(tags, 'name');
    expect(names(filterTagTree(tree, 'ALPHA'))).toEqual([['project', ['alpha']]]);
    expect(names(filterTagTree(tree, '#proj'))).toEqual([['project', ['alpha', 'beta']]]);
    expect(names(filterTagTree(tree, 'nothing'))).toEqual([]);
    expect(filterTagTree(tree, '  ')).toHaveLength(tree.length);
    // Display order, depth first: Enter in the filter box opens the first tag that matches
    // itself (here `project/alpha` for "alp", not its parent).
    const narrowed = flattenTagTree(filterTagTree(tree, 'alp'));
    expect(narrowed.map((node) => node.name)).toEqual(['project', 'project/alpha']);
    expect(narrowed.find((node) => matchesTagFilter(node.name, 'alp'))?.name).toBe('project/alpha');
    expect(flattenTagTree(filterTagTree(tree, 'a')).map((node) => node.name)).toEqual([
      'idea',
      'project',
      'project/alpha',
      'project/beta',
      'Zeta',
      'zeta',
      'zeta/2',
    ]);
  });
});
