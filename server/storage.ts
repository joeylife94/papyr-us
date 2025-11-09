import dotenv from 'dotenv';
dotenv.config();
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
} from '../shared/schema.js';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, like, and, sql, desc, asc } from 'drizzle-orm';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

// Helper: detect if a string looks like a bcrypt hash
function isBcryptHash(value: string): boolean {
  // bcrypt hashes typically start with $2a$, $2b$, or $2y$ and are ~60 chars
  return typeof value === 'string' && /^\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}$/.test(value);
}

// Simplified and unified DBStorage
export class DBStorage {
  public db: any;
  public pool: Pool;

  constructor() {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for database storage');
    }

    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
    this.db = drizzle(this.pool);
  }

  // All method implementations remain the same as before...
  async getWikiPage(id: number): Promise<WikiPage | undefined> {
    const result = await this.db.select().from(wikiPages).where(eq(wikiPages.id, id));
    return result[0];
  }

  async getWikiPageBySlug(slug: string): Promise<WikiPage | undefined> {
    const result = await this.db.select().from(wikiPages).where(eq(wikiPages.slug, slug));
    return result[0];
  }

  async createWikiPage(page: InsertWikiPage): Promise<WikiPage> {
    const result = await this.db.insert(wikiPages).values(page).returning();
    return result[0];
  }

  async updateWikiPage(id: number, page: UpdateWikiPage): Promise<WikiPage | undefined> {
    const result = await this.db
      .update(wikiPages)
      .set(page)
      .where(eq(wikiPages.id, id))
      .returning();
    return result[0];
  }

  async deleteWikiPage(id: number): Promise<boolean> {
    const result = await this.db.delete(wikiPages).where(eq(wikiPages.id, id)).returning();
    return result.length > 0;
  }

  async searchWikiPages(params: SearchParams): Promise<{ pages: WikiPage[]; total: number }> {
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
    if (params.teamId) {
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

  async getWikiPagesByFolder(folder: string): Promise<WikiPage[]> {
    return this.db
      .select()
      .from(wikiPages)
      .where(eq(wikiPages.folder, folder))
      .orderBy(desc(wikiPages.updatedAt));
  }

  async getAllTags(): Promise<Tag[]> {
    const allPages = await this.db.select({ tags: wikiPages.tags }).from(wikiPages);
    const tagCounts = new Map<string, number>();
    allPages.forEach((page: { tags: string[] }) => {
      page.tags?.forEach((tag: string) => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      });
    });
    return Array.from(tagCounts.entries()).map(([name, count]) => ({ name, count }));
  }

  async getFolders(): Promise<string[]> {
    const result = await this.db.selectDistinct({ folder: wikiPages.folder }).from(wikiPages);
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
    return this.db
      .select()
      .from(comments)
      .where(eq(comments.pageId, pageId))
      .orderBy(asc(comments.createdAt));
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
    if (team.password) {
      team.password = await bcrypt.hash(team.password, 10);
    }
    const result = await this.db.insert(teams).values(team).returning();
    return result[0];
  }

  async updateTeam(id: number, team: UpdateTeam): Promise<Team | undefined> {
    if (team.password) {
      team.password = await bcrypt.hash(team.password, 10);
    }
    const result = await this.db.update(teams).set(team).where(eq(teams.id, id)).returning();
    return result[0];
  }

  async deleteTeam(id: number): Promise<boolean> {
    const result = await this.db.delete(teams).where(eq(teams.id, id)).returning();
    return result.length > 0;
  }

  async verifyTeamPassword(teamName: string, password: string): Promise<boolean> {
    const team = await this.getTeamByName(teamName);
    if (!team || !team.password) return false;
    return bcrypt.compare(password, team.password);
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

  async getDashboardOverview(): Promise<any> {
    const pageCountResult = await this.db.select({ count: sql`count(*)` }).from(wikiPages);
    const commentCountResult = await this.db.select({ count: sql`count(*)` }).from(comments);
    const memberCountResult = await this.db.select({ count: sql`count(*)` }).from(members);
    const taskCountResult = await this.db.select({ count: sql`count(*)` }).from(tasks);
    return {
      totalPages: Number(pageCountResult[0].count),
      totalComments: Number(commentCountResult[0].count),
      totalMembers: Number(memberCountResult[0].count),
      totalTasks: Number(taskCountResult[0].count),
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
    let query = this.db.select().from(workflows).where(eq(workflows.isActive, true));

    if (teamId) {
      query = query.where(eq(workflows.teamId, teamId));
    }

    const allWorkflows = await query;

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

    // Get all permissions for this page
    const permissions = await this.db
      .select()
      .from(pagePermissions)
      .where(eq(pagePermissions.pageId, pageId));

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

    // Check team permissions (if user belongs to a team)
    // TODO: Add team membership check when needed
    // const userTeams = await this.getUserTeams(userId);
    // const teamPermission = permissions.find(
    //   (p) => p.entityType === 'team' && userTeams.includes(p.entityId)
    // );

    return false;
  }

  /**
   * Get all permissions for a page
   */
  async getPagePermissions(pageId: number): Promise<PagePermission[]> {
    return await this.db.select().from(pagePermissions).where(eq(pagePermissions.pageId, pageId));
  }

  /**
   * Get a user's permission level for a page (returns highest level)
   */
  async getUserPagePermission(userId: number, pageId: number): Promise<PermissionLevel | null> {
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
   * Remove a permission from a page
   */
  async removePagePermission(permissionId: number): Promise<boolean> {
    const result = await this.db
      .delete(pagePermissions)
      .where(eq(pagePermissions.id, permissionId))
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
   * Generate a random token for public links
   */
  generatePublicLinkToken(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 16; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
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
    // Get all pages where user is author or has access
    // TODO: Also check page permissions for more comprehensive access control
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) return [];

    const userPages = await this.db.query.wikiPages.findMany({
      where: eq(wikiPages.author, user.email),
    });

    const pageIds = userPages.map((p: any) => p.id);

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
}

// Export singleton instance
let storageInstance: DBStorage | null = null;

export function getStorage(): DBStorage {
  if (!storageInstance) {
    storageInstance = new DBStorage();
  }
  return storageInstance;
}
