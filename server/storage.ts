import crypto from 'crypto';
import {
  wikiPages,
  pageLinks,
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
  type DatabaseSchema,
  type DatabaseRow,
  type DatabaseRelation,
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
} from '../shared/schema.js';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, like, and, or, sql, desc, asc, isNull, inArray, type SQL } from 'drizzle-orm';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import type { RetrievedPageRow } from './services/retrieval.js';
import type { PageTreeRow } from './services/page-tree.js';
import { MAX_INDEXED_LINKS, extractPageLinkIds, hasPageLinks } from '../shared/page-links.js';
import { isReservedDailyNoteSlug } from '../shared/daily-notes.js';
import {
  DATABASE_LIMITS,
  presentValues,
  type DatabaseCellValue,
  type DatabaseField,
  type DatabaseRowData,
  type FieldPlan,
} from '../shared/inline-database.js';
import type { VaultExportRow } from './services/vault-export.js';

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

const MAX_SLUG_INSERT_ATTEMPTS = 100;
/** Ids per query when resolving many link targets (`resolveReadablePageLinks`). */
const RESOLVE_LINKS_BATCH = 1000;

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

    // A daily note's slug (#111) is only created by findOrCreateDailyNote; any other create
    // starts from the next candidate, as it would after a slug conflict.
    const firstAttempt = isReservedDailyNoteSlug(page.slug) ? 1 : 0;
    for (let attempt = firstAttempt; attempt < MAX_SLUG_INSERT_ATTEMPTS; attempt += 1) {
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

    // A new page has no link rows yet, so only content with links needs indexing.
    if (hasPageLinks(createdPage.content)) {
      await this.replacePageLinks(createdPage.id, createdPage.content);
    }
    return createdPage;
  }

  async updateWikiPage(id: number, page: UpdateWikiPage): Promise<WikiPage | undefined> {
    // Only the daily-note route gives out daily note slugs (#111).
    if (page.slug !== undefined && isReservedDailyNoteSlug(page.slug)) {
      throw new Error('This slug is reserved for daily notes');
    }
    if (page.content === undefined) {
      const result = await this.db
        .update(wikiPages)
        .set(page)
        .where(eq(wikiPages.id, id))
        .returning();
      return result[0];
    }
    // Every content write (REST, autosave, Yjs, restore) passes through here. The content and
    // its link index change in one transaction: the row lock taken by the UPDATE orders
    // concurrent saves of the same page, so the index always matches the content that won.
    return this.db.transaction(async (tx: any) => {
      const result = await tx.update(wikiPages).set(page).where(eq(wikiPages.id, id)).returning();
      if (result[0]) await this.writePageLinks(tx, id, result[0].content);
      return result[0];
    });
  }

  /**
   * Keep page_links in step with a page's content (issue #103 E6): the targets of its
   * `[[page:<id>]]` tokens that exist, other than itself. Unknown ids are skipped, not refused:
   * a token to a page that is gone still renders, as an inaccessible link.
   */
  async replacePageLinks(sourcePageId: number, content: string | null | undefined): Promise<void> {
    await this.db.transaction((tx: any) => this.writePageLinks(tx, sourcePageId, content));
  }

  /**
   * Rewrite a page's link rows inside the caller's transaction, in a savepoint: if the index
   * cannot be written, the content still saves and the error is logged (a stale index only
   * affects backlinks until the next save).
   */
  private async writePageLinks(
    tx: any,
    sourcePageId: number,
    content: string | null | undefined
  ): Promise<void> {
    const targets = extractPageLinkIds(content).filter((id) => id !== sourcePageId);
    try {
      await tx.transaction(async (savepoint: any) => {
        await savepoint.execute(sql`DELETE FROM page_links WHERE source_page_id = ${sourcePageId}`);
        if (targets.length > 0) {
          await savepoint.execute(sql`
            INSERT INTO page_links (source_page_id, target_page_id)
            SELECT ${sourcePageId}, id FROM wiki_pages
             WHERE id IN (${sql.join(
               targets.map((target) => sql`${target}`),
               sql`, `
             )})
            ON CONFLICT DO NOTHING`);
        }
      });
    } catch (error) {
      console.error('Failed to update page links:', (error as Error)?.message);
    }
  }

  /** Pages linking to `targetPageId` that the viewer may list, live ones only. */
  async getReadableBacklinks(
    userId: number | undefined,
    targetPageId: number
  ): Promise<Array<{ id: number; title: string; slug: string; icon: string | null }>> {
    const viewer = await this.getPageViewer(userId);
    return this.db
      .select({
        id: wikiPages.id,
        title: wikiPages.title,
        slug: wikiPages.slug,
        icon: wikiPages.icon,
      })
      .from(pageLinks)
      .innerJoin(wikiPages, eq(pageLinks.sourcePageId, wikiPages.id))
      .where(
        and(
          eq(pageLinks.targetPageId, targetPageId),
          isNull(wikiPages.deletedAt),
          this.listableBy(viewer)
        )
      )
      .orderBy(asc(wikiPages.title), asc(wikiPages.id))
      .limit(200);
  }

  /**
   * Titles of the pages among `ids` that are live and readable by the viewer, for exports that
   * write links as titles (#113 vault and single-page export). An id missing from the result is
   * deleted, unknown or unreadable; callers must not tell those apart. These are pages asked for
   * by id, so the rule is GET /api/pages/:id's (`readableBy`, like the link preview), not the
   * workspace listing scope.
   */
  async resolveReadablePageLinks(
    viewer: PageViewer,
    ids: number[]
  ): Promise<Array<{ id: number; title: string; slug: string; icon: string | null }>> {
    const unique = Array.from(new Set(ids));
    const found: Array<{ id: number; title: string; slug: string; icon: string | null }> = [];
    // Batches keep every query far below Postgres' bind-parameter limit.
    for (let at = 0; at < unique.length; at += RESOLVE_LINKS_BATCH) {
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
            inArray(wikiPages.id, unique.slice(at, at + RESOLVE_LINKS_BATCH)),
            isNull(wikiPages.deletedAt),
            this.readableBy(viewer)
          )
        );
      for (const row of rows) found.push(row);
    }
    return found;
  }

  /**
   * Link picker and quick switcher results (issue #103 E6, #111): live pages the viewer may list
   * whose title contains `query`, in one team or among personal pages. An exact title comes
   * first, then titles starting with the query, then the most recently updated, so the switcher
   * always sees an existing page of the typed name before it offers to create one.
   */
  async searchLinkTargets(
    userId: number | undefined,
    scope: { teamId?: number; personalOnly?: boolean },
    query: string,
    limit = 20
  ): Promise<
    Array<{ id: number; title: string; slug: string; icon: string | null; updatedAt: Date }>
  > {
    const viewer = await this.getPageViewer(userId);
    const conditions: SQL[] = [isNull(wikiPages.deletedAt), this.listableBy(viewer)];
    if (scope.teamId !== undefined) conditions.push(eq(wikiPages.teamId, scope.teamId));
    if (scope.personalOnly) conditions.push(isNull(wikiPages.teamId));
    const q = query.trim();
    const order: SQL[] = [];
    if (q) {
      // LIKE wildcards in the query match literally.
      const escaped = q.replace(/[\\%_]/g, (c) => `\\${c}`);
      conditions.push(sql`${wikiPages.title} ILIKE ${'%' + escaped + '%'}`);
      const lowered = q.toLowerCase();
      const loweredEscaped = lowered.replace(/[\\%_]/g, (c) => `\\${c}`);
      order.push(sql`CASE WHEN lower(${wikiPages.title}) = ${lowered} THEN 0
        WHEN lower(${wikiPages.title}) LIKE ${loweredEscaped + '%'} THEN 1 ELSE 2 END`);
    }
    return this.db
      .select({
        id: wikiPages.id,
        title: wikiPages.title,
        slug: wikiPages.slug,
        icon: wikiPages.icon,
        updatedAt: wikiPages.updatedAt,
      })
      .from(wikiPages)
      .where(and(...conditions))
      .orderBy(...order, desc(wikiPages.updatedAt))
      .limit(Math.min(Math.max(limit, 1), 50));
  }

  async deleteWikiPage(id: number): Promise<boolean> {
    // Soft delete: set deletedAt timestamp
    const result = await this.db
      .update(wikiPages)
      .set({ deletedAt: new Date() })
      .where(and(eq(wikiPages.id, id), isNull(wikiPages.deletedAt)))
      .returning();
    return result.length > 0;
  }

  /** Hard delete, only for a page that is already in the trash (soft-deleted). */
  async permanentlyDeleteWikiPage(id: number): Promise<boolean> {
    const result = await this.db
      .delete(wikiPages)
      .where(and(eq(wikiPages.id, id), sql`${wikiPages.deletedAt} IS NOT NULL`))
      .returning();
    return result.length > 0;
  }

  async restoreWikiPage(id: number): Promise<WikiPage | undefined> {
    const result = await this.db
      .update(wikiPages)
      .set({ deletedAt: null })
      .where(eq(wikiPages.id, id))
      .returning();
    return result[0];
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
   * `listableBy` for read paths outside this class (the knowledge graph, local graph, unlinked
   * mentions and daily notes, #111): every page such a path lists must satisfy it.
   */
  readablePageCondition(viewer: PageViewer): SQL {
    return this.listableBy(viewer);
  }

  /**
   * Live pages of one workspace scope (a team, or `null` for team-less pages) that the viewer can
   * read: the base condition of the #111 read paths.
   */
  readablePagesInScope(viewer: PageViewer, teamId: number | null): SQL {
    return and(
      isNull(wikiPages.deletedAt),
      teamId === null ? isNull(wikiPages.teamId) : eq(wikiPages.teamId, teamId),
      this.listableBy(viewer)
    )!;
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

  /**
   * Rows for the page tree (issue #103 E5): live pages the viewer may list, optionally limited to
   * one team or to personal (team-less) pages. Nesting and the hidden-parent rule live in
   * server/services/page-tree.ts.
   */
  async getReadablePageTreeRows(
    userId: number | undefined,
    scope: { teamId?: number; personalOnly?: boolean } = {},
    viewerOverride?: PageViewer
  ): Promise<PageTreeRow[]> {
    const viewer = viewerOverride ?? (await this.getPageViewer(userId));
    const conditions: SQL[] = [isNull(wikiPages.deletedAt), this.listableBy(viewer)];
    if (scope.teamId !== undefined) conditions.push(eq(wikiPages.teamId, scope.teamId));
    if (scope.personalOnly) conditions.push(isNull(wikiPages.teamId));
    return this.db
      .select({
        id: wikiPages.id,
        title: wikiPages.title,
        slug: wikiPages.slug,
        icon: wikiPages.icon,
        parentId: wikiPages.parentId,
        position: wikiPages.position,
        folder: wikiPages.folder,
        teamId: wikiPages.teamId,
        updatedAt: wikiPages.updatedAt,
        createdAt: wikiPages.createdAt,
      })
      .from(wikiPages)
      .where(and(...conditions))
      .limit(5000);
  }

  /** Ids of every live descendant of a page, readable or not (for move and trash rules). */
  async getLiveDescendantIds(pageId: number): Promise<number[]> {
    const { rows } = await this.pool.query(
      `WITH RECURSIVE sub AS (
         SELECT id FROM wiki_pages WHERE parent_id = $1 AND deleted_at IS NULL
         UNION
         SELECT w.id FROM wiki_pages w JOIN sub ON w.parent_id = sub.id
          WHERE w.deleted_at IS NULL
       )
       SELECT id FROM sub`,
      [pageId]
    );
    return rows.map((r: { id: number }) => r.id).filter((id: number) => id !== pageId);
  }

  /**
   * Ids of every descendant of a page, trashed ones included (restoring a trashed page brings
   * its links back, so cycle checks must see through it).
   */
  async getAllDescendantIds(pageId: number): Promise<number[]> {
    const { rows } = await this.pool.query(
      `WITH RECURSIVE sub AS (
         SELECT id FROM wiki_pages WHERE parent_id = $1
         UNION
         SELECT w.id FROM wiki_pages w JOIN sub ON w.parent_id = sub.id
       )
       SELECT id FROM sub`,
      [pageId]
    );
    return rows.map((r: { id: number }) => r.id).filter((id: number) => id !== pageId);
  }

  /**
   * The siblings the viewer can see under `parentId` (null = root) in one team or among personal
   * pages, in tree order. Only these are renumbered on a move, so a move never writes to pages
   * the viewer cannot read.
   */
  async getReadableSiblingIds(
    userId: number | undefined,
    parentId: number | null,
    teamId: number | null
  ): Promise<number[]> {
    const viewer = await this.getPageViewer(userId);
    const rows = await this.db
      .select({ id: wikiPages.id })
      .from(wikiPages)
      .where(
        and(
          isNull(wikiPages.deletedAt),
          parentId === null ? isNull(wikiPages.parentId) : eq(wikiPages.parentId, parentId),
          teamId === null ? isNull(wikiPages.teamId) : eq(wikiPages.teamId, teamId),
          this.listableBy(viewer)
        )
      )
      .orderBy(
        sql`${wikiPages.position} ASC NULLS LAST`,
        asc(wikiPages.createdAt),
        asc(wikiPages.id)
      );
    return rows.map((r: { id: number }) => r.id);
  }

  /** Put `pageId` under `parentId` and number `orderedIds` (its new siblings, itself included). */
  async placePageInTree(
    pageId: number,
    parentId: number | null,
    orderedIds: number[]
  ): Promise<void> {
    await this.db.transaction(async (tx: any) => {
      await tx.update(wikiPages).set({ parentId }).where(eq(wikiPages.id, pageId));
      for (const [index, id] of orderedIds.entries()) {
        await tx.update(wikiPages).set({ position: index }).where(eq(wikiPages.id, id));
      }
    });
  }

  /** Trash several pages at one instant, so a later restore can tell they went together. */
  async trashPages(ids: number[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await this.db
      .update(wikiPages)
      .set({ deletedAt: new Date() })
      .where(and(inArray(wikiPages.id, ids), isNull(wikiPages.deletedAt)))
      .returning({ id: wikiPages.id });
    return result.length;
  }

  /** A trashed page plus the descendants trashed in the same delete (same deleted_at). */
  async getTrashedTogetherIds(pageId: number): Promise<number[]> {
    const { rows } = await this.pool.query(
      `WITH RECURSIVE sub AS (
         SELECT id, deleted_at FROM wiki_pages WHERE id = $1
         UNION
         SELECT w.id, w.deleted_at FROM wiki_pages w JOIN sub ON w.parent_id = sub.id
       )
       SELECT id FROM sub
        WHERE deleted_at IS NOT NULL
          AND deleted_at = (SELECT deleted_at FROM wiki_pages WHERE id = $1)`,
      [pageId]
    );
    return rows.map((r: { id: number }) => r.id);
  }

  async restorePages(ids: number[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await this.db
      .update(wikiPages)
      .set({ deletedAt: null })
      .where(inArray(wikiPages.id, ids))
      .returning({ id: wikiPages.id });
    return result.length;
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
    const userTeamIds = await this.getUserTeamIds(userId);
    if (page?.teamId) {
      const teamId = Number(page.teamId);
      if (!userTeamIds.includes(teamId)) return null;
      if (await this.isTeamManager(userId, teamId)) return 'owner';
    }

    // The user's own grants, plus grants to a team they currently belong to, as in
    // checkPagePermission (a team daily note's members edit through its team grant, #111).
    const grantees = [
      and(eq(pagePermissions.entityType, 'user'), eq(pagePermissions.entityId, userId)),
    ];
    if (userTeamIds.length > 0) {
      grantees.push(
        and(eq(pagePermissions.entityType, 'team'), inArray(pagePermissions.entityId, userTeamIds))
      );
    }
    const permissions = await this.db
      .select()
      .from(pagePermissions)
      .where(and(eq(pagePermissions.pageId, pageId), or(...grantees)));

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
  // Inline databases (#113 §4). These methods do not authorize: every /api/database route
  // resolves the owning page (schema → page_id) and checks the caller's permission on it first.

  async createDatabaseSchema(
    pageId: number,
    schema: { name: string; description?: string | null; fields: DatabaseField[] }
  ): Promise<DatabaseSchema> {
    const [newSchema] = await this.db
      .insert(databaseSchemas)
      .values({
        pageId,
        name: schema.name,
        description: schema.description ?? null,
        fields: schema.fields,
      })
      .returning();
    return newSchema;
  }

  async getDatabaseSchema(schemaId: number): Promise<DatabaseSchema | undefined> {
    const [schema] = await this.db
      .select()
      .from(databaseSchemas)
      .where(eq(databaseSchemas.id, schemaId));
    return schema;
  }

  async updateDatabaseSchema(
    schemaId: number,
    updates: { name?: string; description?: string | null }
  ): Promise<DatabaseSchema | undefined> {
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

  /**
   * Changes a schema's properties with the schema row locked, so concurrent property edits apply
   * one after the other instead of overwriting each other. `plan` sees the locked schema and
   * returns the new property list (see shared/inline-database.ts). Values of deleted properties
   * are removed from every row in the same transaction; a type change that is not lossless is
   * refused (409) while any row has a value for the property.
   */
  async mutateDatabaseFields(
    schemaId: number,
    plan: (schema: DatabaseSchema) => FieldPlan
  ): Promise<
    { ok: true; schema: DatabaseSchema } | { ok: false; status: 400 | 404 | 409; message: string }
  > {
    return this.db.transaction(async (tx: any) => {
      const [schema] = await tx
        .select()
        .from(databaseSchemas)
        .where(eq(databaseSchemas.id, schemaId))
        .for('update');
      if (!schema) return { ok: false, status: 404, message: 'Database not found' };
      const outcome = plan(schema);
      if (!outcome.ok) return outcome;
      for (const fieldId of outcome.requireEmptyFieldIds) {
        const [inUse] = await tx
          .select({ id: databaseRows.id })
          .from(databaseRows)
          .where(and(eq(databaseRows.schemaId, schemaId), sql`${databaseRows.data} ? ${fieldId}`))
          .limit(1);
        if (inUse) {
          return {
            ok: false,
            status: 409,
            message: 'The property has values, so its type cannot change to this type',
          };
        }
      }
      for (const fieldId of outcome.removedFieldIds) {
        await tx
          .update(databaseRows)
          .set({ data: sql`${databaseRows.data} - ${fieldId}::text` })
          .where(and(eq(databaseRows.schemaId, schemaId), sql`${databaseRows.data} ? ${fieldId}`));
      }
      const [updated] = await tx
        .update(databaseSchemas)
        .set({ fields: outcome.fields, updatedAt: new Date() })
        .where(eq(databaseSchemas.id, schemaId))
        .returning();
      return { ok: true, schema: updated };
    });
  }

  async deleteDatabaseSchema(schemaId: number) {
    await this.db.delete(databaseSchemas).where(eq(databaseSchemas.id, schemaId));
  }

  // ==================== Database Row Operations ====================

  /**
   * A new row at the end of its database, or null when the database already has `maxRows`
   * rows. Creation is serialized per database (schema row lock) so the limit and the order hold.
   */
  async createDatabaseRow(
    schemaId: number,
    userId: number | null,
    data: DatabaseRowData,
    maxRows: number
  ): Promise<DatabaseRow | null> {
    return this.db.transaction(async (tx: any) => {
      await tx
        .select({ id: databaseSchemas.id })
        .from(databaseSchemas)
        .where(eq(databaseSchemas.id, schemaId))
        .for('update');
      const [stats] = await tx
        .select({
          count: sql<number>`count(*)::int`,
          maxOrder: sql<number | null>`max(${databaseRows.orderIndex})`,
        })
        .from(databaseRows)
        .where(eq(databaseRows.schemaId, schemaId));
      if (Number(stats?.count ?? 0) >= maxRows) return null;
      const [newRow] = await tx
        .insert(databaseRows)
        .values({
          schemaId,
          createdBy: userId,
          data,
          orderIndex: stats?.maxOrder == null ? 0 : Number(stats.maxOrder) + 1,
        })
        .returning();
      return newRow;
    });
  }

  async getDatabaseRow(rowId: number): Promise<DatabaseRow | undefined> {
    const [row] = await this.db.select().from(databaseRows).where(eq(databaseRows.id, rowId));
    return row;
  }

  /** A database's rows in their stored order. */
  async getDatabaseRows(schemaId: number): Promise<DatabaseRow[]> {
    return await this.db
      .select()
      .from(databaseRows)
      .where(eq(databaseRows.schemaId, schemaId))
      .orderBy(asc(databaseRows.orderIndex), asc(databaseRows.id));
  }

  /**
   * Changes a row's cells and/or its place. `values` merges into the stored data (`null` clears
   * a cell), so editors changing different cells of one row never undo each other. `place` moves
   * the row right before or after another row of the same database and renumbers the database's
   * order 0..n-1 in one statement, with the schema row locked.
   */
  async updateDatabaseRow(
    rowId: number,
    changes: {
      values?: Record<string, DatabaseCellValue | null>;
      place?: { beforeRowId: number } | { afterRowId: number };
    }
  ): Promise<{ ok: true; row: DatabaseRow } | { ok: false; status: 400 | 404; message: string }> {
    return this.db.transaction(async (tx: any) => {
      const [existing] = await tx.select().from(databaseRows).where(eq(databaseRows.id, rowId));
      if (!existing) return { ok: false, status: 404, message: 'Database not found' };
      const schemaId = existing.schemaId;

      if (changes.place) {
        await tx
          .select({ id: databaseSchemas.id })
          .from(databaseSchemas)
          .where(eq(databaseSchemas.id, schemaId))
          .for('update');
        const ordered: Array<{ id: number }> = await tx
          .select({ id: databaseRows.id })
          .from(databaseRows)
          .where(eq(databaseRows.schemaId, schemaId))
          .orderBy(asc(databaseRows.orderIndex), asc(databaseRows.id));
        const before = 'beforeRowId' in changes.place;
        const anchorId =
          'beforeRowId' in changes.place ? changes.place.beforeRowId : changes.place.afterRowId;
        const ids = ordered.map((row) => row.id).filter((id) => id !== rowId);
        const at = ids.indexOf(anchorId);
        if (at === -1) {
          return { ok: false, status: 400, message: 'The anchor row is not in this database' };
        }
        ids.splice(before ? at : at + 1, 0, rowId);
        await tx.execute(sql`
          UPDATE database_rows AS r
          SET order_index = (v.ord - 1)::int
          FROM jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb) WITH ORDINALITY AS v(id, ord)
          WHERE r.id = v.id::int AND r.schema_id = ${schemaId} AND r.order_index <> (v.ord - 1)
        `);
      }

      const set: Record<string, unknown> = { updatedAt: new Date() };
      const entries = Object.entries(changes.values ?? {});
      if (entries.length > 0) {
        const present = presentValues(changes.values ?? {});
        const cleared = entries.filter(([, value]) => value === null).map(([key]) => key);
        set.data = sql`(${databaseRows.data} || ${JSON.stringify(present)}::jsonb) - ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(cleared)}::jsonb))`;
      }
      const [row] = await tx
        .update(databaseRows)
        .set(set)
        .where(eq(databaseRows.id, rowId))
        .returning();
      return { ok: true, row };
    });
  }

  async deleteDatabaseRow(rowId: number) {
    await this.db.delete(databaseRows).where(eq(databaseRows.id, rowId));
  }

  // ==================== Database Relations Operations ====================

  /**
   * Links a row to another row, or returns null when the source row already has `maxPerRow`
   * relations. Links from one row are serialized by a transaction-scoped advisory lock on it, so
   * concurrent links keep the cap. Not a row lock: the insert's foreign key checks take key-share
   * locks on both rows and schemas, and a FOR UPDATE here deadlocked with a reverse link (B → A
   * while A → B) or with a row move or property change in the source database.
   */
  async addRelation(
    fromSchemaId: number,
    fromRowId: number,
    propertyName: string,
    toSchemaId: number,
    toRowId: number,
    maxPerRow: number = DATABASE_LIMITS.relationsPerRow
  ): Promise<DatabaseRelation | null> {
    return this.db.transaction(async (tx: any) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`database-relations:${fromRowId}`}, 0))`
      );
      const [stats] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(databaseRelations)
        .where(eq(databaseRelations.fromRowId, fromRowId));
      if (Number(stats?.count ?? 0) >= maxPerRow) return null;
      const [relation] = await tx
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
    });
  }

  /**
   * A row's relations with the database each target row really belongs to (`targetSchemaId`,
   * read from the row). The stored `to_schema_id` is not trusted for access decisions: relations
   * written before #113 could pair any schema id with any row.
   */
  async getRelationsWithTargets(
    rowId: number,
    propertyName?: string
  ): Promise<Array<DatabaseRelation & { targetSchemaId: number }>> {
    const conditions = [eq(databaseRelations.fromRowId, rowId)];
    if (propertyName) {
      conditions.push(eq(databaseRelations.propertyName, propertyName));
    }
    const rows: Array<{ relation: DatabaseRelation; targetSchemaId: number }> = await this.db
      .select({ relation: databaseRelations, targetSchemaId: databaseRows.schemaId })
      .from(databaseRelations)
      .innerJoin(databaseRows, eq(databaseRows.id, databaseRelations.toRowId))
      .where(and(...conditions))
      .orderBy(asc(databaseRelations.id));
    return rows.map(({ relation, targetSchemaId }) => ({ ...relation, targetSchemaId }));
  }

  async getRelations(rowId: number, propertyName?: string): Promise<DatabaseRelation[]> {
    const conditions = [eq(databaseRelations.fromRowId, rowId)];
    if (propertyName) {
      conditions.push(eq(databaseRelations.propertyName, propertyName));
    }

    return await this.db
      .select()
      .from(databaseRelations)
      .where(and(...conditions))
      .orderBy(asc(databaseRelations.id));
  }

  async getDatabaseRelation(relationId: number): Promise<DatabaseRelation | undefined> {
    const [relation] = await this.db
      .select()
      .from(databaseRelations)
      .where(eq(databaseRelations.id, relationId));
    return relation;
  }

  async deleteRelation(relationId: number) {
    await this.db.delete(databaseRelations).where(eq(databaseRelations.id, relationId));
  }

  /**
   * Calculate rollup value based on relations. `targetSchemaIds` limits the rollup to related
   * rows that really belong to those databases (the ones the caller may read): the row's own
   * schema decides, never the relation's stored `to_schema_id`.
   */
  async calculateRollup(
    rowId: number,
    fieldName: string,
    config: {
      relationField: string;
      targetField: string;
      aggregation: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'unique';
    },
    targetSchemaIds?: number[]
  ) {
    // Related rows through a subquery (each row once), so no list of ids is sent as parameters.
    const relatedIds = this.db
      .select({ id: databaseRelations.toRowId })
      .from(databaseRelations)
      .where(
        and(
          eq(databaseRelations.fromRowId, rowId),
          eq(databaseRelations.propertyName, config.relationField)
        )
      );
    const conditions = [inArray(databaseRows.id, relatedIds)];
    if (targetSchemaIds) conditions.push(inArray(databaseRows.schemaId, targetSchemaIds));

    // Only the target property is read (`->` takes the row's own key, never an inherited one
    // such as `constructor`), not every related row's whole data.
    const relatedValues: Array<{ value: unknown }> =
      targetSchemaIds?.length === 0
        ? []
        : await this.db
            .select({ value: sql<unknown>`${databaseRows.data} -> ${config.targetField}` })
            .from(databaseRows)
            .where(and(...conditions));

    const values = relatedValues
      .map((row) => row.value)
      .filter((v) => v !== null && v !== undefined);
    if (values.length === 0) {
      return config.aggregation === 'count' ? 0 : null;
    }
    // Numeric aggregations use the finite numbers only. Min and max loop instead of spreading:
    // spreading a large list into Math.min/Math.max overflows the call stack.
    const numbers = values.map(Number).filter((value) => Number.isFinite(value));
    const sum = numbers.reduce((total, value) => total + value, 0);

    switch (config.aggregation) {
      case 'count':
        return values.length;
      case 'sum':
        return sum;
      case 'avg':
        return numbers.length > 0 ? sum / numbers.length : null;
      case 'min':
        return numbers.length > 0
          ? numbers.reduce((least, value) => (value < least ? value : least))
          : null;
      case 'max':
        return numbers.length > 0
          ? numbers.reduce((most, value) => (value > most ? value : most))
          : null;
      case 'unique':
        return new Set(values.map((value) => JSON.stringify(value))).size;
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

  // ---- Markdown vault export and import (#113 P2-D2); route rules in server/routes/vault.ts ----

  /**
   * Every live page of one workspace scope the viewer can read, with the fields the vault export
   * writes (the tree fields as stored; `buildPageTree` applies the viewer's view of them).
   */
  async getVaultExportPages(viewer: PageViewer, teamId: number | null): Promise<VaultExportRow[]> {
    return this.db
      .select({
        id: wikiPages.id,
        title: wikiPages.title,
        slug: wikiPages.slug,
        icon: wikiPages.icon,
        parentId: wikiPages.parentId,
        position: wikiPages.position,
        folder: wikiPages.folder,
        teamId: wikiPages.teamId,
        createdAt: wikiPages.createdAt,
        updatedAt: wikiPages.updatedAt,
        content: wikiPages.content,
        tags: wikiPages.tags,
      })
      .from(wikiPages)
      .where(this.readablePagesInScope(viewer, teamId));
  }

  /**
   * Ids and titles of every live page of one scope the viewer can read, most recently updated
   * first: the existing pages a vault import may link to.
   */
  async getReadablePageTitlesInScope(
    viewer: PageViewer,
    teamId: number | null
  ): Promise<Array<{ id: number; title: string }>> {
    return this.db
      .select({ id: wikiPages.id, title: wikiPages.title })
      .from(wikiPages)
      .where(this.readablePagesInScope(viewer, teamId))
      .orderBy(desc(wikiPages.updatedAt), desc(wikiPages.id));
  }

  /** `count` new page ids from the page id sequence (an import links pages before they exist). */
  async reservePageIds(count: number): Promise<number[]> {
    if (count <= 0) return [];
    const result = await this.db.execute(
      sql`SELECT nextval(pg_get_serial_sequence('wiki_pages', 'id'))::int AS id FROM generate_series(1, ${count})`
    );
    return result.rows.map((row: { id: number }) => Number(row.id));
  }

  /**
   * Create the pages of a vault import in one transaction: either every page, its creator owner
   * grant and its link index rows are stored, or nothing is. Pages are inserted in the given
   * order (parents first) with ids from `reservePageIds`; a taken slug gets the next candidate,
   * as in `createWikiPage`. Link targets that do not exist are skipped, as in `replacePageLinks`.
   * Authorization is the caller's job.
   */
  async insertImportedPages(input: {
    teamId: number | null;
    userId: number;
    author: string;
    folder: string;
    pages: Array<{
      id: number;
      title: string;
      slug: string;
      content: string;
      tags: string[];
      icon: string | null;
      parentId: number | null;
      linkTargets: number[];
    }>;
  }): Promise<Array<{ id: number; slug: string }>> {
    if (input.pages.length === 0) return [];
    return this.db.transaction(async (tx: any) => {
      const created: Array<{ id: number; slug: string }> = [];
      for (const page of input.pages) {
        let row: { id: number; slug: string } | undefined;
        const firstAttempt = isReservedDailyNoteSlug(page.slug) ? 1 : 0;
        for (let attempt = firstAttempt; !row && attempt < MAX_SLUG_INSERT_ATTEMPTS; attempt += 1) {
          [row] = await tx
            .insert(wikiPages)
            .values({
              id: page.id,
              title: page.title,
              slug: buildUniqueSlugCandidate(page.slug, attempt),
              content: page.content,
              blocks: [],
              folder: input.folder,
              tags: page.tags,
              author: input.author,
              teamId: input.teamId,
              parentId: page.parentId,
              icon: page.icon,
              isPublished: true,
            })
            .onConflictDoNothing({ target: wikiPages.slug })
            .returning({ id: wikiPages.id, slug: wikiPages.slug });
        }
        if (!row) throw new Error('Failed to allocate a unique page slug');
        created.push(row);
      }

      await tx.insert(pagePermissions).values(
        input.pages.map((page) => ({
          pageId: page.id,
          entityType: 'user',
          entityId: input.userId,
          permission: 'owner',
          grantedBy: input.userId,
        }))
      );

      const links = input.pages.flatMap((page) =>
        Array.from(new Set(page.linkTargets))
          .filter((target) => Number.isInteger(target) && target > 0 && target !== page.id)
          .slice(0, MAX_INDEXED_LINKS)
          .map((target) => sql`(${page.id}::int, ${target}::int)`)
      );
      for (let i = 0; i < links.length; i += 1000) {
        await tx.execute(sql`
          INSERT INTO page_links (source_page_id, target_page_id)
          SELECT link.source, link.target
          FROM (VALUES ${sql.join(links.slice(i, i + 1000), sql`, `)}) AS link(source, target)
          WHERE EXISTS (SELECT 1 FROM wiki_pages WHERE wiki_pages.id = link.target)
          ON CONFLICT DO NOTHING`);
      }
      return created;
    });
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
