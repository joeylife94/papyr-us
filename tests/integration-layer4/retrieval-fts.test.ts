/**
 * Layer 4 Integration · Team-scoped FTS retrieval against real Postgres.
 *
 * Invariant: the SQL that DBStorage.retrieveTeamScopedPages generates actually
 * runs, uses the full-text index, and enforces team scope, soft-delete exclusion
 * and the top-k bound in the database rather than in JavaScript.
 *
 * This file requires DATABASE_URL to point to a running Postgres instance.
 * It is invoked by scripts/run-layer4.mjs which manages the Docker Compose lifecycle.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { DBStorage } from '../../server/storage.js';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.log('SKIP: DATABASE_URL not set — Layer 4 integration tests require Postgres');
  process.exit(0);
}

const TEAM_A = 1001;
const TEAM_B = 2002;

let pool: Pool;
let storage: DBStorage;

/**
 * Build the slice of `wiki_pages` retrieval depends on, plus the tsvector column,
 * GIN index and trigger from drizzle/0005_add_wiki_pages_fts.sql. The layer-4
 * database is bare, so the schema under test is created here explicitly.
 */
async function createSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wiki_pages (
      id         SERIAL PRIMARY KEY,
      title      TEXT NOT NULL,
      slug       TEXT NOT NULL UNIQUE,
      content    TEXT NOT NULL,
      folder     TEXT NOT NULL DEFAULT 'docs',
      tags       TEXT[] NOT NULL DEFAULT '{}',
      author     TEXT NOT NULL DEFAULT 'test',
      team_id    INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      is_published BOOLEAN NOT NULL DEFAULT TRUE,
      deleted_at TIMESTAMP
    )
  `);

  await pool.query(`ALTER TABLE wiki_pages ADD COLUMN IF NOT EXISTS search_vector tsvector`);

  await pool.query(`
    CREATE OR REPLACE FUNCTION wiki_pages_search_vector_update() RETURNS trigger AS $$
    BEGIN
      NEW.search_vector :=
        setweight(to_tsvector('simple', coalesce(NEW.title, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(NEW.content, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(array_to_string(NEW.tags, ' '), '')), 'C');
      RETURN NEW;
    END
    $$ LANGUAGE plpgsql
  `);

  await pool.query(`DROP TRIGGER IF EXISTS trg_wiki_pages_search_vector ON wiki_pages`);
  await pool.query(`
    CREATE TRIGGER trg_wiki_pages_search_vector
    BEFORE INSERT OR UPDATE ON wiki_pages
    FOR EACH ROW EXECUTE FUNCTION wiki_pages_search_vector_update()
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_wiki_pages_search_vector ON wiki_pages USING GIN (search_vector)`
  );
}

async function insertPage(page: {
  slug: string;
  title: string;
  content: string;
  teamId: number | null;
  deleted?: boolean;
}) {
  await pool.query(
    `INSERT INTO wiki_pages (title, slug, content, folder, author, team_id, deleted_at)
     VALUES ($1, $2, $3, 'docs', 'test', $4, $5)`,
    [page.title, page.slug, page.content, page.teamId, page.deleted ? new Date() : null]
  );
}

beforeAll(async () => {
  pool = new Pool({ connectionString: DATABASE_URL });
  await pool.query('DROP TABLE IF EXISTS wiki_pages');
  await createSchema();

  await insertPage({
    slug: 'a-deploy-runbook',
    title: 'Deployment runbook',
    content: 'How to deploy the firebat stack with compose',
    teamId: TEAM_A,
  });
  await insertPage({
    slug: 'a-deploy-retro',
    title: 'Retro',
    content: 'The deploy went fine last week',
    teamId: TEAM_A,
  });
  await insertPage({
    slug: 'a-unrelated',
    title: 'Lunch menu',
    content: 'kimchi stew on tuesday',
    teamId: TEAM_A,
  });
  await insertPage({
    slug: 'b-deploy-secrets',
    title: 'Deployment credentials',
    content: 'deploy secret tokens for team b',
    teamId: TEAM_B,
  });
  await insertPage({
    slug: 'personal-deploy-note',
    title: 'Personal deploy note',
    content: 'my own deploy notes',
    teamId: null,
  });
  await insertPage({
    slug: 'a-korean-guide',
    title: '배포 가이드',
    content: '파이어뱃 스택을 docker compose 로 배포하는 방법',
    teamId: TEAM_A,
  });
  await insertPage({
    slug: 'a-korean-retro',
    title: '회고',
    content: '지난주 배포 는 문제없이 끝났다',
    teamId: TEAM_A,
  });
  await insertPage({
    slug: 'b-korean-secret',
    title: '배포 자격증명',
    content: '팀 비 배포 토큰 목록',
    teamId: TEAM_B,
  });
  await insertPage({
    slug: 'a-html-content',
    title: 'Markup sample',
    content: 'deploy <img src=x onerror=alert(1)> and <b>bold</b> markup',
    teamId: TEAM_A,
  });
  await insertPage({
    slug: 'a-deleted-deploy',
    title: 'Archived deploy plan',
    content: 'deploy plan that was trashed',
    teamId: TEAM_A,
    deleted: true,
  });

  storage = new DBStorage();
});

afterAll(async () => {
  await pool.query('DROP TABLE IF EXISTS wiki_pages');
  await pool.query('DROP FUNCTION IF EXISTS wiki_pages_search_vector_update() CASCADE');
  await pool.end();
  await storage.pool.end();
});

describe('retrieveTeamScopedPages: the generated SQL runs against Postgres', () => {
  it('returns matching pages for the caller’s team', async () => {
    const rows = await storage.retrieveTeamScopedPages({
      query: 'deploy',
      teamIds: [TEAM_A],
      limit: 10,
    });

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.map((r) => r.slug).sort()).toEqual([
      'a-deploy-retro',
      'a-deploy-runbook',
      'a-html-content',
    ]);
  });

  it('never returns another team’s page', async () => {
    const rows = await storage.retrieveTeamScopedPages({
      query: 'deploy',
      teamIds: [TEAM_A],
      limit: 10,
    });

    expect(rows.some((r) => r.teamId === TEAM_B)).toBe(false);
    expect(rows.some((r) => r.slug === 'b-deploy-secrets')).toBe(false);
  });

  it('excludes soft-deleted pages', async () => {
    const rows = await storage.retrieveTeamScopedPages({
      query: 'deploy',
      teamIds: [TEAM_A],
      limit: 10,
    });
    expect(rows.some((r) => r.slug === 'a-deleted-deploy')).toBe(false);
  });

  it('excludes team-less pages', async () => {
    const rows = await storage.retrieveTeamScopedPages({
      query: 'deploy',
      teamIds: [TEAM_A, TEAM_B],
      limit: 10,
    });
    expect(rows.some((r) => r.slug === 'personal-deploy-note')).toBe(false);
  });

  it('spans every team the caller belongs to', async () => {
    const rows = await storage.retrieveTeamScopedPages({
      query: 'deploy',
      teamIds: [TEAM_A, TEAM_B],
      limit: 10,
    });
    expect(rows.map((r) => r.slug).sort()).toEqual([
      'a-deploy-retro',
      'a-deploy-runbook',
      'a-html-content',
      'b-deploy-secrets',
    ]);
  });

  it('applies the top-k bound in the database', async () => {
    const rows = await storage.retrieveTeamScopedPages({
      query: 'deploy',
      teamIds: [TEAM_A],
      limit: 1,
    });
    expect(rows).toHaveLength(1);
  });

  it('does not match a page that shares no terms with the query', async () => {
    const rows = await storage.retrieveTeamScopedPages({
      query: 'deploy',
      teamIds: [TEAM_A],
      limit: 10,
    });
    expect(rows.some((r) => r.slug === 'a-unrelated')).toBe(false);
  });

  it('produces a positive ts_rank score and a snippet', async () => {
    const rows = await storage.retrieveTeamScopedPages({
      query: 'deploy',
      teamIds: [TEAM_A],
      limit: 10,
    });
    for (const row of rows) {
      expect(Number(row.score)).toBeGreaterThan(0);
      expect(typeof row.snippet).toBe('string');
      expect((row.snippet ?? '').length).toBeGreaterThan(0);
    }
  });

  it('ranks a title match above a body-only match', async () => {
    // 'runbook' appears in the title of one page only; weight A must win.
    const rows = await storage.retrieveTeamScopedPages({
      query: 'deployment runbook',
      teamIds: [TEAM_A],
      limit: 10,
    });
    expect(rows[0].slug).toBe('a-deploy-runbook');
  });

  it('returns nothing for an empty team set instead of scanning the table', async () => {
    const rows = await storage.retrieveTeamScopedPages({ query: 'deploy', teamIds: [], limit: 10 });
    expect(rows).toEqual([]);
  });

  it('treats tsquery metacharacters as plain text rather than operators', async () => {
    // A raw string that would be a syntax error for to_tsquery must not throw.
    const rows = await storage.retrieveTeamScopedPages({
      query: "deploy' | 1=1 --",
      teamIds: [TEAM_A],
      limit: 10,
    });
    expect(Array.isArray(rows)).toBe(true);
  });
});

describe('Text search configuration is explicit, not inherited from the server', () => {
  it('does not depend on default_text_search_config', async () => {
    // Flip the session default to something that would change results if any of
    // to_tsvector / plainto_tsquery / ts_headline relied on it.
    await storage.pool.query(`SET default_text_search_config = 'pg_catalog.german'`);
    try {
      const rows = await storage.retrieveTeamScopedPages({
        query: 'deploy',
        teamIds: [TEAM_A],
        limit: 10,
      });
      expect(rows.map((r) => r.slug).sort()).toEqual([
        'a-deploy-retro',
        'a-deploy-runbook',
        'a-html-content',
      ]);
    } finally {
      await storage.pool.query(`RESET default_text_search_config`);
    }
  });
});

describe('Korean content under the "simple" configuration', () => {
  it('matches a Korean term in a page title', async () => {
    const rows = await storage.retrieveTeamScopedPages({
      query: '배포',
      teamIds: [TEAM_A],
      limit: 10,
    });
    expect(rows.map((r) => r.slug)).toContain('a-korean-guide');
  });

  it('matches a Korean term in page content', async () => {
    const rows = await storage.retrieveTeamScopedPages({
      query: '배포',
      teamIds: [TEAM_A],
      limit: 10,
    });
    expect(rows.map((r) => r.slug)).toContain('a-korean-retro');
  });

  it('keeps team isolation for Korean queries', async () => {
    const rows = await storage.retrieveTeamScopedPages({
      query: '배포',
      teamIds: [TEAM_A],
      limit: 10,
    });
    expect(rows.some((r) => r.slug === 'b-korean-secret')).toBe(false);
  });

  it('ranks a Korean title match above a body-only match', async () => {
    const rows = await storage.retrieveTeamScopedPages({
      query: '배포 가이드',
      teamIds: [TEAM_A],
      limit: 10,
    });
    expect(rows[0].slug).toBe('a-korean-guide');
  });

  it('matches a mixed Korean/English query', async () => {
    const rows = await storage.retrieveTeamScopedPages({
      query: '배포 docker',
      teamIds: [TEAM_A],
      limit: 10,
    });
    expect(rows.map((r) => r.slug)).toContain('a-korean-guide');
  });

  it('DOCUMENTS A LIMITATION: no morphological analysis, so a particle-suffixed form does not match', async () => {
    // '배포하는' contains '배포' but the 'simple' configuration does not stem or
    // segment Korean, so this is a distinct lexeme. Recorded as a known limitation
    // in docs/retrieval-architecture.md; fixing it needs an analyzer extension.
    const rows = await storage.retrieveTeamScopedPages({
      query: '배포하는',
      teamIds: [TEAM_A],
      limit: 10,
    });
    expect(rows.some((r) => r.slug === 'a-korean-retro')).toBe(false);
  });
});

describe('ts_headline emits no highlight markers', () => {
  it('adds no <b> wrapper around matched terms', async () => {
    const rows = await storage.retrieveTeamScopedPages({
      query: 'deploy',
      teamIds: [TEAM_A],
      limit: 10,
    });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.snippet ?? '').not.toContain('<b>');
      expect(row.snippet ?? '').not.toContain('</b>');
    }
  });

  it('does not leak the option string into the snippet', async () => {
    // Regression guard: `StartSel=` without quotes makes Postgres swallow the rest
    // of the option string as the selector value, so ',StopSel=' appears in output.
    const rows = await storage.retrieveTeamScopedPages({
      query: 'deploy',
      teamIds: [TEAM_A],
      limit: 10,
    });
    for (const row of rows) {
      expect(row.snippet ?? '').not.toContain('StopSel');
      expect(row.snippet ?? '').not.toContain('StartSel');
    }
  });

  it('SECURITY: page markup can survive into the snippet, so it is untrusted text', async () => {
    // ts_headline does NOT sanitise the document. A well-formed tag is often
    // dropped by the text parser, but an attribute-bearing tag such as
    // `<img src=x onerror=...>` is preserved verbatim. The snippet is therefore
    // untrusted: the client renders it as a JSX text node and must never use
    // dangerouslySetInnerHTML. This test documents the exposure so the render-side
    // guarantee cannot be quietly dropped.
    const rows = await storage.retrieveTeamScopedPages({
      query: 'deploy',
      teamIds: [TEAM_A],
      limit: 10,
    });
    const sample = rows.find((r) => r.slug === 'a-html-content');
    expect(sample).toBeDefined();
    expect(sample!.snippet).toContain('<img');
  });
});
