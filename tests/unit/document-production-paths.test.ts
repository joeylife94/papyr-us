import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { buildUniqueSlugCandidate, DBStorage } from '../../server/storage';

const pageInput = {
  title: 'Duplicate title',
  slug: 'duplicate-title',
  content: '',
  folder: 'docs',
  tags: [],
  author: 'test',
  isPublished: true,
};

describe('document production paths', () => {
  it('generates stable slug retry candidates', () => {
    expect(buildUniqueSlugCandidate('page', 0)).toBe('page');
    expect(buildUniqueSlugCandidate('page', 1)).toBe('page-2');
    expect(buildUniqueSlugCandidate('  ', 2)).toBe('untitled-3');
  });

  it('retries a page insert after a slug unique violation', async () => {
    const inserted: Array<Record<string, unknown>> = [];
    const storage = Object.create(DBStorage.prototype) as DBStorage;
    (storage as any).db = {
      insert: vi.fn(() => ({
        values: vi.fn((value: Record<string, unknown>) => ({
          returning: vi.fn(async () => {
            inserted.push(value);
            if (inserted.length === 1) {
              throw { code: '23505', constraint: 'wiki_pages_slug_unique' };
            }
            return [{ id: 7, ...value }];
          }),
        })),
      })),
    };

    const created = await storage.createWikiPage(pageInput as any);
    expect(inserted.map((value) => value.slug)).toEqual([
      'duplicate-title',
      'duplicate-title-2',
    ]);
    expect(created.slug).toBe('duplicate-title-2');
  });

  it('uses production-resolvable and page-scoped version queries', () => {
    const source = readFileSync('server/routes.ts', 'utf8');
    expect(source).not.toContain("import('@shared/schema')");
    expect(
      source.match(
        /where\(and\(eq\(pageVersions\.id, versionId\), eq\(pageVersions\.pageId, pageId\)\)\)/g
      )
    ).toHaveLength(2);
  });
});
