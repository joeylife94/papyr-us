import crypto from 'crypto';
import {
  wikiPages,
  type WikiPage,
  type InsertWikiPage,
  type UpdateWikiPage,
  type Tag,
  type SearchParams,
  type CalendarEvent,
  type InsertCalendarEvent,
  type UpdateCalendarEvent,
  type Directory,
  type InsertDirectory,
  type UpdateDirectory,
  type Comment,
  type InsertComment,
  type UpdateComment,
  type Member,
  type InsertMember,
  type UpdateMember,
  type Task,
  type InsertTask,
  type UpdateTask,
  type Notification,
  type InsertNotification,
  type UpdateNotification,
  type Template,
  type InsertTemplate,
  type UpdateTemplate,
  type TemplateCategory,
  type InsertTemplateCategory,
  type UpdateTemplateCategory,
  type Team,
  type InsertTeam,
  type UpdateTeam,
  type SavedView,
  type InsertSavedView,
  type UpdateSavedView,
  type Workflow,
  type InsertWorkflow,
  type UpdateWorkflow,
  type WorkflowRun,
  type TriggerType,
  type PagePermission,
  type InsertPagePermission,
  type UpdatePagePermission,
  type PublicLink,
  type InsertPublicLink,
  type UpdatePublicLink,
  type PermissionLevel,
  type TeamMember,
  type TeamRole,
  databaseSchemas,
  databaseRows,
  databaseRelations,
  syncedBlocks,
  syncedBlockReferences,
  users,
  calendarEvents,
  directories,
  comments,
  members,
  tasks,
  notifications,
  templates,
  templateCategories,
  teams,
  savedViews,
  workflows,
  workflowRuns,
  pagePermissions,
  publicLinks,
  teamMembers,
  pageLinks,
} from '../shared/schema.js';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, like, and, or, sql, desc, asc, isNull, inArray, type SQL } from 'drizzle-orm';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import type { RetrievedPageRow } from './services/retrieval.js';
import {
  MAX_ANCESTOR_DEPTH,
  buildPageTree,
  planSiblingOrder,
  type PageAncestor,
  type PageMoveResult,
  type PageTreeNode,
} from './services/page-tree.js';

// Helper: detect if a string looks like a bcrypt hash
function isBcryptHash(value: string): boolean {
  // bcrypt hashes typically start with $2a$, $2b$, or $2y$ and are ~60 chars
  return typeof value === 'string' && /^\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}$/.test(value);
}

/** A caller listing pages: identity plus current team memberships (see DBStorage.readableBy). */
export interface PageViewer {
  userId?: number;
  email?: string;
  teamIds: number[];
}

/** A caller without a session: only public or permission-free team-less pages are readable. */
export const ANONYMOUS_PAGE_VIEWER: PageViewer = Object.freeze({ teamIds: [] as number[] });

/** A page as the link picker, quick switcher and tree show it: never its content. */
export interface PageTitleMatch {
  id: number;
  title: string;
  slug: string;
  icon: string | null;
  teamId: number | null;
  updatedAt: Date;
}

const MAX_SLUG_INSERT_ATTEMPTS = 100;

function isTeamPagesForeignKeyViolation(error: unknown): boolean {
  const dbError = error as { code?: string; constraint?: string } | null;
  return dbError?.code === '23503' && dbError.constraint === 'wiki_pages_team_id_teams_id_fk';
}

function isSlugUniqueViolation(error: unknown): boolean {
  const dbError = error as { code?: string; constraint?: string } | null;
  if (dbError?.code !== '23505') return false;
  return !dbError.constraint || dbError.constraint.toLowerCase().includes('slug');
}

export function buildUniqueSlugCandidate(baseSlug: string, attempt: number): string {
  const normalizedBase = baseSlug.trim() || 'untitled';
  return attempt === 0 ? normalizedBase : `${normalizedBase}-${attempt + 1}`;
}

// Simplified and unified DBStorage
export class DBStorage {
  public db: any;
  public pool: Pool;

  constructor() {
    if (!process.env.DATABASE_URL) {
      console.error('\n========================================');
      console.error('  DATABASE_URL is not set.');
      console.error('  Papyr.us requires a PostgreSQL database.');
      console.error('');
      console.error('  Quick start:');
      console.error('    1. cp .env.example .env');
      console.error('    2. Set DATABASE_URL in .env');
      console.error('       Example: postgresql://user:pass@localhost:5432/papyrus');
      console.error('    3. Run: npm run db:push');
      console.error('');
      console.error('  Or use Docker: docker-compose up -d');
      console.error('========================================\n');
      throw new Error('DATABASE_URL is required. See .env.example for setup instructions.');
    }

    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    // Prevent idle-client errors from crashing the process
    this.pool.on('error', (err) => {
      console.error('[DB Pool] Unexpected error on idle client:', err.message);
    });

    this.db = drizzle(this.pool);
  }

  // All method implementations remain the same as before...
  async getWikiPage(id: number): Promise<WikiPage | undefined> {
    const result = await this.db
      .select()
      .from(wikiPages)
      .where(and(eq(wikiPages.id, id), isNull(wikiPages.deletedAt)));
    return result[0];
  }

  async getWikiPageBySlug(slug: string): Promise<WikiPage | undefined> {
    const result = await this.db
      .select()
      .from(wikiPages)
      .where(and(eq(wikiPages.slug, slug), isNull(wikiPages.deletedAt)));
    return result[0];
  }

  async createWikiPage(page: InsertWikiPage, creatorUserId?: number): Promise<WikiPage> {
    let createdPage: WikiPage | undefined;

    for (let attempt = 0; attempt < MAX_SLUG_INSERT_ATTEMPTS; attempt += 1) {
      const slug = buildUniqueSlugCandidate(page.slug, attempt);
      try {
        const result = await this.db
          .insert(wikiPages)
          .values({ ...page, slug })
          .returning();
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

  async updateWikiPage(id: number, page: UpdateWikiPage): Promise<WikiPage | undefined> {
    const result = await this.db
      .update(wikiPages)
      .set(page)
      .where(eq(wikiPages.id, id))
      .returning();
    return result[0];
  }

  /**
   * Soft delete. `descendantIds` (the page's live subtree, #103 D5) go to the trash in the same
   * statement with the same timestamp, which is how a restore finds what was trashed with it.
   * Returns whether the page itself was trashed.
   */
  async deleteWikiPage(id: number, descendantIds: number[] = []): Promise<boolean> {
    const ids = Array.from(new Set([id, ...descendantIds]));
    const result = await this.db
      .update(wikiPages)
      .set({ deletedAt: new Date() })
      .where(and(inArray(wikiPages.id, ids), isNull(wikiPages.deletedAt)))
      .returning({ id: wikiPages.id });
    return result.some((row: { id: number }) => row.id === id);
  }

  /** Hard delete, only for a page that is already in the trash (soft-deleted). */
  async permanentlyDeleteWikiPage(id: number): Promise<boolean> {
    const result = await this.db
      .delete(wikiPages)
      .where(and(eq(wikiPages.id, id), sql`${wikiPages.deletedAt} IS NOT NULL`))
      .returning();
    return result.length > 0;
  }

  /** Restore a page, and `descendantIds` (what was trashed with it) in the same statement. */
  async restoreWikiPage(id: number, descendantIds: number[] = []): Promise<WikiPage | undefined> {
    const ids = Array.from(new Set([id, ...descendantIds]));
    const result = await this.db
      .update(wikiPages)
      .set({ deletedAt: null })
      .where(inArray(wikiPages.id, ids))
      .returning();
    return result.find((page: WikiPage) => page.id === id);
  }

  async getTrashPages(teamId?: number): Promise<WikiPage[]> {
    const conditions = [sql`${wikiPages.deletedAt} IS NOT NULL`];
    if (teamId) {
      conditions.push(eq(wikiPages.teamId, teamId));
    }
    return this.db
      .select()
      .from(wikiPages)
      .where(and(...conditions))
      .orderBy(desc(wikiPages.deletedAt));
  }

  async emptyTrash(teamId?: number): Promise<number> {
    const conditions = [sql`${wikiPages.deletedAt} IS NOT NULL`];
    if (teamId) {
      conditions.push(eq(wikiPages.teamId, teamId));
    }
    const result = await this.db
      .delete(wikiPages)
      .where(and(...conditions))
      .returning();
    return result.length;
  }

  async searchWikiPages(
    params: SearchParams,
    options: { readableBy?: PageViewer } = {}
  ): Promise<{ pages: WikiPage[]; total: number }> {
    // Enable FTS by default (can be disabled with SEARCH_USE_FTS=false)
    const useFts = (process.env.SEARCH_USE_FTS || 'true').toLowerCase() === 'true';
    const hasQuery = !!(params.query && params.query.trim().length > 0);

    // Sanitize query for FTS
    const sanitizeQuery = (q: string) =>
      q
        .trim()
        .replace(/[:&|!()]/g, ' ')
        .replace(/\s+/g, ' ');

    // Build select with optional rank column
    const selectColumns: any = { ...wikiPages };
    if (useFts && hasQuery && params.sort === 'rank') {
      const q = sanitizeQuery(params.query!);
      selectColumns.rank = sql<number>`ts_rank(search_vector, plainto_tsquery('simple', ${q}))`;
    }

    const query = this.db.select(selectColumns).from(wikiPages);
    const countQuery = this.db.select({ count: sql`count(*)` }).from(wikiPages);

    const conditions = [];

    // Always exclude soft-deleted pages
    conditions.push(isNull(wikiPages.deletedAt));

    if (hasQuery) {
      if (useFts) {
        const q = sanitizeQuery(params.query!);
        conditions.push(sql`search_vector @@ plainto_tsquery('simple', ${q})`);
      } else {
        // Fallback to LIKE search on title and content
        conditions.push(
          sql`(${wikiPages.title} ILIKE ${'%' + params.query + '%'} OR ${wikiPages.content} ILIKE ${'%' + params.query + '%'})`
        );
      }
    }
    if (params.folder) {
      conditions.push(eq(wikiPages.folder, params.folder));
    }
    if (params.teamId === 'null') {
      // Special sentinel: only return pages with no team (global/personal pages)
      conditions.push(isNull(wikiPages.teamId));
    } else if (params.teamId) {
      conditions.push(eq(wikiPages.teamId, Number(params.teamId)));
    }
    if (params.tags && params.tags.length > 0) {
      // Use ARRAY constructor to ensure proper type casting
      conditions.push(
        sql`${wikiPages.tags} && ARRAY[${sql.join(
          params.tags.map((t) => sql`${t}`),
          sql`, `
        )}]::text[]`
      );
    }
    if (options.readableBy) {
      // Applied in SQL so totals and pagination never count pages the viewer cannot read.
      conditions.push(this.readableBy(options.readableBy));
    }

    if (conditions.length > 0) {
      query.where(and(...conditions));
      countQuery.where(and(...conditions));
    }

    const totalResult = await countQuery;
    const total = Number(totalResult[0].count);

    // Apply ordering and pagination
    if (useFts && hasQuery && params.sort === 'rank') {
      // Rank by relevance (ts_rank) when using FTS - already in SELECT
      query
        .limit(params.limit || 20)
        .offset(params.offset || 0)
        .orderBy(sql`rank DESC`);
    } else {
      // Default: order by update time
      query
        .limit(params.limit || 20)
        .offset(params.offset || 0)
        .orderBy(desc(wikiPages.updatedAt));
    }

    const pages = await query;
    return { pages, total };
  }

  /**
   * Team-scoped full-text retrieval over wiki pages.
   *
   * Ranking, snippet extraction and the top-k cut all happen in Postgres so the
   * caller never materialises a workspace in memory. Backing index:
   * `idx_wiki_pages_search_vector` (see drizzle/0005_add_wiki_pages_fts.sql).
   *
   * Guarantees enforced here:
   *   - only pages whose `team_id` is in `teamIds` are considered;
   *   - soft-deleted pages (`deleted_at IS NOT NULL`) are excluded;
   *   - at most `limit` rows are returned.
   */
  async retrieveTeamScopedPages(params: {
    query: string;
    teamIds: number[];
    limit: number;
  }): Promise<RetrievedPageRow[]> {
    // An empty team set can never match anything; avoid emitting `IN ()`.
    if (params.teamIds.length === 0) return [];

    const tsquery = sql`plainto_tsquery('simple', ${params.query})`;
    const rank = sql<number>`ts_rank(search_vector, ${tsquery})`;

    return this.db
      .select({
        pageId: wikiPages.id,
        teamId: wikiPages.teamId,
        slug: wikiPages.slug,
        title: wikiPages.title,
        // StartSel/StopSel are quoted empty strings so no highlight markers are
        // emitted. Writing them unquoted (`StartSel=`) does NOT mean "empty" —
        // Postgres consumes the rest of the option string as the value and the
        // default `</b>` stop marker survives into the snippet.
        //
        // ts_headline still does not sanitise the document: content such as
        // `<img src=x onerror=...>` can appear verbatim in the output. Snippets are
        // therefore untrusted plain text and must never be rendered as HTML.
        snippet: sql<string>`ts_headline('simple', ${wikiPages.content}, ${tsquery}, 'MaxFragments=1,MaxWords=40,MinWords=15,ShortWord=3,StartSel="",StopSel=""')`,
        score: rank,
      })
      .from(wikiPages)
      .where(
        and(
          isNull(wikiPages.deletedAt),
          inArray(wikiPages.teamId, params.teamIds),
          sql`search_vector @@ ${tsquery}`
        )
      )
      .orderBy(desc(rank), desc(wikiPages.updatedAt))
      .limit(params.limit);
  }

  /** Who is listing pages: identity plus current team memberships, loaded from the database. */
  async getPageViewer(userId?: number): Promise<PageViewer> {
    if (!userId) return ANONYMOUS_PAGE_VIEWER;
    const [user] = await this.db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId));
    return { userId, email: user?.email, teamIds: await this.getUserTeamIds(userId) };
  }

  /**
   * SQL form of `checkPagePermission(viewer, page, 'viewer')`, for listings that must never
   * reveal a page GET /api/pages/:id would refuse:
   * - team pages: current members of the team, a public grant, or a grant to one of the
   *   viewer's teams; authorship and user grants need membership, so they add nothing here;
   * - team-less pages: open without explicit permissions; otherwise a public grant, or
   *   (signed in) authorship, a user grant, or a grant to one of the viewer's teams.
   */
  private readableBy(viewer: PageViewer): SQL {
    const validPermission = sql`pp.permission IN ('viewer', 'commenter', 'editor', 'owner')`;
    const grant = (clause: SQL) =>
      sql`EXISTS (SELECT 1 FROM page_permissions pp WHERE pp.page_id = ${wikiPages.id} AND ${validPermission} AND ${clause})`;
    const hasPermissions = sql`EXISTS (SELECT 1 FROM page_permissions pp WHERE pp.page_id = ${wikiPages.id})`;
    const teamless = isNull(wikiPages.teamId);

    const conditions: SQL[] = [
      and(sql`NOT ${hasPermissions}`, teamless)!,
      grant(sql`pp.entity_type = 'public'`),
    ];
    if (viewer.userId) {
      conditions.push(
        and(teamless, grant(sql`pp.entity_type = 'user' AND pp.entity_id = ${viewer.userId}`))!
      );
      if (viewer.email) {
        conditions.push(and(teamless, hasPermissions, eq(wikiPages.author, viewer.email))!);
      }
      if (viewer.teamIds.length > 0) {
        conditions.push(inArray(wikiPages.teamId, viewer.teamIds));
        conditions.push(
          grant(
            sql`pp.entity_type = 'team' AND pp.entity_id IN (${sql.join(
              viewer.teamIds.map((teamId) => sql`${teamId}`),
              sql`, `
            )})`
          )
        );
      }
    }
    return or(...conditions)!;
  }

  /**
   * Listing scope: the viewer's teams plus team-less pages (the scope GET /api/pages already
   * applies), narrowed to pages the viewer can read. Listings therefore also honour team
   * revocation immediately.
   */
  private listableBy(viewer: PageViewer): SQL {
    const teamScope =
      viewer.teamIds.length > 0
        ? or(isNull(wikiPages.teamId), inArray(wikiPages.teamId, viewer.teamIds))!
        : isNull(wikiPages.teamId);
    return and(teamScope, this.readableBy(viewer))!;
  }

  /**
   * `listableBy` for read paths outside this class (page tree, link picker, backlinks, link
   * resolution, graph, #103 E5/E6): every page such a path returns must satisfy it.
   */
  readablePageCondition(viewer: PageViewer): SQL {
    return this.listableBy(viewer);
  }

  /**
   * Live pages of one workspace scope (a team, or `null` for team-less pages) that the viewer can
   * read: the base condition for the page tree, link picker, quick switcher and graph.
   */
  readablePagesInScope(viewer: PageViewer, teamId: number | null): SQL {
    return and(
      isNull(wikiPages.deletedAt),
      teamId === null ? isNull(wikiPages.teamId) : eq(wikiPages.teamId, teamId),
      this.listableBy(viewer)
    )!;
  }

  /**
   * Readable pages of one scope whose title contains `query` (case-insensitive), for the link
   * picker and the quick switcher (#103 E6, #111). Exact matches come first, then prefix
   * matches, then the most recently updated; an empty query lists the most recently updated.
   */
  async searchReadablePageTitles(
    viewer: PageViewer,
    teamId: number | null,
    options: { query?: string; limit?: number; excludeId?: number } = {}
  ): Promise<PageTitleMatch[]> {
    const query = (options.query ?? '').trim();
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
    const conditions: SQL[] = [this.readablePagesInScope(viewer, teamId)];
    if (options.excludeId) conditions.push(sql`${wikiPages.id} <> ${options.excludeId}`);
    const lowered = query.toLowerCase();
    // ILIKE/LIKE treat % and _ as wildcards; a typed title must match literally.
    const escaped = lowered.replace(/[\\%_]/g, (c) => `\\${c}`);
    if (query) conditions.push(sql`${wikiPages.title} ILIKE ${`%${escaped}%`}`);
    const order: SQL[] = query
      ? [
          sql`CASE WHEN lower(${wikiPages.title}) = ${lowered} THEN 0
            WHEN lower(${wikiPages.title}) LIKE ${`${escaped}%`} THEN 1 ELSE 2 END`,
        ]
      : [];
    return this.db
      .select({
        id: wikiPages.id,
        title: wikiPages.title,
        slug: wikiPages.slug,
        icon: wikiPages.icon,
        teamId: wikiPages.teamId,
        updatedAt: wikiPages.updatedAt,
      })
      .from(wikiPages)
      .where(and(...conditions))
      .orderBy(...order, desc(wikiPages.updatedAt))
      .limit(limit);
  }

  /**
   * Link chips (#103 E6): the pages among `ids` that are live and readable by the viewer, with
   * the fields a chip shows. An id missing from the result is deleted, unknown or unreadable;
   * callers must not tell those apart.
   */
  async resolveReadablePageLinks(
    viewer: PageViewer,
    ids: number[]
  ): Promise<Array<Pick<PageTitleMatch, 'id' | 'title' | 'slug' | 'icon'>>> {
    if (ids.length === 0) return [];
    return this.db
      .select({
        id: wikiPages.id,
        title: wikiPages.title,
        slug: wikiPages.slug,
        icon: wikiPages.icon,
      })
      .from(wikiPages)
      .where(and(inArray(wikiPages.id, ids), isNull(wikiPages.deletedAt), this.listableBy(viewer)));
  }

  /**
   * Backlinks (#103 E6): live pages the viewer can read whose body links to `pageId`, most
   * recently updated first. `page_links` also indexes links to pages their author cannot read,
   * so the source side is filtered here and the target side by the caller's page check.
   */
  async getReadableBacklinks(
    viewer: PageViewer,
    pageId: number,
    limit = 100
  ): Promise<Array<Omit<PageTitleMatch, 'teamId'>>> {
    return this.db
      .select({
        id: wikiPages.id,
        title: wikiPages.title,
        slug: wikiPages.slug,
        icon: wikiPages.icon,
        updatedAt: wikiPages.updatedAt,
      })
      .from(wikiPages)
      .where(
        and(
          sql`EXISTS (SELECT 1 FROM page_links pl WHERE pl.source_page_id = ${wikiPages.id} AND pl.target_page_id = ${pageId})`,
          sql`${wikiPages.id} <> ${pageId}`,
          isNull(wikiPages.deletedAt),
          this.listableBy(viewer)
        )
      )
      .orderBy(desc(wikiPages.updatedAt))
      .limit(limit);
  }

  /**
   * Replace the outgoing links of a page with `targetIds` in one transaction (the save
   * pipeline's link index, #103 E6). Self-links and ids of pages that do not exist are skipped;
   * trashed targets stay indexed so their backlinks return with them on restore.
   */
  async replacePageLinks(sourcePageId: number, targetIds: number[]): Promise<void> {
    const targets = Array.from(
      new Set(targetIds.filter((id) => Number.isInteger(id) && id > 0 && id !== sourcePageId))
    );
    await this.db.transaction(async (tx: any) => {
      // Serializes concurrent syncs of one page (a REST autosave and a Yjs save can overlap).
      // NO KEY UPDATE does not block the foreign-key checks of links from other pages.
      const source = await tx.execute(
        sql`SELECT id FROM wiki_pages WHERE id = ${sourcePageId} FOR NO KEY UPDATE`
      );
      if (source.rows.length === 0) return;
      await tx.execute(sql`DELETE FROM page_links WHERE source_page_id = ${sourcePageId}`);
      if (targets.length === 0) return;
      await tx.execute(sql`
        INSERT INTO page_links (source_page_id, target_page_id)
        SELECT ${sourcePageId}, id FROM wiki_pages
        WHERE id IN (${sql.join(
          targets.map((id) => sql`${id}`),
          sql`, `
        )})
        ON CONFLICT DO NOTHING`);
    });
  }

  async getReadableWikiPagesByFolder(folder: string, userId: number): Promise<WikiPage[]> {
    const viewer = await this.getPageViewer(userId);
    return this.db
      .select()
      .from(wikiPages)
      .where(
        and(eq(wikiPages.folder, folder), isNull(wikiPages.deletedAt), this.listableBy(viewer))
      )
      .orderBy(desc(wikiPages.updatedAt));
  }

  async getReadableChildPages(parentId: number, userId?: number): Promise<WikiPage[]> {
    const viewer = await this.getPageViewer(userId);
    return this.db
      .select()
      .from(wikiPages)
      .where(
        and(eq(wikiPages.parentId, parentId), isNull(wikiPages.deletedAt), this.listableBy(viewer))
      )
      .orderBy(desc(wikiPages.updatedAt));
  }

  // ---- Page tree (#103 E5, decisions D4/D5); route rules in server/routes/page-tree.ts ----

  /**
   * The sidebar tree of one workspace scope: every live page of the scope the viewer can read,
   * never content, shaped by `buildPageTree` (a page whose parent the viewer cannot see is a
   * root page, D4).
   */
  async getPageTree(
    viewer: PageViewer,
    teamId: number | null,
    db: any = this.db
  ): Promise<PageTreeNode[]> {
    const rows = await db
      .select({
        id: wikiPages.id,
        title: wikiPages.title,
        slug: wikiPages.slug,
        icon: wikiPages.icon,
        parentId: wikiPages.parentId,
        position: wikiPages.position,
        createdAt: wikiPages.createdAt,
        updatedAt: wikiPages.updatedAt,
      })
      .from(wikiPages)
      .where(this.readablePagesInScope(viewer, teamId));
    return buildPageTree(rows);
  }

  /**
   * Ids of the live pages below a page at any depth, in the page's own workspace scope, whether
   * or not a given caller can read them (D5 checks each one). A parent link from another scope
   * is not followed: such a page is a root page of its own workspace.
   */
  async getLivePageDescendantIds(pageId: number): Promise<number[]> {
    const result = await this.db.execute(sql`
      WITH RECURSIVE root AS (
        SELECT id, team_id FROM wiki_pages WHERE id = ${pageId}
      ),
      subtree(id) AS (
        SELECT w.id FROM wiki_pages w JOIN root ON w.parent_id = root.id
        WHERE w.deleted_at IS NULL AND w.team_id IS NOT DISTINCT FROM root.team_id
        UNION
        SELECT w.id FROM wiki_pages w JOIN subtree s ON w.parent_id = s.id CROSS JOIN root
        WHERE w.deleted_at IS NULL AND w.team_id IS NOT DISTINCT FROM root.team_id
      )
      SELECT id FROM subtree WHERE id <> ${pageId}
    `);
    return this.resultIds(result);
  }

  /**
   * Ids of the pages trashed together with a trashed page (its subtree at that moment, trashed
   * by the same statement, see deleteWikiPage), without the page itself.
   */
  async getPagesTrashedWith(pageId: number): Promise<number[]> {
    const result = await this.db.execute(sql`
      WITH RECURSIVE root AS (
        SELECT id, team_id, deleted_at FROM wiki_pages
        WHERE id = ${pageId} AND deleted_at IS NOT NULL
      ),
      subtree(id) AS (
        SELECT w.id FROM wiki_pages w JOIN root ON w.parent_id = root.id
        WHERE w.deleted_at = root.deleted_at AND w.team_id IS NOT DISTINCT FROM root.team_id
        UNION
        SELECT w.id FROM wiki_pages w JOIN subtree s ON w.parent_id = s.id CROSS JOIN root
        WHERE w.deleted_at = root.deleted_at AND w.team_id IS NOT DISTINCT FROM root.team_id
      )
      SELECT id FROM subtree WHERE id <> ${pageId}
    `);
    return this.resultIds(result);
  }

  /** Ids of every page above a page, following parent links through any page (loop-safe). */
  async getPageAncestorIds(pageId: number, db: any = this.db): Promise<number[]> {
    const result = await db.execute(sql`
      WITH RECURSIVE chain(id, parent_id) AS (
        SELECT id, parent_id FROM wiki_pages WHERE id = ${pageId}
        UNION
        SELECT w.id, w.parent_id FROM wiki_pages w JOIN chain c ON w.id = c.parent_id
      )
      SELECT id FROM chain WHERE id <> ${pageId}
    `);
    return this.resultIds(result);
  }

  /**
   * The breadcrumb above a live page, root first: its ancestors as long as each is live, in the
   * page's scope and readable by the viewer. The walk stops at the first one that is not, so
   * nothing above a hidden page shows (D4).
   */
  async getReadablePageAncestors(viewer: PageViewer, pageId: number): Promise<PageAncestor[]> {
    const [page] = await this.db
      .select({ teamId: wikiPages.teamId })
      .from(wikiPages)
      .where(and(eq(wikiPages.id, pageId), isNull(wikiPages.deletedAt)));
    if (!page) return [];
    const chain = await this.db.execute(sql`
      WITH RECURSIVE chain(id, parent_id, depth) AS (
        SELECT id, parent_id, 0 FROM wiki_pages WHERE id = ${pageId}
        UNION ALL
        SELECT w.id, w.parent_id, c.depth + 1 FROM wiki_pages w JOIN chain c ON w.id = c.parent_id
        WHERE c.depth < ${MAX_ANCESTOR_DEPTH}
      )
      SELECT id FROM chain WHERE depth > 0 ORDER BY depth
    `);
    const ids = this.resultIds(chain);
    if (ids.length === 0) return [];
    const readable: PageAncestor[] = await this.db
      .select({
        id: wikiPages.id,
        title: wikiPages.title,
        slug: wikiPages.slug,
        icon: wikiPages.icon,
      })
      .from(wikiPages)
      .where(
        and(inArray(wikiPages.id, ids), this.readablePagesInScope(viewer, page.teamId ?? null))
      );
    const byId = new Map(readable.map((ancestor) => [ancestor.id, ancestor]));
    const trail: PageAncestor[] = [];
    const seen = new Set([pageId]);
    for (const id of ids) {
      const ancestor = byId.get(id);
      if (!ancestor || seen.has(id)) break;
      seen.add(id);
      trail.push(ancestor);
    }
    return trail.reverse();
  }

  /**
   * Move a live page under `parentId` (null: the workspace root) at `index` among the siblings
   * the viewer sees there (see planSiblingOrder), renumbering the new and the old sibling list
   * densely, in one transaction. Moves within a workspace are serialized and the parent and loop
   * checks are repeated under that lock, so concurrent moves cannot build a loop. Authorization
   * is the caller's job.
   */
  async movePage(
    viewer: PageViewer,
    pageId: number,
    parentId: number | null,
    index: number
  ): Promise<PageMoveResult> {
    return this.db.transaction(async (tx: any): Promise<PageMoveResult> => {
      const livePage = async () =>
        (
          await tx
            .select({ parentId: wikiPages.parentId, teamId: wikiPages.teamId })
            .from(wikiPages)
            .where(and(eq(wikiPages.id, pageId), isNull(wikiPages.deletedAt)))
        )[0] as { parentId: number | null; teamId: number | null } | undefined;

      const before = await livePage();
      if (!before) return { status: 'not-found' };
      const teamId = before.teamId ?? null;
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('papyrus.page_tree'), ${teamId ?? 0})`
      );
      const page = await livePage();
      if (!page || (page.teamId ?? null) !== teamId) return { status: 'not-found' };

      if (parentId !== null) {
        const [parent] = await tx
          .select({ teamId: wikiPages.teamId })
          .from(wikiPages)
          .where(and(eq(wikiPages.id, parentId), isNull(wikiPages.deletedAt)));
        if (!parent) return { status: 'parent-not-found' };
        if ((parent.teamId ?? null) !== teamId) return { status: 'cross-team' };
        if (parentId === pageId || (await this.getPageAncestorIds(parentId, tx)).includes(pageId)) {
          return { status: 'cycle' };
        }
      }

      const visible = (await this.getPageTree(viewer, teamId, tx))
        .filter((node) => node.parentId === parentId)
        .map((node) => node.id);
      const order = planSiblingOrder(
        await this.siblingIds(tx, teamId, parentId),
        visible,
        index,
        pageId
      );
      await tx.update(wikiPages).set({ parentId }).where(eq(wikiPages.id, pageId));
      await this.renumberSiblings(tx, order);
      const oldParentId = page.parentId ?? null;
      if (oldParentId !== parentId) {
        await this.renumberSiblings(tx, await this.siblingIds(tx, teamId, oldParentId));
      }
      return { status: 'moved', page: { id: pageId, parentId } };
    });
  }

  /** Live pages directly under `parentId` (null: root) in one scope, in sibling order. */
  private async siblingIds(
    db: any,
    teamId: number | null,
    parentId: number | null
  ): Promise<number[]> {
    const rows = await db
      .select({ id: wikiPages.id })
      .from(wikiPages)
      .where(
        and(
          isNull(wikiPages.deletedAt),
          parentId === null ? isNull(wikiPages.parentId) : eq(wikiPages.parentId, parentId),
          teamId === null ? isNull(wikiPages.teamId) : eq(wikiPages.teamId, teamId)
        )
      )
      .orderBy(
        sql`${wikiPages.position} ASC NULLS LAST`,
        asc(wikiPages.createdAt),
        asc(wikiPages.id)
      );
    return rows.map((row: { id: number }) => row.id);
  }

  /** Store `ids` as positions 0..n-1 in one statement, touching only rows that change. */
  private async renumberSiblings(db: any, ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    const values = sql.join(
      ids.map((id, position) => sql`(${id}::int, ${position}::int)`),
      sql`, `
    );
    await db.execute(sql`
      UPDATE wiki_pages AS w SET position = v.position
      FROM (VALUES ${values}) AS v(id, position)
      WHERE w.id = v.id AND w.position IS DISTINCT FROM v.position
    `);
  }

  private resultIds(result: any): number[] {
    const rows: Array<{ id: number | string }> = result?.rows ?? result ?? [];
    return rows.map((row) => Number(row.id));
  }

  async getReadableTags(userId: number): Promise<Tag[]> {
    const viewer = await this.getPageViewer(userId);
    const allPages = await this.db
      .select({ tags: wikiPages.tags })
      .from(wikiPages)
      .where(and(isNull(wikiPages.deletedAt), this.listableBy(viewer)));
    const tagCounts = new Map<string, number>();
    allPages.forEach((page: { tags: string[] }) => {
      page.tags?.forEach((tag: string) => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      });
    });
    return Array.from(tagCounts.entries()).map(([name, count]) => ({ name, count }));
  }

  /**
   * Source rows of the knowledge graph (#111 §1): live pages of the given teams the viewer can
   * read (most recently updated first, capped), and the `page_links` rows whose both ends are
   * among them. `content` feeds legacy `[[Title]]` edges and AI suggestions only; the graph
   * response never carries it.
   */
  async getKnowledgeGraphSource(
    viewer: PageViewer,
    teamIds: number[],
    limit = 2000
  ): Promise<{
    pages: Array<{
      id: number;
      title: string;
      slug: string;
      icon: string | null;
      tags: string[] | null;
      content: string | null;
    }>;
    links: Array<{ sourcePageId: number; targetPageId: number }>;
  }> {
    if (teamIds.length === 0) return { pages: [], links: [] };
    // Equivalent to OR-ing readablePagesInScope over the teams, without repeating the ACL SQL.
    const pages = await this.db
      .select({
        id: wikiPages.id,
        title: wikiPages.title,
        slug: wikiPages.slug,
        icon: wikiPages.icon,
        tags: wikiPages.tags,
        content: wikiPages.content,
      })
      .from(wikiPages)
      .where(
        and(
          isNull(wikiPages.deletedAt),
          inArray(wikiPages.teamId, teamIds),
          this.readablePageCondition(viewer)
        )
      )
      .orderBy(desc(wikiPages.updatedAt))
      .limit(limit);
    if (pages.length === 0) return { pages, links: [] };
    const ids = pages.map((page: { id: number }) => page.id);
    const links = await this.db
      .select({ sourcePageId: pageLinks.sourcePageId, targetPageId: pageLinks.targetPageId })
      .from(pageLinks)
      .where(and(inArray(pageLinks.sourcePageId, ids), inArray(pageLinks.targetPageId, ids)));
    return { pages, links };
  }

  /**
   * Readable neighbourhood of a page in `page_links` (#111 §2 local graph): pages it links to and
   * pages linking to it, up to `depth` hops, then every link among those pages. Traversal only
   * passes through live pages the viewer can read, so an unreadable or trashed page is neither
   * shown nor used as a bridge. The centre page itself is the caller's (already checked) page.
   */
  async getLocalPageGraph(
    viewer: PageViewer,
    pageId: number,
    depth: 1 | 2,
    maxNodes = 150
  ): Promise<{
    neighbours: Array<{ id: number; title: string; slug: string; icon: string | null }>;
    links: Array<{ sourcePageId: number; targetPageId: number }>;
  }> {
    const neighbours: Array<{ id: number; title: string; slug: string; icon: string | null }> = [];
    const known = new Set<number>([pageId]);
    let frontier = [pageId];
    for (let level = 0; level < depth && frontier.length > 0 && known.size < maxNodes; level++) {
      const rows = await this.db
        .select({
          id: wikiPages.id,
          title: wikiPages.title,
          slug: wikiPages.slug,
          icon: wikiPages.icon,
        })
        .from(wikiPages)
        .where(
          and(
            or(
              inArray(
                wikiPages.id,
                this.db
                  .select({ id: pageLinks.targetPageId })
                  .from(pageLinks)
                  .where(inArray(pageLinks.sourcePageId, frontier))
              ),
              inArray(
                wikiPages.id,
                this.db
                  .select({ id: pageLinks.sourcePageId })
                  .from(pageLinks)
                  .where(inArray(pageLinks.targetPageId, frontier))
              )
            ),
            sql`${wikiPages.id} NOT IN (${sql.join(
              [...known].map((id) => sql`${id}`),
              sql`, `
            )})`,
            isNull(wikiPages.deletedAt),
            this.readablePageCondition(viewer)
          )
        )
        .orderBy(asc(wikiPages.title), asc(wikiPages.id))
        .limit(maxNodes - known.size);
      frontier = [];
      for (const row of rows) {
        known.add(row.id);
        neighbours.push(row);
        frontier.push(row.id);
      }
    }
    if (neighbours.length === 0) return { neighbours, links: [] };
    const ids = [...known];
    const links = await this.db
      .select({ sourcePageId: pageLinks.sourcePageId, targetPageId: pageLinks.targetPageId })
      .from(pageLinks)
      .where(and(inArray(pageLinks.sourcePageId, ids), inArray(pageLinks.targetPageId, ids)));
    return { neighbours, links };
  }

  /**
   * Unlinked mentions of a page (#111 §5): live pages of the same scope (its team, or team-less
   * pages) the viewer can read, whose content contains the page title (case-insensitive,
   * literal) but which do not link to it in `page_links`. Each row carries a ~240-character
   * content window around the first mention (`excerpt`, starting at character `offset`) for
   * the snippet; titles shorter than two characters match nothing.
   */
  async getUnlinkedMentions(
    viewer: PageViewer,
    page: { id: number; title: string; teamId: number | null },
    limit = 20
  ): Promise<
    Array<{
      id: number;
      title: string;
      slug: string;
      icon: string | null;
      excerpt: string;
      offset: number;
      contentLength: number;
    }>
  > {
    const title = page.title.trim();
    if ([...title].length < 2) return [];
    const lowered = title.toLowerCase();
    // ILIKE/LIKE treat % and _ as wildcards; the title must match literally.
    const escaped = lowered.replace(/[\\%_]/g, (c) => `\\${c}`);
    const windowStart = sql`greatest(strpos(lower(${wikiPages.content}), ${lowered}) - 60, 1)`;
    return this.db
      .select({
        id: wikiPages.id,
        title: wikiPages.title,
        slug: wikiPages.slug,
        icon: wikiPages.icon,
        excerpt: sql<string>`substring(${wikiPages.content} from ${windowStart} for 240)`,
        offset: sql<number>`(${windowStart} - 1)::int`,
        contentLength: sql<number>`char_length(${wikiPages.content})::int`,
      })
      .from(wikiPages)
      .where(
        and(
          this.readablePagesInScope(viewer, page.teamId),
          sql`${wikiPages.id} <> ${page.id}`,
          sql`${wikiPages.content} ILIKE ${`%${escaped}%`}`,
          sql`NOT EXISTS (SELECT 1 FROM ${pageLinks} WHERE ${pageLinks.sourcePageId} = ${wikiPages.id} AND ${pageLinks.targetPageId} = ${page.id})`
        )
      )
      .orderBy(desc(wikiPages.updatedAt))
      .limit(Math.min(Math.max(limit, 1), 50));
  }

  async getFolders(): Promise<string[]> {
    const result = await this.db
      .selectDistinct({ folder: wikiPages.folder })
      .from(wikiPages)
      .where(isNull(wikiPages.deletedAt));
    return result.map((r: { folder: string }) => r.folder);
  }

  async getCalendarEvents(teamId?: number): Promise<CalendarEvent[]> {
    const query = this.db.select().from(calendarEvents);
    if (teamId) {
      query.where(eq(calendarEvents.teamId, String(teamId)));
    }
    return query.orderBy(asc(calendarEvents.startDate));
  }

  async getCalendarEvent(id: number): Promise<CalendarEvent | undefined> {
    const result = await this.db.select().from(calendarEvents).where(eq(calendarEvents.id, id));
    return result[0];
  }

  async createCalendarEvent(event: InsertCalendarEvent): Promise<CalendarEvent> {
    const result = await this.db.insert(calendarEvents).values(event).returning();
    return result[0];
  }

  async updateCalendarEvent(
    id: number,
    event: UpdateCalendarEvent
  ): Promise<CalendarEvent | undefined> {
    const result = await this.db
      .update(calendarEvents)
      .set(event)
      .where(eq(calendarEvents.id, id))
      .returning();
    return result[0];
  }

  async deleteCalendarEvent(id: number): Promise<boolean> {
    const result = await this.db
      .delete(calendarEvents)
      .where(eq(calendarEvents.id, id))
      .returning();
    return result.length > 0;
  }

  async getDirectories(): Promise<Directory[]> {
    return this.db.select().from(directories).orderBy(asc(directories.order));
  }

  async getDirectory(id: number): Promise<Directory | undefined> {
    const result = await this.db.select().from(directories).where(eq(directories.id, id));
    return result[0];
  }

  async createDirectory(directory: InsertDirectory): Promise<Directory> {
    if (directory.password) {
      // Hash plaintext password before saving
      directory.password = await bcrypt.hash(directory.password, 10);
    }
    const result = await this.db.insert(directories).values(directory).returning();
    return result[0];
  }

  async updateDirectory(id: number, directory: UpdateDirectory): Promise<Directory | undefined> {
    if (directory.password) {
      // Hash only if it's not already a bcrypt hash
      if (!isBcryptHash(directory.password)) {
        directory.password = await bcrypt.hash(directory.password, 10);
      }
    }
    const result = await this.db
      .update(directories)
      .set(directory)
      .where(eq(directories.id, id))
      .returning();
    return result[0];
  }

  async deleteDirectory(id: number): Promise<boolean> {
    const result = await this.db.delete(directories).where(eq(directories.id, id)).returning();
    return result.length > 0;
  }

  async verifyDirectoryPassword(directoryName: string, password: string): Promise<boolean> {
    const result = await this.db
      .select({ password: directories.password })
      .from(directories)
      .where(eq(directories.name, directoryName));
    const dir = result[0];
    if (!dir || !dir.password) return true;

    // Only accept bcrypt hashed passwords (no plaintext fallback)
    if (!isBcryptHash(dir.password)) {
      console.error(
        `[Security Warning] Directory "${directoryName}" has unhashed password. Run migration script.`
      );
      return false; // Reject plaintext passwords
    }

    return await bcrypt.compare(password, dir.password);
  }

  async getCommentsByPageId(pageId: number): Promise<Comment[]> {
    // P4: LEFT JOIN with users to resolve the current display name.
    // Priority: User Table current name (users.name) > fallback 'Unknown User'.
    // This prevents stale author names when a user later updates their profile.
    // Users that are inactive/withdrawn are treated the same as deleted users.
    const rows = await this.db
      .select({
        id: comments.id,
        content: comments.content,
        author: comments.author,
        authorUserId: comments.authorUserId,
        pageId: comments.pageId,
        parentId: comments.parentId,
        createdAt: comments.createdAt,
        updatedAt: comments.updatedAt,
        _resolvedName: users.name,
        _resolvedIsActive: users.isActive,
      })
      .from(comments)
      .leftJoin(users, eq(comments.authorUserId, users.id))
      .where(eq(comments.pageId, pageId))
      .orderBy(asc(comments.createdAt));

    return rows.map((row: (typeof rows)[number]) => ({
      id: row.id,
      content: row.content,
      // Treat inactive/withdrawn users the same as deleted users: return 'Unknown User'.
      // - row._resolvedName == null  → user account deleted (ON DELETE SET NULL)
      // - row._resolvedIsActive === false → user account deactivated/withdrawn
      author:
        row._resolvedName == null || row._resolvedIsActive === false
          ? 'Unknown User'
          : row._resolvedName,
      authorUserId: row.authorUserId,
      pageId: row.pageId,
      parentId: row.parentId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async getComment(id: number): Promise<Comment | undefined> {
    const result = await this.db.select().from(comments).where(eq(comments.id, id));
    return result[0];
  }

  async createComment(comment: InsertComment): Promise<Comment> {
    const result = await this.db.insert(comments).values(comment).returning();
    return result[0];
  }

  async updateComment(id: number, comment: UpdateComment): Promise<Comment | undefined> {
    const result = await this.db
      .update(comments)
      .set(comment)
      .where(eq(comments.id, id))
      .returning();
    return result[0];
  }

  async deleteComment(id: number): Promise<boolean> {
    const result = await this.db.delete(comments).where(eq(comments.id, id)).returning();
    return result.length > 0;
  }

  async getTeams(): Promise<Team[]> {
    return this.db.select().from(teams).where(eq(teams.isActive, true)).orderBy(asc(teams.order));
  }

  async getTeam(id: number): Promise<Team | undefined> {
    const result = await this.db.select().from(teams).where(eq(teams.id, id));
    return result[0];
  }

  async getTeamByName(name: string): Promise<Team | undefined> {
    const result = await this.db.select().from(teams).where(eq(teams.name, name));
    return result[0];
  }

  async createTeam(team: InsertTeam): Promise<Team> {
    const teamValues = { ...team };
    if (teamValues.password) {
      teamValues.password = await bcrypt.hash(teamValues.password, 10);
    }
    const result = await this.db.insert(teams).values(teamValues).returning();
    return result[0];
  }

  async createTeamWithOwner(team: InsertTeam, creatorUserId: number): Promise<Team> {
    const teamValues = { ...team };
    if (teamValues.password) {
      teamValues.password = await bcrypt.hash(teamValues.password, 10);
    }

    return this.db.transaction(async (tx: any) => {
      const teamResult = await tx.insert(teams).values(teamValues).returning();
      const createdTeam = teamResult[0];
      await tx.insert(teamMembers).values({
        teamId: createdTeam.id,
        userId: creatorUserId,
        role: 'owner',
        invitedBy: null,
      });
      return createdTeam;
    });
  }

  async updateTeam(id: number, team: UpdateTeam): Promise<Team | undefined> {
    if (team.password) {
      team.password = await bcrypt.hash(team.password, 10);
    }
    const result = await this.db.update(teams).set(team).where(eq(teams.id, id)).returning();
    return result[0];
  }

  /**
   * Deletes a team unless pages, trashed ones included, still belong to it. Those pages would
   * otherwise lose their team and fall back to the team-less access rules, so they must be moved
   * or deleted first. The wiki_pages.team_id foreign key (ON DELETE RESTRICT) backs this up when
   * a page is added concurrently.
   */
  async deleteTeam(id: number): Promise<'deleted' | 'not-found' | 'has-pages'> {
    const [page] = await this.db
      .select({ id: wikiPages.id })
      .from(wikiPages)
      .where(eq(wikiPages.teamId, id))
      .limit(1);
    if (page) return 'has-pages';

    try {
      const result = await this.db.delete(teams).where(eq(teams.id, id)).returning();
      return result.length > 0 ? 'deleted' : 'not-found';
    } catch (error) {
      if (isTeamPagesForeignKeyViolation(error)) return 'has-pages';
      throw error;
    }
  }

  async verifyTeamPassword(teamName: string, password: string): Promise<boolean> {
    const team = await this.getTeamByName(teamName);
    if (!team || !team.password) return false;
    return bcrypt.compare(password, team.password);
  }

  /**
   * Get all team IDs that a user belongs to.
   * First checks the team_members RBAC table; falls back to legacy members table.
   */
  async getUserTeamIds(userId: number): Promise<number[]> {
    // Primary: team_members table (RBAC)
    const tmRecords = await this.db
      .select({ teamId: teamMembers.teamId })
      .from(teamMembers)
      .where(eq(teamMembers.userId, userId));

    if (tmRecords.length > 0) {
      return tmRecords.map((r: { teamId: number }) => r.teamId);
    }

    // Fallback: legacy members table (email-based matching)
    const user = await this.db.select().from(users).where(eq(users.id, userId));
    if (user.length === 0) return [];

    const userEmail = user[0].email;

    const memberRecords = await this.db
      .select({ teamId: members.teamId })
      .from(members)
      .where(and(eq(members.email, userEmail), eq(members.isActive, true)));

    return memberRecords
      .map((m: { teamId: number | null }) => m.teamId)
      .filter((id: number | null): id is number => id !== null);
  }

  /**
   * Get user's role in a specific team from team_members table.
   * Returns the role ('owner' | 'admin' | 'member') or null if not a member.
   */
  async getUserTeamRole(userId: number, teamId: number): Promise<TeamRole | null> {
    const record = await this.db
      .select({ role: teamMembers.role })
      .from(teamMembers)
      .where(and(eq(teamMembers.userId, userId), eq(teamMembers.teamId, teamId)));

    if (record.length > 0) {
      return record[0].role as TeamRole;
    }

    // Fallback: if user is in legacy members table, treat as 'member' role
    const user = await this.db.select().from(users).where(eq(users.id, userId));
    if (user.length === 0) return null;

    const memberRecord = await this.db
      .select({ id: members.id })
      .from(members)
      .where(
        and(
          eq(members.email, user[0].email),
          eq(members.teamId, teamId),
          eq(members.isActive, true)
        )
      );

    return memberRecord.length > 0 ? 'member' : null;
  }

  /**
   * Add a user to a team with a specific role.
   */
  async addTeamMember(
    teamId: number,
    userId: number,
    role: TeamRole = 'member',
    invitedBy?: number
  ): Promise<TeamMember> {
    const result = await this.db
      .insert(teamMembers)
      .values({ teamId, userId, role, invitedBy: invitedBy ?? null })
      .onConflictDoUpdate({
        target: [teamMembers.teamId, teamMembers.userId],
        set: { role },
      })
      .returning();
    return result[0];
  }

  async getMembers(teamId?: number): Promise<Member[]> {
    const query = this.db.select().from(members);
    const conditions = [eq(members.isActive, true)];
    if (teamId) {
      conditions.push(eq(members.teamId, teamId));
    }
    return query.where(and(...conditions));
  }

  async getMember(id: number): Promise<Member | undefined> {
    const result = await this.db.select().from(members).where(eq(members.id, id));
    return result[0];
  }

  async getMemberByEmail(email: string): Promise<Member | undefined> {
    const result = await this.db.select().from(members).where(eq(members.email, email));
    return result[0];
  }

  async createMember(member: InsertMember): Promise<Member> {
    const result = await this.db.insert(members).values(member).returning();
    return result[0];
  }

  async updateMember(id: number, member: UpdateMember): Promise<Member | undefined> {
    const result = await this.db.update(members).set(member).where(eq(members.id, id)).returning();
    return result[0];
  }

  async deleteMember(id: number): Promise<boolean> {
    const result = await this.db.delete(members).where(eq(members.id, id)).returning();
    return result.length > 0;
  }

  async getTeamProgressStats(teamId: string): Promise<any[]> {
    return [];
  }

  async getMemberProgressStats(memberId: number): Promise<any | undefined> {
    return undefined;
  }

  async updateProgressStats(
    teamId: string,
    memberId: number | null,
    type: 'page' | 'comment' | 'task'
  ): Promise<void> {}

  async getDashboardOverview(teamIds: number[]): Promise<any> {
    if (teamIds.length === 0) {
      return {
        totalPages: 0,
        totalComments: 0,
        totalMembers: 0,
        totalTasks: 0,
        activeTeams: 0,
        recentActivity: [],
        teamStats: [],
      };
    }

    const teamIdStrings = teamIds.map(String);
    const [pageCountResult, commentCountResult, memberCountResult, taskCountResult, teamRecords] =
      await Promise.all([
        this.db
          .select({ count: sql`count(*)` })
          .from(wikiPages)
          .where(inArray(wikiPages.teamId, teamIds)),
        this.db
          .select({ count: sql`count(*)` })
          .from(comments)
          .innerJoin(wikiPages, eq(comments.pageId, wikiPages.id))
          .where(inArray(wikiPages.teamId, teamIds)),
        this.db
          .select({ count: sql`count(*)` })
          .from(members)
          .where(inArray(members.teamId, teamIds)),
        this.db
          .select({ count: sql`count(*)` })
          .from(tasks)
          .where(inArray(tasks.teamId, teamIdStrings)),
        this.db
          .select({ id: teams.id, name: teams.name, displayName: teams.displayName })
          .from(teams)
          .where(inArray(teams.id, teamIds)),
      ]);

    const teamStats = await Promise.all(
      teamRecords.map(async (team: { id: number; name: string; displayName: string }) => {
        const [pagesResult, commentsResult, tasksResult] = await Promise.all([
          this.db
            .select({ count: sql`count(*)` })
            .from(wikiPages)
            .where(and(eq(wikiPages.teamId, team.id), isNull(wikiPages.deletedAt))),
          this.db
            .select({ count: sql`count(*)` })
            .from(comments)
            .innerJoin(wikiPages, eq(comments.pageId, wikiPages.id))
            .where(and(eq(wikiPages.teamId, team.id), isNull(wikiPages.deletedAt))),
          this.db
            .select({ count: sql`count(*)` })
            .from(tasks)
            .where(eq(tasks.teamId, String(team.id))),
        ]);
        return {
          teamId: team.id,
          name: team.displayName || team.name,
          pages: Number(pagesResult[0].count),
          comments: Number(commentsResult[0].count),
          tasks: Number(tasksResult[0].count),
        };
      })
    );

    return {
      totalPages: Number(pageCountResult[0].count),
      totalComments: Number(commentCountResult[0].count),
      totalMembers: Number(memberCountResult[0].count),
      totalTasks: Number(taskCountResult[0].count),
      activeTeams: teamRecords.length,
      recentActivity: [],
      teamStats,
    };
  }

  async getTasks(teamId?: string, status?: string): Promise<Task[]> {
    const conditions = [];
    if (teamId) conditions.push(eq(tasks.teamId, teamId));
    if (status) conditions.push(eq(tasks.status, status));
    const query = this.db.select().from(tasks);
    if (conditions.length > 0) {
      query.where(and(...conditions));
    }
    return query.orderBy(desc(tasks.createdAt));
  }

  async getTask(id: number): Promise<Task | undefined> {
    const result = await this.db.select().from(tasks).where(eq(tasks.id, id));
    return result[0];
  }

  async createTask(task: InsertTask): Promise<Task> {
    const result = await this.db.insert(tasks).values(task).returning();
    return result[0];
  }

  async updateTask(id: number, task: UpdateTask): Promise<Task | undefined> {
    const result = await this.db.update(tasks).set(task).where(eq(tasks.id, id)).returning();
    return result[0];
  }

  async deleteTask(id: number): Promise<boolean> {
    const result = await this.db.delete(tasks).where(eq(tasks.id, id)).returning();
    return result.length > 0;
  }

  async updateTaskProgress(id: number, progress: number): Promise<Task | undefined> {
    const result = await this.db
      .update(tasks)
      .set({ progress, updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning();
    return result[0];
  }

  async getNotifications(recipientId: number): Promise<Notification[]> {
    return this.db
      .select()
      .from(notifications)
      .where(eq(notifications.recipientId, recipientId))
      .orderBy(desc(notifications.createdAt));
  }

  async getNotification(id: number): Promise<Notification | undefined> {
    const result = await this.db.select().from(notifications).where(eq(notifications.id, id));
    return result[0];
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const result = await this.db.insert(notifications).values(notification).returning();
    return result[0];
  }

  async updateNotification(
    id: number,
    notification: UpdateNotification
  ): Promise<Notification | undefined> {
    const result = await this.db
      .update(notifications)
      .set(notification)
      .where(eq(notifications.id, id))
      .returning();
    return result[0];
  }

  async deleteNotification(id: number): Promise<boolean> {
    const result = await this.db.delete(notifications).where(eq(notifications.id, id)).returning();
    return result.length > 0;
  }

  async markNotificationAsRead(id: number): Promise<Notification | undefined> {
    const result = await this.db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, id))
      .returning();
    return result[0];
  }

  async markAllNotificationsAsRead(recipientId: number): Promise<void> {
    await this.db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.recipientId, recipientId));
  }

  async getUnreadNotificationCount(recipientId: number): Promise<number> {
    const result = await this.db
      .select({ count: sql`count(*)` })
      .from(notifications)
      .where(and(eq(notifications.recipientId, recipientId), eq(notifications.isRead, false)));
    return Number(result[0].count);
  }

  async getTemplateCategories(): Promise<TemplateCategory[]> {
    return this.db.select().from(templateCategories).orderBy(asc(templateCategories.order));
  }

  async getTemplateCategory(id: number): Promise<TemplateCategory | undefined> {
    const result = await this.db
      .select()
      .from(templateCategories)
      .where(eq(templateCategories.id, id));
    return result[0];
  }

  async createTemplateCategory(category: InsertTemplateCategory): Promise<TemplateCategory> {
    const result = await this.db.insert(templateCategories).values(category).returning();
    return result[0];
  }

  async updateTemplateCategory(
    id: number,
    category: UpdateTemplateCategory
  ): Promise<TemplateCategory | undefined> {
    const result = await this.db
      .update(templateCategories)
      .set(category)
      .where(eq(templateCategories.id, id))
      .returning();
    return result[0];
  }

  async deleteTemplateCategory(id: number): Promise<boolean> {
    const result = await this.db
      .delete(templateCategories)
      .where(eq(templateCategories.id, id))
      .returning();
    return result.length > 0;
  }

  async getTemplates(categoryId?: number): Promise<Template[]> {
    const query = this.db.select().from(templates);
    if (categoryId) {
      query.where(eq(templates.categoryId, categoryId));
    }
    return query.orderBy(desc(templates.usageCount));
  }

  async getTemplate(id: number): Promise<Template | undefined> {
    const result = await this.db.select().from(templates).where(eq(templates.id, id));
    return result[0];
  }

  async createTemplate(template: InsertTemplate): Promise<Template> {
    const result = await this.db.insert(templates).values(template).returning();
    return result[0];
  }

  async updateTemplate(id: number, template: UpdateTemplate): Promise<Template | undefined> {
    const result = await this.db
      .update(templates)
      .set(template)
      .where(eq(templates.id, id))
      .returning();
    return result[0];
  }

  async deleteTemplate(id: number): Promise<boolean> {
    const result = await this.db.delete(templates).where(eq(templates.id, id)).returning();
    return result.length > 0;
  }

  async incrementTemplateUsage(id: number): Promise<boolean> {
    const result = await this.db
      .update(templates)
      .set({ usageCount: sql`${templates.usageCount} + 1` })
      .where(eq(templates.id, id))
      .returning();
    return result.length > 0;
  }

  // ==================== Saved Views ====================

  async getSavedViews(params: {
    teamId?: number;
    createdBy?: number;
    entityType?: string;
    isPublic?: boolean;
  }): Promise<SavedView[]> {
    const conditions = [];

    if (params.teamId) {
      conditions.push(eq(savedViews.teamId, params.teamId));
    }
    if (params.createdBy) {
      conditions.push(eq(savedViews.createdBy, params.createdBy));
    }
    if (params.entityType) {
      conditions.push(eq(savedViews.entityType, params.entityType));
    }
    if (params.isPublic !== undefined) {
      conditions.push(eq(savedViews.isPublic, params.isPublic));
    }

    const query = this.db.select().from(savedViews).orderBy(desc(savedViews.updatedAt));

    if (conditions.length > 0) {
      query.where(and(...conditions));
    }

    return await query;
  }

  async getSavedView(id: number): Promise<SavedView | undefined> {
    const result = await this.db.select().from(savedViews).where(eq(savedViews.id, id));
    return result[0];
  }

  async createSavedView(view: InsertSavedView): Promise<SavedView> {
    const result = await this.db.insert(savedViews).values(view).returning();
    return result[0];
  }

  async updateSavedView(id: number, view: UpdateSavedView): Promise<SavedView | undefined> {
    const result = await this.db
      .update(savedViews)
      .set({ ...view, updatedAt: sql`NOW()` })
      .where(eq(savedViews.id, id))
      .returning();
    return result[0];
  }

  async deleteSavedView(id: number): Promise<boolean> {
    const result = await this.db.delete(savedViews).where(eq(savedViews.id, id)).returning();
    return result.length > 0;
  }

  async setDefaultView(id: number, teamId: number, entityType: string): Promise<void> {
    // Unset any existing default for this team and entity type
    await this.db
      .update(savedViews)
      .set({ isDefault: false })
      .where(and(eq(savedViews.teamId, teamId), eq(savedViews.entityType, entityType)));

    // Set this view as default
    await this.db.update(savedViews).set({ isDefault: true }).where(eq(savedViews.id, id));
  }

  // ==================== Workflow Methods ====================

  async getWorkflows(teamId?: number): Promise<Workflow[]> {
    if (teamId) {
      return await this.db
        .select()
        .from(workflows)
        .where(eq(workflows.teamId, teamId))
        .orderBy(desc(workflows.createdAt));
    }
    return await this.db.select().from(workflows).orderBy(desc(workflows.createdAt));
  }

  async getWorkflow(id: number): Promise<Workflow | undefined> {
    const result = await this.db.select().from(workflows).where(eq(workflows.id, id));
    return result[0];
  }

  async getActiveWorkflowsByTrigger(
    triggerType: TriggerType,
    teamId?: number
  ): Promise<Workflow[]> {
    const conditions = [eq(workflows.isActive, true)];
    if (teamId) {
      conditions.push(eq(workflows.teamId, teamId));
    }

    const allWorkflows = await this.db
      .select()
      .from(workflows)
      .where(and(...conditions));

    // Filter by trigger type (since JSONB query is complex, filter in memory)
    return allWorkflows.filter((w: Workflow) => {
      const trigger = w.trigger as any;
      return trigger?.type === triggerType;
    });
  }

  async createWorkflow(workflow: InsertWorkflow): Promise<Workflow> {
    const result = await this.db.insert(workflows).values(workflow).returning();
    return result[0];
  }

  async updateWorkflow(id: number, workflow: UpdateWorkflow): Promise<Workflow | undefined> {
    const result = await this.db
      .update(workflows)
      .set({ ...workflow, updatedAt: sql`NOW()` })
      .where(eq(workflows.id, id))
      .returning();
    return result[0];
  }

  async deleteWorkflow(id: number): Promise<boolean> {
    const result = await this.db.delete(workflows).where(eq(workflows.id, id)).returning();
    return result.length > 0;
  }

  async toggleWorkflow(id: number, isActive: boolean): Promise<Workflow | undefined> {
    const result = await this.db
      .update(workflows)
      .set({ isActive, updatedAt: sql`NOW()` })
      .where(eq(workflows.id, id))
      .returning();
    return result[0];
  }

  // Workflow Runs
  async createWorkflowRun(run: {
    workflowId: number;
    status: string;
    triggerData: any;
  }): Promise<number> {
    const result = await this.db.insert(workflowRuns).values(run).returning();
    return result[0].id;
  }

  async getWorkflowRun(id: number): Promise<WorkflowRun> {
    const result = await this.db.select().from(workflowRuns).where(eq(workflowRuns.id, id));
    return result[0];
  }

  async updateWorkflowRun(
    id: number,
    update: {
      status?: string;
      results?: any;
      error?: string;
      completedAt?: Date;
    }
  ): Promise<WorkflowRun | undefined> {
    const result = await this.db
      .update(workflowRuns)
      .set(update)
      .where(eq(workflowRuns.id, id))
      .returning();
    return result[0];
  }

  async getWorkflowRuns(workflowId: number, limit = 50): Promise<WorkflowRun[]> {
    return await this.db
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.workflowId, workflowId))
      .orderBy(desc(workflowRuns.startedAt))
      .limit(limit);
  }

  // ==================== Page Permissions ====================

  /**
   * Check if a user has the required permission level for a page
   * Permission hierarchy: owner > editor > commenter > viewer
   */
  async checkPagePermission(
    userId: number | undefined,
    pageId: number,
    requiredPermission: PermissionLevel
  ): Promise<boolean> {
    // Define permission hierarchy
    const permissionLevels: Record<PermissionLevel, number> = {
      viewer: 1,
      commenter: 2,
      editor: 3,
      owner: 4,
    };

    const requiredLevel = permissionLevels[requiredPermission];

    // Get the page to check author (implicit owner)
    const page = await this.db.select().from(wikiPages).where(eq(wikiPages.id, pageId));

    // Get all permissions for this page
    const permissions = await this.db
      .select()
      .from(pagePermissions)
      .where(eq(pagePermissions.pageId, pageId));

    const pageTeamId = page.length > 0 && page[0].teamId ? Number(page[0].teamId) : null;

    // Pages without a teamId and without explicit permissions are legacy open-access pages.
    // Team pages without explicit permissions follow the team rules below, like any team page.
    if (permissions.length === 0 && pageTeamId === null) {
      return true;
    }

    // Check public permissions first
    const publicPermission = permissions.find((p: PagePermission) => p.entityType === 'public');
    if (
      publicPermission &&
      permissionLevels[publicPermission.permission as PermissionLevel] >= requiredLevel
    ) {
      return true;
    }

    // If no user ID, only public access is allowed
    if (!userId) {
      return false;
    }

    const userTeamIds = await this.getUserTeamIds(userId);
    const isPageTeamMember = pageTeamId !== null && userTeamIds.includes(pageTeamId);

    // Current members of the page's team can read it
    if (isPageTeamMember && requiredLevel <= permissionLevels.viewer) {
      return true;
    }

    // Current team owners and admins manage every page of their team, so a page never ends up
    // unmanageable when its own owner leaves the team
    if (isPageTeamMember && (await this.isTeamManager(userId, pageTeamId!))) {
      return true;
    }

    // On a team page, authorship and user-specific permissions only count while the user is a
    // member of that team, so removing a member revokes them without deleting any rows
    if (pageTeamId === null || isPageTeamMember) {
      // Check if user is the page author (implicit owner)
      if (page.length > 0) {
        const user = await this.db.select().from(users).where(eq(users.id, userId));
        if (user.length > 0 && page[0].author === user[0].email) {
          return true;
        }
      }

      // Check user-specific permissions
      const userPermission = permissions.find(
        (p: PagePermission) => p.entityType === 'user' && p.entityId === userId
      );
      if (
        userPermission &&
        permissionLevels[userPermission.permission as PermissionLevel] >= requiredLevel
      ) {
        return true;
      }
    }

    // Check team permissions (if user belongs to a team)
    if (userTeamIds.length > 0) {
      const teamPermission = permissions.find(
        (p: PagePermission) =>
          p.entityType === 'team' && p.entityId !== null && userTeamIds.includes(p.entityId)
      );
      if (
        teamPermission &&
        permissionLevels[teamPermission.permission as PermissionLevel] >= requiredLevel
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get all permissions for a page
   */
  async getPagePermissions(pageId: number): Promise<PagePermission[]> {
    return await this.db.select().from(pagePermissions).where(eq(pagePermissions.pageId, pageId));
  }

  /** Whether the user is a current owner or admin of the team (see checkPagePermission). */
  private async isTeamManager(userId: number, teamId: number): Promise<boolean> {
    const role = await this.getUserTeamRole(userId, teamId);
    return role === 'owner' || role === 'admin';
  }

  /**
   * Get a user's permission level for a page (returns highest level).
   * Like checkPagePermission, a user's own permissions on a team page lapse while they are not
   * a member of that team, and current team owners and admins hold owner on their team's pages.
   */
  async getUserPagePermission(userId: number, pageId: number): Promise<PermissionLevel | null> {
    const [page] = await this.db
      .select({ teamId: wikiPages.teamId })
      .from(wikiPages)
      .where(eq(wikiPages.id, pageId));
    if (page?.teamId) {
      const teamId = Number(page.teamId);
      if (!(await this.getUserTeamIds(userId)).includes(teamId)) return null;
      if (await this.isTeamManager(userId, teamId)) return 'owner';
    }

    const permissions = await this.db
      .select()
      .from(pagePermissions)
      .where(
        and(
          eq(pagePermissions.pageId, pageId),
          eq(pagePermissions.entityType, 'user'),
          eq(pagePermissions.entityId, userId)
        )
      );

    if (permissions.length === 0) {
      return null;
    }

    // Return highest permission level
    const permissionLevels: Record<PermissionLevel, number> = {
      viewer: 1,
      commenter: 2,
      editor: 3,
      owner: 4,
    };

    const highest = permissions.reduce((max: PermissionLevel, p: PagePermission) => {
      const level = permissionLevels[p.permission as PermissionLevel];
      const maxLevel = permissionLevels[max as PermissionLevel];
      return level > maxLevel ? (p.permission as PermissionLevel) : max;
    }, 'viewer' as PermissionLevel);

    return highest;
  }

  /**
   * Add a permission for a page
   */
  async addPagePermission(permission: InsertPagePermission): Promise<PagePermission> {
    // Check if permission already exists
    const existing = await this.db
      .select()
      .from(pagePermissions)
      .where(
        and(
          eq(pagePermissions.pageId, permission.pageId),
          eq(pagePermissions.entityType, permission.entityType),
          permission.entityId
            ? eq(pagePermissions.entityId, permission.entityId)
            : sql`entity_id IS NULL`
        )
      );

    // Update if exists, insert if new
    if (existing.length > 0) {
      const result = await this.db
        .update(pagePermissions)
        .set({
          permission: permission.permission,
          updatedAt: new Date(),
        })
        .where(eq(pagePermissions.id, existing[0].id))
        .returning();
      return result[0];
    }

    const result = await this.db.insert(pagePermissions).values(permission).returning();
    return result[0];
  }

  /**
   * Remove a permission from a page. A permission that belongs to another page is left alone.
   */
  async removePagePermission(pageId: number, permissionId: number): Promise<boolean> {
    const result = await this.db
      .delete(pagePermissions)
      .where(and(eq(pagePermissions.id, permissionId), eq(pagePermissions.pageId, pageId)))
      .returning();
    return result.length > 0;
  }

  /**
   * Set page owner (creates owner permission if doesn't exist)
   */
  async setPageOwner(pageId: number, userId: number, grantedBy?: number): Promise<PagePermission> {
    return await this.addPagePermission({
      pageId,
      entityType: 'user',
      entityId: userId,
      permission: 'owner',
      grantedBy,
    });
  }

  // ==================== Public Links ====================

  /**
   * Create a public link for a page
   */
  async createPublicLink(link: InsertPublicLink): Promise<PublicLink> {
    const result = await this.db.insert(publicLinks).values(link).returning();
    return result[0];
  }

  /**
   * Get public link by token
   */
  async getPublicLink(token: string): Promise<PublicLink | undefined> {
    const result = await this.db.select().from(publicLinks).where(eq(publicLinks.token, token));
    return result[0];
  }

  /**
   * Get all public links for a page
   */
  async getPagePublicLinks(pageId: number): Promise<PublicLink[]> {
    return await this.db.select().from(publicLinks).where(eq(publicLinks.pageId, pageId));
  }

  /**
   * Delete a public link
   */
  async deletePublicLink(linkId: number): Promise<boolean> {
    const result = await this.db.delete(publicLinks).where(eq(publicLinks.id, linkId)).returning();
    return result.length > 0;
  }

  /**
   * Delete public link by token
   */
  async deletePublicLinkByToken(token: string): Promise<boolean> {
    const result = await this.db
      .delete(publicLinks)
      .where(eq(publicLinks.token, token))
      .returning();
    return result.length > 0;
  }

  /**
   * Verify public link (check expiration and update access stats)
   */
  async verifyPublicLink(
    token: string,
    password?: string
  ): Promise<{
    valid: boolean;
    link?: PublicLink;
    error?: string;
  }> {
    const link = await this.getPublicLink(token);

    if (!link) {
      return { valid: false, error: 'Link not found' };
    }

    // Check expiration
    if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
      return { valid: false, error: 'Link expired' };
    }

    // Check password if required
    if (link.password) {
      if (!password) {
        return { valid: false, error: 'Password required' };
      }
      const match = await bcrypt.compare(password, link.password);
      if (!match) {
        return { valid: false, error: 'Invalid password' };
      }
    }

    // Update access stats
    await this.db
      .update(publicLinks)
      .set({
        lastAccessedAt: new Date(),
        accessCount: sql`${publicLinks.accessCount} + 1`,
      })
      .where(eq(publicLinks.id, link.id));

    return { valid: true, link };
  }

  /**
   * Generate a cryptographically secure random token for public links
   */
  generatePublicLinkToken(): string {
    return crypto.randomBytes(24).toString('base64url');
  }

  // ==================== Database Schema Operations ====================

  async createDatabaseSchema(
    pageId: number,
    userId: number,
    schema: {
      name: string;
      fields: any[];
      primaryDisplay?: string;
    }
  ) {
    const [newSchema] = await this.db
      .insert(databaseSchemas)
      .values({
        pageId,
        createdBy: userId,
        name: schema.name,
        fields: schema.fields,
        primaryDisplay: schema.primaryDisplay,
      })
      .returning();
    return newSchema;
  }

  async getDatabaseSchema(schemaId: number) {
    return await this.db.query.databaseSchemas.findFirst({
      where: eq(databaseSchemas.id, schemaId),
    });
  }

  async updateDatabaseSchema(
    schemaId: number,
    updates: { name?: string; fields?: any[]; primaryDisplay?: string }
  ) {
    const [updated] = await this.db
      .update(databaseSchemas)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(databaseSchemas.id, schemaId))
      .returning();
    return updated;
  }

  async deleteDatabaseSchema(schemaId: number) {
    await this.db.delete(databaseSchemas).where(eq(databaseSchemas.id, schemaId));
  }

  // ==================== Database Row Operations ====================

  async createDatabaseRow(schemaId: number, userId: number, data: Record<string, any>) {
    const [newRow] = await this.db
      .insert(databaseRows)
      .values({
        schemaId,
        createdBy: userId,
        data,
      })
      .returning();
    return newRow;
  }

  async getDatabaseRow(rowId: number) {
    return await this.db.query.databaseRows.findFirst({
      where: eq(databaseRows.id, rowId),
    });
  }

  async getDatabaseRows(schemaId: number) {
    return await this.db.query.databaseRows.findMany({
      where: eq(databaseRows.schemaId, schemaId),
      orderBy: (rows: any, { desc }: any) => [desc(rows.createdAt)],
    });
  }

  async updateDatabaseRow(rowId: number, data: Record<string, any>) {
    const [updated] = await this.db
      .update(databaseRows)
      .set({
        data,
        updatedAt: new Date(),
      })
      .where(eq(databaseRows.id, rowId))
      .returning();
    return updated;
  }

  async deleteDatabaseRow(rowId: number) {
    await this.db.delete(databaseRows).where(eq(databaseRows.id, rowId));
  }

  // ==================== Database Relations Operations ====================

  async addRelation(
    fromSchemaId: number,
    fromRowId: number,
    propertyName: string,
    toSchemaId: number,
    toRowId: number
  ) {
    const [relation] = await this.db
      .insert(databaseRelations)
      .values({
        fromSchemaId,
        fromRowId,
        propertyName,
        toSchemaId,
        toRowId,
      })
      .returning();
    return relation;
  }

  async getRelations(rowId: number, propertyName?: string) {
    const conditions = [eq(databaseRelations.fromRowId, rowId)];
    if (propertyName) {
      conditions.push(eq(databaseRelations.propertyName, propertyName));
    }

    return await this.db.query.databaseRelations.findMany({
      where: and(...conditions),
    });
  }

  async deleteRelation(relationId: number) {
    await this.db.delete(databaseRelations).where(eq(databaseRelations.id, relationId));
  }

  /**
   * Calculate rollup value based on relations
   */
  async calculateRollup(
    rowId: number,
    fieldName: string,
    config: {
      relationField: string;
      targetField: string;
      aggregation: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'unique';
    }
  ) {
    const relations = await this.getRelations(rowId, config.relationField);

    if (relations.length === 0) {
      return config.aggregation === 'count' ? 0 : null;
    }

    // Get related rows data
    const relatedRowIds = relations.map((r: any) => r.toRowId);
    const relatedRows = await this.db.query.databaseRows.findMany({
      where: sql`id = ANY(${relatedRowIds})`,
    });

    const values = relatedRows
      .map((row: any) => row.data[config.targetField])
      .filter((v: any) => v !== null && v !== undefined);

    switch (config.aggregation) {
      case 'count':
        return values.length;
      case 'sum':
        return values.reduce((sum: number, val: any) => sum + Number(val), 0);
      case 'avg':
        return values.length > 0
          ? values.reduce((sum: number, val: any) => sum + Number(val), 0) / values.length
          : null;
      case 'min':
        return values.length > 0 ? Math.min(...values.map(Number)) : null;
      case 'max':
        return values.length > 0 ? Math.max(...values.map(Number)) : null;
      case 'unique':
        return new Set(values).size;
      default:
        return null;
    }
  }

  // ==================== Synced Block Operations ====================

  async createSyncedBlock(originalBlockId: string, userId: number, content: any[]) {
    const [syncedBlock] = await this.db
      .insert(syncedBlocks)
      .values({
        originalBlockId,
        createdBy: userId,
        content,
      })
      .returning();
    return syncedBlock;
  }

  async getSyncedBlock(originalBlockId: string) {
    return await this.db.query.syncedBlocks.findFirst({
      where: eq(syncedBlocks.originalBlockId, originalBlockId),
    });
  }

  async updateSyncedBlockContent(originalBlockId: string, content: any[]) {
    const [updated] = await this.db
      .update(syncedBlocks)
      .set({
        content,
        lastSyncedAt: new Date(),
      })
      .where(eq(syncedBlocks.originalBlockId, originalBlockId))
      .returning();
    return updated;
  }

  async deleteSyncedBlock(originalBlockId: string) {
    await this.db.delete(syncedBlocks).where(eq(syncedBlocks.originalBlockId, originalBlockId));
  }

  /**
   * Add synced block reference
   */
  async addSyncedBlockReference(syncedBlockId: number, pageId: number, blockId: string) {
    const [reference] = await this.db
      .insert(syncedBlockReferences)
      .values({
        syncedBlockId,
        pageId,
        blockId,
      })
      .returning();
    return reference;
  }

  async getSyncedBlockReferences(syncedBlockId: number) {
    return await this.db.query.syncedBlockReferences.findMany({
      where: eq(syncedBlockReferences.syncedBlockId, syncedBlockId),
    });
  }

  async deleteSyncedBlockReference(referenceId: number) {
    await this.db.delete(syncedBlockReferences).where(eq(syncedBlockReferences.id, referenceId));
  }

  /**
   * Get all synced blocks accessible to user
   */
  async getUserSyncedBlocks(userId: number) {
    // Get user info first
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) return [];

    // Get pages where user is author
    const authorPages = await this.db.query.wikiPages.findMany({
      where: eq(wikiPages.author, user.email),
    });

    // Get pages where user has explicit permission
    const permissionedPages = await this.db
      .select({ pageId: pagePermissions.pageId })
      .from(pagePermissions)
      .where(and(eq(pagePermissions.entityType, 'user'), eq(pagePermissions.entityId, userId)));

    // Get pages accessible through team membership
    const userTeamIds = await this.getUserTeamIds(userId);
    let teamPages: { pageId: number }[] = [];
    if (userTeamIds.length > 0) {
      teamPages = await this.db
        .select({ pageId: pagePermissions.pageId })
        .from(pagePermissions)
        .where(
          and(
            eq(pagePermissions.entityType, 'team'),
            sql`${pagePermissions.entityId} = ANY(${userTeamIds})`
          )
        );
    }

    // Combine all accessible page IDs
    const allPageIds = [
      ...authorPages.map((p: any) => p.id),
      ...permissionedPages.map((p: { pageId: number }) => p.pageId),
      ...teamPages.map((p: { pageId: number }) => p.pageId),
    ];
    const pageIds = Array.from(new Set(allPageIds));

    if (pageIds.length === 0) return [];

    const references = await this.db.query.syncedBlockReferences.findMany({
      where: sql`page_id = ANY(${pageIds})`,
    });

    const syncedBlockIds = Array.from(new Set(references.map((r: any) => r.syncedBlockId)));

    const blocks = await this.db.query.syncedBlocks.findMany({
      where: sql`id = ANY(${syncedBlockIds})`,
    });

    // Count references for each block
    return blocks.map((block: any) => ({
      ...block,
      referenceCount: references.filter((r: any) => r.syncedBlockId === block.id).length,
    }));
  }

  // ==================== Daily notes (#111) ====================

  /**
   * Find or create the daily note stored under `note.slug` (see shared/daily-notes.ts). A
   * transaction-scoped advisory lock on the slug serializes concurrent opens, so two tabs
   * opening the same note at once still get one page.
   *
   * A page found under the slug only counts as this scope's note when it belongs to the same
   * team (team scope), or is team-less and owned by the user through the self-granted owner
   * grant this method creates (personal scope). Anything else, such as a page another user
   * created with that slug through the general API, is reported as `conflict` and never
   * returned. A matching note in the trash is reported as `trashed`, not replaced.
   *
   * A new note gets the creator's owner grant like any created page; a team note also grants
   * the team editor access, so every current member can write in the team's shared note.
   */
  async findOrCreateDailyNote(note: {
    slug: string;
    title: string;
    folder: string;
    tags: string[];
    author: string;
    teamId: number | null;
    userId: number;
  }): Promise<
    | { status: 'found'; page: WikiPage }
    | { status: 'created'; page: WikiPage }
    | { status: 'trashed' }
    | { status: 'conflict' }
  > {
    try {
      return await this.db.transaction(async (tx: any) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${note.slug}, 0))`);

        const [existing] = await tx.select().from(wikiPages).where(eq(wikiPages.slug, note.slug));
        if (existing) {
          let isScopeNote = false;
          if (note.teamId !== null) {
            isScopeNote = existing.teamId === note.teamId;
          } else if (existing.teamId === null) {
            const selfGrant = await tx
              .select({ id: pagePermissions.id })
              .from(pagePermissions)
              .where(
                and(
                  eq(pagePermissions.pageId, existing.id),
                  eq(pagePermissions.entityType, 'user'),
                  eq(pagePermissions.entityId, note.userId),
                  eq(pagePermissions.permission, 'owner'),
                  eq(pagePermissions.grantedBy, note.userId)
                )
              );
            isScopeNote = selfGrant.length > 0;
          }
          if (!isScopeNote) return { status: 'conflict' as const };
          if (existing.deletedAt) return { status: 'trashed' as const };
          return { status: 'found' as const, page: existing as WikiPage };
        }

        const [page] = await tx
          .insert(wikiPages)
          .values({
            title: note.title,
            slug: note.slug,
            content: '',
            // One empty paragraph, so the note opens with the caret in its body.
            blocks: [
              {
                id: `block_${note.slug}`,
                type: 'paragraph',
                content: '',
                properties: {},
                order: 0,
                children: [],
              },
            ],
            folder: note.folder,
            tags: note.tags,
            author: note.author,
            teamId: note.teamId,
          })
          .returning();
        const grants: InsertPagePermission[] = [
          {
            pageId: page.id,
            entityType: 'user',
            entityId: note.userId,
            permission: 'owner',
            grantedBy: note.userId,
          },
        ];
        if (note.teamId !== null) {
          grants.push({
            pageId: page.id,
            entityType: 'team',
            entityId: note.teamId,
            permission: 'editor',
            grantedBy: note.userId,
          });
        }
        await tx.insert(pagePermissions).values(grants);
        return { status: 'created' as const, page: page as WikiPage };
      });
    } catch (error) {
      // A page created through the general API took the slug between the lookup and the insert.
      if (isSlugUniqueViolation(error)) return { status: 'conflict' };
      throw error;
    }
  }
}

// Export singleton instance with DI support for testing
let storageInstance: DBStorage | null = null;

/**
 * Set the storage instance (for dependency injection / testing).
 * Pass `null` to reset back to lazy real-DB initialization.
 */
export function setStorage(instance: DBStorage | null): void {
  storageInstance = instance;
}

export function getStorage(): DBStorage {
  if (!storageInstance) {
    storageInstance = new DBStorage();
  }
  return storageInstance;
}

/** Storage accessor exported for convenience. Tests should mock this module. */
export const storage = undefined as unknown as DBStorage;
