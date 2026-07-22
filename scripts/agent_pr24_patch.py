from pathlib import Path


def replace_between(text: str, start_marker: str, end_marker: str, replacement: str) -> str:
    start = text.index(start_marker)
    end = text.index(end_marker, start)
    return text[:start] + replacement + text[end:]


routes_path = Path('server/routes.ts')
routes = routes_path.read_text()

if '  pageVersions,\n' not in routes:
    routes = routes.replace(
        '  wikiPages,\n  tasks,',
        '  wikiPages,\n  pageVersions,\n  tasks,',
        1,
    )

version_routes = """  // Page Version History API
  app.get(
    '/api/pages/:id/versions',
    optionalAuth,
    requirePagePermission('viewer'),
    async (req, res) => {
      try {
        const pageId = parseInt(req.params.id);
        if (!Number.isInteger(pageId) || pageId <= 0) {
          return res.status(400).json({ error: 'Invalid page ID' });
        }

        const db = (storage as any).db;
        if (!db) return res.status(500).json({ error: 'Database not available' });

        const { desc } = await import('drizzle-orm');
        const versions = await db
          .select({
            id: pageVersions.id,
            pageId: pageVersions.pageId,
            title: pageVersions.title,
            author: pageVersions.author,
            versionNumber: pageVersions.versionNumber,
            changeDescription: pageVersions.changeDescription,
            createdAt: pageVersions.createdAt,
          })
          .from(pageVersions)
          .where(eq(pageVersions.pageId, pageId))
          .orderBy(desc(pageVersions.versionNumber));

        res.json(versions);
      } catch (error) {
        console.error('Error fetching page versions:', error);
        res.status(500).json({ error: 'Failed to fetch page versions' });
      }
    }
  );

  app.get(
    '/api/pages/:id/versions/:versionId',
    optionalAuth,
    requirePagePermission('viewer'),
    async (req, res) => {
      try {
        const pageId = parseInt(req.params.id);
        const versionId = parseInt(req.params.versionId);
        if (
          !Number.isInteger(pageId) ||
          pageId <= 0 ||
          !Number.isInteger(versionId) ||
          versionId <= 0
        ) {
          return res.status(400).json({ error: 'Invalid page or version ID' });
        }

        const db = (storage as any).db;
        if (!db) return res.status(500).json({ error: 'Database not available' });

        const [version] = await db
          .select()
          .from(pageVersions)
          .where(and(eq(pageVersions.id, versionId), eq(pageVersions.pageId, pageId)));

        if (!version) {
          return res.status(404).json({ error: 'Version not found' });
        }

        res.json(version);
      } catch (error) {
        console.error('Error fetching page version:', error);
        res.status(500).json({ error: 'Failed to fetch page version' });
      }
    }
  );

  // Restore a specific version
  app.post(
    '/api/pages/:id/versions/:versionId/restore',
    requireAuthIfEnabled,
    requirePagePermission('editor'),
    async (req: AuthRequest, res) => {
      try {
        const pageId = parseInt(req.params.id);
        const versionId = parseInt(req.params.versionId);
        if (
          !Number.isInteger(pageId) ||
          pageId <= 0 ||
          !Number.isInteger(versionId) ||
          versionId <= 0
        ) {
          return res.status(400).json({ error: 'Invalid page or version ID' });
        }

        const db = (storage as any).db;
        if (!db) return res.status(500).json({ error: 'Database not available' });

        const [version] = await db
          .select()
          .from(pageVersions)
          .where(and(eq(pageVersions.id, versionId), eq(pageVersions.pageId, pageId)));

        if (!version) {
          return res.status(404).json({ error: 'Version not found' });
        }

        const restoredPage = await storage.updateWikiPage(pageId, {
          title: version.title,
          content: version.content,
          blocks: version.blocks as any,
        });

        if (!restoredPage) {
          return res.status(404).json({ error: 'Page not found' });
        }

        res.json(restoredPage);
      } catch (error) {
        console.error('Error restoring page version:', error);
        res.status(500).json({ error: 'Failed to restore page version' });
      }
    }
  );

"""

routes = replace_between(
    routes,
    '  // Page Version History API\n',
    "  app.delete(\n    '/api/pages/:id',",
    version_routes,
)

if "import('@shared/schema')" in routes:
    raise RuntimeError('production schema alias import remains')

routes_path.write_text(routes)

storage_path = Path('server/storage.ts')
storage = storage_path.read_text()

if 'export function buildUniqueSlugCandidate' not in storage:
    helper_marker = '// Simplified and unified DBStorage\n'
    helper_index = storage.index(helper_marker)
    helpers = """const MAX_SLUG_INSERT_ATTEMPTS = 100;

function isSlugUniqueViolation(error: unknown): boolean {
  const dbError = error as { code?: string; constraint?: string } | null;
  if (dbError?.code !== '23505') return false;
  return !dbError.constraint || dbError.constraint.toLowerCase().includes('slug');
}

export function buildUniqueSlugCandidate(baseSlug: string, attempt: number): string {
  const normalizedBase = baseSlug.trim() || 'untitled';
  return attempt === 0 ? normalizedBase : `${normalizedBase}-${attempt + 1}`;
}

"""
    storage = storage[:helper_index] + helpers + storage[helper_index:]

create_start = storage.index(
    '  async createWikiPage(page: InsertWikiPage, creatorUserId?: number): Promise<WikiPage> {'
)
create_end = storage.index('\n  async updateWikiPage(', create_start)
create_method = """  async createWikiPage(page: InsertWikiPage, creatorUserId?: number): Promise<WikiPage> {
    let createdPage: WikiPage | undefined;

    for (let attempt = 0; attempt < MAX_SLUG_INSERT_ATTEMPTS; attempt += 1) {
      const slug = buildUniqueSlugCandidate(page.slug, attempt);
      try {
        const result = await this.db.insert(wikiPages).values({ ...page, slug }).returning();
        createdPage = result[0];
        break;
      } catch (error) {
        if (!isSlugUniqueViolation(error) || attempt === MAX_SLUG_INSERT_ATTEMPTS - 1) {
          throw error;
        }
      }
    }

    if (!createdPage) {
      throw new Error('Failed to allocate a unique page slug');
    }

    if (creatorUserId) {
      try {
        await this.setPageOwner(createdPage.id, creatorUserId, creatorUserId);
      } catch (error) {
        console.error('Failed to set page owner permission:', error);
      }
    }

    return createdPage;
  }
"""
storage = storage[:create_start] + create_method + storage[create_end:]
storage_path.write_text(storage)

Path('tests/unit/document-production-paths.test.ts').write_text("""import { readFileSync } from 'node:fs';
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
        /where\\(and\\(eq\\(pageVersions\\.id, versionId\\), eq\\(pageVersions\\.pageId, pageId\\)\\)\\)/g
      )
    ).toHaveLength(2);
  });
});
""")
