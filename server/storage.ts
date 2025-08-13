import { wikiPages, type WikiPage, type InsertWikiPage, type UpdateWikiPage, type Tag, type SearchParams, type CalendarEvent, type InsertCalendarEvent, type UpdateCalendarEvent, type Directory, type InsertDirectory, type UpdateDirectory, type Comment, type InsertComment, type UpdateComment, type Member, type InsertMember, type UpdateMember, type Task, type InsertTask, type UpdateTask, type Notification, type InsertNotification, type UpdateNotification, type Template, type InsertTemplate, type UpdateTemplate, type TemplateCategory, type InsertTemplateCategory, type UpdateTemplateCategory, type Team, type InsertTeam, type UpdateTeam, users, calendarEvents, directories, comments, members, tasks, notifications, templates, templateCategories, teams } from "../shared/schema.ts";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, like, and, sql, desc, asc } from "drizzle-orm";
import { Pool } from "pg";
import bcrypt from "bcrypt";

// Simplified and unified DBStorage
export class DBStorage {
  public db: any;
  public pool: Pool;

  constructor() {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required for database storage");
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
    const result = await this.db.update(wikiPages).set(page).where(eq(wikiPages.id, id)).returning();
    return result[0];
  }

  async deleteWikiPage(id: number): Promise<boolean> {
    const result = await this.db.delete(wikiPages).where(eq(wikiPages.id, id)).returning();
    return result.length > 0;
  }

  async searchWikiPages(params: SearchParams): Promise<{ pages: WikiPage[]; total: number }> {
    const query = this.db.select().from(wikiPages);
    const countQuery = this.db.select({ count: sql`count(*)` }).from(wikiPages);

    const conditions = [];
    if (params.query) {
      conditions.push(like(wikiPages.title, `%${params.query}%`));
    }
    if (params.folder) {
      conditions.push(eq(wikiPages.folder, params.folder));
    }
    if (params.teamId) {
      conditions.push(eq(wikiPages.teamId, params.teamId));
    }
    if (params.tags && params.tags.length > 0) {
      conditions.push(sql`${wikiPages.tags} && ${params.tags}`);
    }

    if (conditions.length > 0) {
      query.where(and(...conditions));
      countQuery.where(and(...conditions));
    }

    const totalResult = await countQuery;
    const total = totalResult[0].count;

    query.limit(params.limit || 20).offset(params.offset || 0).orderBy(desc(wikiPages.updatedAt));

    const pages = await query;
    return { pages, total };
  }
  
  async getWikiPagesByFolder(folder: string): Promise<WikiPage[]> {
    return this.db.select().from(wikiPages).where(eq(wikiPages.folder, folder)).orderBy(desc(wikiPages.updatedAt));
  }

  async getAllTags(): Promise<Tag[]> {
    const allPages = await this.db.select({ tags: wikiPages.tags }).from(wikiPages);
    const tagCounts = new Map<string, number>();
    allPages.forEach(page => {
      page.tags?.forEach(tag => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      });
    });
    return Array.from(tagCounts.entries()).map(([name, count]) => ({ name, count }));
  }

  async getFolders(): Promise<string[]> {
    const result = await this.db.selectDistinct({ folder: wikiPages.folder }).from(wikiPages);
    return result.map(r => r.folder);
  }

  async getCalendarEvents(teamId?: string): Promise<CalendarEvent[]> {
    const query = this.db.select().from(calendarEvents);
    if (teamId) {
      query.where(eq(calendarEvents.teamId, teamId));
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

  async updateCalendarEvent(id: number, event: UpdateCalendarEvent): Promise<CalendarEvent | undefined> {
    const result = await this.db.update(calendarEvents).set(event).where(eq(calendarEvents.id, id)).returning();
    return result[0];
  }

  async deleteCalendarEvent(id: number): Promise<boolean> {
    const result = await this.db.delete(calendarEvents).where(eq(calendarEvents.id, id)).returning();
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
    const result = await this.db.insert(directories).values(directory).returning();
    return result[0];
  }

  async updateDirectory(id: number, directory: UpdateDirectory): Promise<Directory | undefined> {
    const result = await this.db.update(directories).set(directory).where(eq(directories.id, id)).returning();
    return result[0];
  }

  async deleteDirectory(id: number): Promise<boolean> {
    const result = await this.db.delete(directories).where(eq(directories.id, id)).returning();
    return result.length > 0;
  }

  async verifyDirectoryPassword(directoryName: string, password: string): Promise<boolean> {
    const result = await this.db.select({ password: directories.password }).from(directories).where(eq(directories.name, directoryName));
    const dir = result[0];
    if (!dir || !dir.password) return true;
    return dir.password === password;
  }

  async getCommentsByPageId(pageId: number): Promise<Comment[]> {
    return this.db.select().from(comments).where(eq(comments.pageId, pageId)).orderBy(asc(comments.createdAt));
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
    const result = await this.db.update(comments).set(comment).where(eq(comments.id, id)).returning();
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
    const query = this.db.select().from(members).where(eq(members.isActive, true));
    if (teamId) {
      query.where(eq(members.teamId, teamId));
    }
    return query;
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

  async updateProgressStats(teamId: string, memberId: number | null, type: 'page' | 'comment' | 'task'): Promise<void> {
  }

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
    const result = await this.db.update(tasks).set({ progress, updatedAt: new Date() }).where(eq(tasks.id, id)).returning();
    return result[0];
  }

  async getNotifications(recipientId: number): Promise<Notification[]> {
    return this.db.select().from(notifications).where(eq(notifications.recipientId, recipientId)).orderBy(desc(notifications.createdAt));
  }

  async getNotification(id: number): Promise<Notification | undefined> {
    const result = await this.db.select().from(notifications).where(eq(notifications.id, id));
    return result[0];
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const result = await this.db.insert(notifications).values(notification).returning();
    return result[0];
  }

  async updateNotification(id: number, notification: UpdateNotification): Promise<Notification | undefined> {
    const result = await this.db.update(notifications).set(notification).where(eq(notifications.id, id)).returning();
    return result[0];
  }

  async deleteNotification(id: number): Promise<boolean> {
    const result = await this.db.delete(notifications).where(eq(notifications.id, id)).returning();
    return result.length > 0;
  }

  async markNotificationAsRead(id: number): Promise<Notification | undefined> {
    const result = await this.db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id)).returning();
    return result[0];
  }

  async markAllNotificationsAsRead(recipientId: number): Promise<void> {
    await this.db.update(notifications).set({ isRead: true }).where(eq(notifications.recipientId, recipientId));
  }

  async getUnreadNotificationCount(recipientId: number): Promise<number> {
    const result = await this.db.select({ count: sql`count(*)` }).from(notifications).where(and(eq(notifications.recipientId, recipientId), eq(notifications.isRead, false)));
    return Number(result[0].count);
  }

  async getTemplateCategories(): Promise<TemplateCategory[]> {
    return this.db.select().from(templateCategories).orderBy(asc(templateCategories.order));
  }

  async getTemplateCategory(id: number): Promise<TemplateCategory | undefined> {
    const result = await this.db.select().from(templateCategories).where(eq(templateCategories.id, id));
    return result[0];
  }

  async createTemplateCategory(category: InsertTemplateCategory): Promise<TemplateCategory> {
    const result = await this.db.insert(templateCategories).values(category).returning();
    return result[0];
  }

  async updateTemplateCategory(id: number, category: UpdateTemplateCategory): Promise<TemplateCategory | undefined> {
    const result = await this.db.update(templateCategories).set(category).where(eq(templateCategories.id, id)).returning();
    return result[0];
  }

  async deleteTemplateCategory(id: number): Promise<boolean> {
    const result = await this.db.delete(templateCategories).where(eq(templateCategories.id, id)).returning();
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
    const result = await this.db.update(templates).set(template).where(eq(templates.id, id)).returning();
    return result[0];
  }

  async deleteTemplate(id: number): Promise<boolean> {
    const result = await this.db.delete(templates).where(eq(templates.id, id)).returning();
    return result.length > 0;
  }

  async incrementTemplateUsage(id: number): Promise<boolean> {
    const result = await this.db.update(templates).set({ usageCount: sql`${templates.usageCount} + 1` }).where(eq(templates.id, id)).returning();
    return result.length > 0;
  }
}