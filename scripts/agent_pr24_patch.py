from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected 1 match, found {count}')
    return text.replace(old, new, 1)


routes_path = Path('server/routes.ts')
routes = routes_path.read_text()
routes = replace_once(
    routes,
    '  wikiPages,\n  tasks,',
    '  wikiPages,\n  pageVersions,\n  tasks,',
    'static pageVersions import',
)
routes = routes.replace("        const { pageVersions } = await import('@shared/schema');\n", '')
routes = routes.replace("              const { pageVersions } = await import('@shared/schema');\n", '')
if "import('@shared/schema')" in routes:
    raise RuntimeError('production schema alias import remains')

list_pattern = re.compile(
    r"(app\.get\(\s*'/api/pages/:id/versions'.*?const pageId = parseInt\(req\.params\.id\);)(\s*const db = \(storage as any\)\.db;)",
    re.S,
)
routes, count = list_pattern.subn(
    r"\1\n        if (!Number.isInteger(pageId) || pageId <= 0) {\n          return res.status(400).json({ error: 'Invalid page ID' });\n        }\2",
    routes,
    count=1,
)
if count != 1:
    raise RuntimeError(f'version list validation: expected 1 match, found {count}')

preview_old = """        const versionId = parseInt(req.params.versionId);
        const db = (storage as any).db;
        if (!db) return res.status(500).json({ error: 'Database not available' });

        const { eq } = await import('drizzle-orm');

        const [version] = await db
          .select()
          .from(pageVersions)
          .where(eq(pageVersions.id, versionId));"""
preview_new = """        const pageId = parseInt(req.params.id);
        const versionId = parseInt(req.params.versionId);
        if (!Number.isInteger(pageId) || pageId <= 0 || !Number.isInteger(versionId) || versionId <= 0) {
          return res.status(400).json({ error: 'Invalid page or version ID' });
        }
        const db = (storage as any).db;
        if (!db) return res.status(500).json({ error: 'Database not available' });

        const { eq } = await import('drizzle-orm');

        const [version] = await db
          .select()
          .from(pageVersions)
          .where(and(eq(pageVersions.id, versionId), eq(pageVersions.pageId, pageId)));"""
routes = replace_once(routes, preview_old, preview_new, 'page-scoped version preview')

restore_old = """        const pageId = parseInt(req.params.id);
        const versionId = parseInt(req.params.versionId);
        const db = (storage as any).db;
        if (!db) return res.status(500).json({ error: 'Database not available' });

        const { eq } = await import('drizzle-orm');

        const [version] = await db
          .select()
          .from(pageVersions)
          .where(eq(pageVersions.id, versionId));"""
restore_new = """        const pageId = parseInt(req.params.id);
        const versionId = parseInt(req.params.versionId);
        if (!Number.isInteger(pageId) || pageId <= 0 || !Number.isInteger(versionId) || versionId <= 0) {
          return res.status(400).json({ error: 'Invalid page or version ID' });
        }
        const db = (storage as any).db;
        if (!db) return res.status(500).json({ error: 'Database not available' });

        const { eq } = await import('drizzle-orm');

        const [version] = await db
          .select()
          .from(pageVersions)
          .where(and(eq(pageVersions.id, versionId), eq(pageVersions.pageId, pageId)));"""
routes = replace_once(routes, restore_old, restore_new, 'page-scoped version restore')
routes_path.write_text(routes)

storage_path = Path('server/storage.ts')
storage = storage_path.read_text()
helper_anchor = """function isBcryptHash(value: string): boolean {
  // bcrypt hashes typically start with $2a$, $2b$, or $2y$ and are ~60 chars
  return typeof value === 'string' && /^\\$2[aby]?\\$\\d{2}\\$[./A-Za-z0-9]{53}$/.test(value);
}
"""
helper_replacement = helper_anchor + """
const MAX_SLUG_INSERT_ATTEMPTS = 100;

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
storage = replace_once(storage, helper_anchor, helper_replacement, 'slug helpers')

create_start = storage.index('  async createWikiPage(page: InsertWikiPage, creatorUserId?: number): Promise<WikiPage> {')
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

    if (!createdPage) throw new Error('Failed to allocate a unique page slug');

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
            if (inserted.length === 1) throw { code: '23505', constraint: 'wiki_pages_slug_unique' };
            return [{ id: 7, ...value }];
          }),
        })),
      })),
    };

    const created = await storage.createWikiPage(pageInput as any);
    expect(inserted.map((value) => value.slug)).toEqual(['duplicate-title', 'duplicate-title-2']);
    expect(created.slug).toBe('duplicate-title-2');
  });

  it('uses production-resolvable and page-scoped version queries', () => {
    const source = readFileSync('server/routes.ts', 'utf8');
    expect(source).not.toContain("import('@shared/schema')");
    expect(source.match(/where\\(and\\(eq\\(pageVersions\\.id, versionId\\), eq\\(pageVersions\\.pageId, pageId\\)\\)\\)/g)).toHaveLength(2);
  });
});
""")
