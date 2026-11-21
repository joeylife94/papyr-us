/**
 * Layer 4: saves based on a revision against real Postgres (WP1).
 *
 * Invariants proven here with DBStorage, `page_versions` and the row lock taken by the guarded
 * write:
 *   - of several saves based on the same revision, started together, exactly one is written; the
 *     others are refused with a conflict and leave the winner's page as it is;
 *   - a save based on an older revision is refused before anything is written, and the refused
 *     text and the page as it was are kept as versions (once, however often it is retried);
 *   - the revision a read gives is the revision the guarded write compares, so a save based on
 *     what was just read succeeds and advances it;
 *   - a save without a base is unchanged.
 *
 * The tables live in their own schema so this file can run next to the other Layer 4 files.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { addOrganizations } from './organizations-fixture';

const PAGE_LINKS_MIGRATION = readFileSync(
  new URL('../../drizzle/0021_add_page_links.sql', import.meta.url),
  'utf8'
);

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.log('SKIP: DATABASE_URL not set — Layer 4 integration tests require Postgres');
  process.exit(0);
}

const SCHEMA = 'page_revision_l4';
const scopedUrl = (() => {
  const url = new URL(DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${SCHEMA}`);
  return url.toString();
})();

let admin: Pool;
let storage: any;
let pipeline: typeof import('../../server/services/page-save.js');
let store: import('../../server/services/page-save.js').PageSaveStore;
let revision: typeof import('../../server/services/page-revision.js');

async function createSchema() {
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.query(`CREATE SCHEMA ${SCHEMA}`);
  await admin.query(`
    CREATE TABLE ${SCHEMA}.wiki_pages (
      id           SERIAL PRIMARY KEY,
      title        TEXT NOT NULL,
      slug         TEXT NOT NULL UNIQUE,
      content      TEXT NOT NULL,
      blocks       JSONB DEFAULT '[]',
      folder       TEXT NOT NULL DEFAULT 'docs',
      tags         TEXT[] NOT NULL DEFAULT '{}',
      author       TEXT NOT NULL,
      parent_id    INTEGER,
      team_id      INTEGER,
      created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMP NOT NULL DEFAULT NOW(),
      is_published BOOLEAN NOT NULL DEFAULT TRUE,
      metadata     JSONB DEFAULT '{}',
      deleted_at   TIMESTAMP,
      icon         TEXT,
      position     INTEGER,
      search_vector tsvector
    )
  `);
  await admin.query(`
    CREATE TABLE ${SCHEMA}.page_versions (
      id                 SERIAL PRIMARY KEY,
      page_id            INTEGER NOT NULL REFERENCES ${SCHEMA}.wiki_pages(id) ON DELETE CASCADE,
      title              TEXT NOT NULL,
      content            TEXT NOT NULL,
      blocks             JSONB DEFAULT '[]',
      author             TEXT NOT NULL,
      version_number     INTEGER NOT NULL,
      change_description TEXT,
      created_at         TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  // Every content write maintains the link index, so the fixture has the table.
  const client = await admin.connect();
  try {
    await client.query(`SET search_path TO ${SCHEMA}`);
    await client.query(PAGE_LINKS_MIGRATION);
  } finally {
    client.release();
  }
  await admin.query(`
    CREATE OR REPLACE FUNCTION ${SCHEMA}.wiki_pages_search_vector_update() RETURNS trigger AS $$
    BEGIN
      NEW.search_vector :=
        setweight(to_tsvector('simple', coalesce(NEW.title, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(NEW.content, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(array_to_string(NEW.tags, ' '), '')), 'C');
      RETURN NEW;
    END
    $$ LANGUAGE plpgsql
  `);
  await admin.query(`
    CREATE TRIGGER trg_wiki_pages_search_vector
    BEFORE INSERT OR UPDATE OF title, content, tags ON ${SCHEMA}.wiki_pages
    FOR EACH ROW EXECUTE FUNCTION ${SCHEMA}.wiki_pages_search_vector_update()
  `);
}

async function createPage(slug: string, content: string): Promise<number> {
  const { rows } = await admin.query(
    `INSERT INTO ${SCHEMA}.wiki_pages (title, slug, content, blocks, author, tags)
     VALUES ($1, $2, $3, $4, 'author', '{ops}') RETURNING id`,
    [`Page ${slug}`, slug, content, JSON.stringify([{ id: 'b1', type: 'paragraph', content }])]
  );
  return rows[0].id;
}

async function versions(pageId: number) {
  const { rows } = await admin.query(
    `SELECT version_number, content, change_description
       FROM ${SCHEMA}.page_versions WHERE page_id = $1 ORDER BY version_number`,
    [pageId]
  );
  return rows as Array<{ version_number: number; content: string; change_description: string }>;
}

const blocks = (content: string) => [{ id: 'b1', type: 'paragraph', content }];

beforeAll(async () => {
  admin = new Pool({ connectionString: DATABASE_URL });
  await createSchema();
  process.env.DATABASE_URL = scopedUrl;
  await addOrganizations(admin, SCHEMA);
  const { DBStorage } = await import('../../server/storage.js');
  storage = new DBStorage();
  pipeline = await import('../../server/services/page-save.js');
  revision = await import('../../server/services/page-revision.js');
  store = pipeline.storagePageSaveStore(storage);
});

afterEach(() => {
  pipeline.resetEditSessions();
});

afterAll(async () => {
  await storage?.pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.end();
});

describe('saves based on a revision (real Postgres)', () => {
  it('lets exactly one of several saves based on the same revision through', async () => {
    for (let round = 0; round < 8; round += 1) {
      const id = await createPage(`race-${round}`, 'original');
      const base = revision.pageRevision(await storage.getWikiPage(id));
      const writers = ['a', 'b', 'c', 'd', 'e'].map((name) => `${name} wrote this`);

      const outcomes = await Promise.allSettled(
        writers.map((text) =>
          pipeline.savePage(store, id, { blocks: blocks(text) }, 'autosave', { baseRevision: base })
        )
      );

      const winners = outcomes.filter((o) => o.status === 'fulfilled');
      const refused = outcomes.filter((o) => o.status === 'rejected');
      expect(winners).toHaveLength(1);
      expect(refused).toHaveLength(writers.length - 1);
      for (const outcome of refused) {
        expect((outcome as PromiseRejectedResult).reason).toBeInstanceOf(
          revision.PageRevisionConflictError
        );
      }
      const stored = await storage.getWikiPage(id);
      const winner = (winners[0] as PromiseFulfilledResult<any>).value;
      expect(stored.content).toBe(winner.after.content);
      expect(writers).toContain(stored.content);
      pipeline.resetEditSessions();
    }
  });

  it('refuses a stale base without writing, and keeps the refused text and the latest page as versions', async () => {
    const id = await createPage('stale', 'original');
    const stale = revision.pageRevision(await storage.getWikiPage(id));
    await pipeline.savePage(store, id, { blocks: blocks('theirs') }, 'autosave', {
      baseRevision: stale,
    });
    const afterTheirs = await storage.getWikiPage(id);
    const versionsBefore = await versions(id);

    await expect(
      pipeline.savePage(store, id, { blocks: blocks('mine') }, 'autosave', { baseRevision: stale })
    ).rejects.toBeInstanceOf(revision.PageRevisionConflictError);

    expect(await storage.getWikiPage(id)).toEqual(afterTheirs);
    const added = (await versions(id)).slice(versionsBefore.length);
    expect(added.map((v) => [v.content, v.change_description])).toEqual([
      ['theirs', 'Latest when a save was refused'],
      ['mine', 'Not saved: based on an older revision'],
    ]);

    // The same refusal again records nothing new.
    await expect(
      pipeline.savePage(store, id, { blocks: blocks('mine') }, 'autosave', { baseRevision: stale })
    ).rejects.toBeInstanceOf(revision.PageRevisionConflictError);
    expect(await versions(id)).toHaveLength(versionsBefore.length + 2);
  });

  it('accepts the revision a read gave and advances it; a save that changes nothing does not', async () => {
    const id = await createPage('equal', 'original');
    const read = await storage.getWikiPage(id);
    const base = revision.pageRevision(read);

    const saved = await pipeline.savePage(store, id, { blocks: blocks('next') }, 'autosave', {
      baseRevision: base,
    });
    const next = revision.pageRevision(saved!.after);
    expect(next).not.toBe(base);
    // What the next read answers with is what the write answered with.
    expect(revision.pageRevision(await storage.getWikiPage(id))).toBe(next);

    const echo = await pipeline.savePage(store, id, { blocks: blocks('next') }, 'autosave', {
      baseRevision: next,
    });
    expect(revision.pageRevision(echo!.after)).toBe(next);
    expect(revision.pageRevision(await storage.getWikiPage(id))).toBe(next);
  });

  it('keeps a save without a base as it was', async () => {
    const id = await createPage('no-base', 'original');
    await pipeline.savePage(store, id, { blocks: blocks('one') }, 'autosave');
    await pipeline.savePage(store, id, { blocks: blocks('two') }, 'autosave');
    expect((await storage.getWikiPage(id)).content).toBe('two');
  });
});

async function waitForLockWaiter() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const { rows } = await admin.query(
      `SELECT 1 FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND datname = current_database()`
    );
    if (rows.length > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('no statement is waiting for a row lock');
}

describe('restoring a version (real Postgres)', () => {
  async function pageWithVersion(slug: string) {
    const id = await createPage(slug, 'current');
    const { rows } = await admin.query(
      `INSERT INTO ${SCHEMA}.page_versions (page_id, title, content, blocks, author, version_number, change_description)
       VALUES ($1, $2, 'old text', $3, 'author', 1, 'Version 1') RETURNING id`,
      [id, `Page ${slug}`, JSON.stringify(blocks('old text'))]
    );
    return { id, versionId: rows[0].id as number };
  }

  it('restores the version and keeps the page as it was as the "Before restore" version', async () => {
    const { id, versionId } = await pageWithVersion('restore-plain');
    const result = await storage.restorePageVersion(id, versionId);
    expect(result.page.content).toBe('old text');
    const kept = await versions(id);
    expect(kept[kept.length - 1]).toMatchObject({
      content: 'current',
      change_description: 'Before restore',
    });
    expect((await storage.getWikiPage(id)).content).toBe('old text');
  });

  it('a save that lands while the restore waits is what "Before restore" keeps, not lost', async () => {
    const { id, versionId } = await pageWithVersion('restore-race');
    const holder = await admin.connect();
    try {
      await holder.query('BEGIN');
      await holder.query(
        `UPDATE ${SCHEMA}.wiki_pages SET content = 'landed', blocks = $2 WHERE id = $1`,
        [id, JSON.stringify(blocks('landed'))]
      );
      const restoring = storage.restorePageVersion(id, versionId);
      await waitForLockWaiter();
      await holder.query('COMMIT');
      const result = await restoring;

      expect(result.page.content).toBe('old text');
      const kept = await versions(id);
      expect(kept[kept.length - 1]).toMatchObject({
        content: 'landed',
        change_description: 'Before restore',
      });
    } finally {
      holder.release();
    }
  });

  it('reports a version or page that is not there without writing anything', async () => {
    const { id } = await pageWithVersion('restore-missing');
    expect(await storage.restorePageVersion(id, 999999)).toEqual({ missing: 'version' });
    expect(await storage.restorePageVersion(999999, 1)).toEqual({ missing: 'page' });
    expect((await storage.getWikiPage(id)).content).toBe('current');
    expect(await versions(id)).toHaveLength(1);
  });
});

describe('merging tags (real Postgres)', () => {
  it('concurrent merges each keep their tag', async () => {
    const id = await createPage('tags-race', 'x');
    const names = Array.from({ length: 12 }, (_, index) => `tag-${index}`);
    await Promise.all(names.map((name) => storage.mergePageTags(id, { add: [name] })));
    const tags: string[] = (await storage.getWikiPage(id)).tags;
    expect(new Set(tags)).toEqual(new Set(['ops', ...names]));
    expect(tags).toHaveLength(names.length + 1);
  });

  it('adds in order without duplicates, and removal wins over addition', async () => {
    const id = await createPage('tags-order', 'x');
    expect((await storage.mergePageTags(id, { add: ['b', 'a', 'b', 'ops'] })).tags).toEqual([
      'ops',
      'b',
      'a',
    ]);
    expect(
      (await storage.mergePageTags(id, { add: ['c', 'gone'], remove: ['ops', 'gone'] })).tags
    ).toEqual(['b', 'a', 'c']);
  });

  it('does not touch the title, body or versions, and answers undefined for a missing page', async () => {
    const id = await createPage('tags-only', 'body');
    const before = await versions(id);
    await storage.mergePageTags(id, { add: ['new'] });
    const page = await storage.getWikiPage(id);
    expect(page.content).toBe('body');
    expect(await versions(id)).toEqual(before);
    expect(await storage.mergePageTags(999999, { add: ['x'] })).toBeUndefined();
  });
});

describe('a trashed page (real Postgres)', () => {
  async function trashedPage(slug: string) {
    const id = await createPage(slug, 'original');
    const base = revision.pageRevision(await storage.getWikiPage(id));
    await admin.query(`UPDATE ${SCHEMA}.wiki_pages SET deleted_at = NOW() WHERE id = $1`, [id]);
    return { id, base };
  }

  it.each([
    ['a stale base', 'stale-base'],
    ['the current base', null],
  ])(
    'is not found for a save with %s: nothing is written, answered or recorded',
    async (_n, given) => {
      const { id, base } = await trashedPage(`trashed-${given ?? 'current'}`);
      const result = await pipeline.savePage(store, id, { blocks: blocks('mine') }, 'autosave', {
        baseRevision: given ?? base,
      });
      expect(result).toBeUndefined();
      const { rows } = await admin.query(`SELECT content FROM ${SCHEMA}.wiki_pages WHERE id = $1`, [
        id,
      ]);
      expect(rows[0].content).toBe('original');
      expect(await versions(id)).toEqual([]);
    }
  );

  it('is written by a save without a base as it always was', async () => {
    const { id } = await trashedPage('trashed-no-base');
    await pipeline.savePage(store, id, { blocks: blocks('written') }, 'autosave');
    const { rows } = await admin.query(`SELECT content FROM ${SCHEMA}.wiki_pages WHERE id = $1`, [
      id,
    ]);
    expect(rows[0].content).toBe('written');
  });
});

describe('tag changes equal what reading and writing the tags back did (real Postgres)', () => {
  /** What the bulk route and the workflow action computed before the merge was one statement. */
  const tagsBefore = (existing: string[], add?: string[], remove?: string[]) => {
    let tags = [...existing];
    if (Array.isArray(add)) tags = Array.from(new Set([...tags, ...add]));
    if (Array.isArray(remove)) tags = tags.filter((tag) => !remove.includes(tag));
    return tags;
  };
  const withTags = async (slug: string, tags: string[]) => {
    const id = await createPage(slug, 'x');
    await admin.query(`UPDATE ${SCHEMA}.wiki_pages SET tags = $2 WHERE id = $1`, [id, tags]);
    return id;
  };

  it.each([
    [
      'an existing duplicate is left as it is when only removing',
      ['a', 'a', 'b'],
      undefined,
      ['b'],
    ],
    [
      'an existing duplicate is collapsed when adding (a Set was built)',
      ['a', 'a'],
      ['x'],
      undefined,
    ],
    ['adding nothing still collapses, as before', ['a', 'a', 'b'], [], undefined],
    ['add then remove', ['a', 'b'], ['c', 'a'], ['b']],
    ['removal wins over addition', ['a'], ['gone'], ['gone']],
    ['empty tags', [], ['z', 'z'], ['q']],
    ['neither', ['a', 'a'], undefined, undefined],
  ] as Array<[string, string[], string[] | undefined, string[] | undefined]>)(
    '%s',
    async (name, existing, add, remove) => {
      const id = await withTags(`merge-${name.replace(/\W+/g, '-')}`, existing);
      const merged = await storage.mergePageTags(id, { add, remove });
      expect(merged.tags).toEqual(tagsBefore(existing, add, remove));
      expect((await storage.getWikiPage(id)).tags).toEqual(tagsBefore(existing, add, remove));
    }
  );

  it('a remove-only bulk request keeps existing duplicates; one that adds (even nothing) collapses them', async () => {
    const { bulkTagChange } = await import('../../server/services/bulk-tags.js');
    for (const [add, remove] of [
      [undefined, ['b']],
      [[], ['b']],
      [['x'], undefined],
      [undefined, undefined],
    ] as Array<[string[] | undefined, string[] | undefined]>) {
      const existing = ['a', 'a', 'b'];
      const id = await withTags(
        `bulk-${JSON.stringify([add, remove])}`.replace(/\W+/g, '-'),
        existing
      );
      const merged = await storage.mergePageTags(id, bulkTagChange(add, remove));
      expect(merged.tags).toEqual(tagsBefore(existing, add, remove));
    }
  });

  it('leaves a trashed page untouched and does not answer it (the bulk route skips and does not count it)', async () => {
    const id = await withTags('merge-trashed', ['a']);
    await admin.query(`UPDATE ${SCHEMA}.wiki_pages SET deleted_at = NOW() WHERE id = $1`, [id]);
    expect(await storage.mergePageTags(id, { add: ['b'] })).toBeUndefined();
    const { rows } = await admin.query(`SELECT tags FROM ${SCHEMA}.wiki_pages WHERE id = $1`, [id]);
    expect(rows[0].tags).toEqual(['a']);
  });

  describe('the workflow add_tag action', () => {
    const TEAM = 5;
    const OTHER_TEAM = 9;
    let workflow: typeof import('../../server/services/workflow.js');
    const runs: any[] = [];
    const run = async (pageId: number, tags: unknown) => {
      runs.length = 0;
      await workflow.executeWorkflow(
        {
          id: 1,
          name: 'tag',
          teamId: TEAM,
          conditions: [],
          actions: [{ type: 'add_tag', config: { tags } }],
        } as any,
        { id: pageId }
      );
      return runs[runs.length - 1] as { status: string; results?: any[]; error?: string };
    };
    const pageOfTeam = async (slug: string, tags: string[], teamId: number | null = TEAM) => {
      const id = await withTags(slug, tags);
      await admin.query(`UPDATE ${SCHEMA}.wiki_pages SET team_id = $2 WHERE id = $1`, [id, teamId]);
      return id;
    };
    const tagsOf = async (id: number) =>
      (await admin.query(`SELECT tags FROM ${SCHEMA}.wiki_pages WHERE id = $1`, [id])).rows[0].tags;

    beforeAll(async () => {
      workflow = await import('../../server/services/workflow.js');
      // Pages are read and tags merged through the real storage; runs are only recorded.
      workflow.initWorkflowService({
        createWorkflowRun: async () => 1,
        updateWorkflowRun: async (_id: number, update: any) => runs.push(update),
        getWorkflowRun: async () => ({}),
        getWikiPage: (...args: any[]) => storage.getWikiPage(...args),
        mergePageTags: (...args: any[]) => storage.mergePageTags(...args),
      } as any);
    });

    it('adds the tags to a page of its team, collapsing duplicates as the Set it replaces did', async () => {
      const id = await pageOfTeam('wf-add', ['a', 'a', 'b']);
      const outcome = await run(id, ['c', 'a']);
      expect(outcome.status).toBe('success');
      expect(outcome.results?.[0].result.tags).toEqual(tagsBefore(['a', 'a', 'b'], ['c', 'a']));
      expect(await tagsOf(id)).toEqual(['a', 'b', 'c']);
    });

    it('does not find a trashed page, and leaves it untouched', async () => {
      const id = await pageOfTeam('wf-trashed', ['a']);
      await admin.query(`UPDATE ${SCHEMA}.wiki_pages SET deleted_at = NOW() WHERE id = $1`, [id]);
      const outcome = await run(id, ['b']);
      expect(outcome.status).toBe('failed');
      expect(outcome.error).toBe('Page not found');
      expect(await tagsOf(id)).toEqual(['a']);
    });

    it.each([
      ['another team', OTHER_TEAM],
      ['no team', null],
    ])('does not find a page of %s, and leaves it untouched', async (_name, teamId) => {
      const id = await pageOfTeam(`wf-team-${teamId}`, ['a'], teamId);
      const outcome = await run(id, ['b']);
      expect(outcome.status).toBe('failed');
      expect(outcome.error).toBe('Page not found');
      expect(await tagsOf(id)).toEqual(['a']);
    });

    it('keeps a tag someone saved while the workflow ran', async () => {
      const id = await pageOfTeam('wf-concurrent', ['a']);
      const holder = await admin.connect();
      try {
        // Someone's save is in flight (holding the row) when the workflow has read the page.
        await holder.query('BEGIN');
        await holder.query(`UPDATE ${SCHEMA}.wiki_pages SET tags = $2 WHERE id = $1`, [
          id,
          ['a', 'saved-meanwhile'],
        ]);
        const running = run(id, ['from-workflow']);
        await waitForLockWaiter();
        await holder.query('COMMIT');
        const outcome = await running;
        expect(outcome.status).toBe('success');
        expect(await tagsOf(id)).toEqual(['a', 'saved-meanwhile', 'from-workflow']);
        expect(outcome.results?.[0].result.tags).toEqual(['a', 'saved-meanwhile', 'from-workflow']);
      } finally {
        holder.release();
      }
    });
  });
});
