import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Block types for the new block-based editor
export const blockTypes = [
  'heading1', 'heading2', 'heading3', // 제목 블록
  'paragraph', // 단락 블록
  'checkbox', // 체크박스 블록
  'table', // 테이블 블록
  'image', // 이미지 블록
  'code', // 코드 블록
  'quote', // 인용구 블록
  'bulleted_list', // 글머리 기호 목록
  'numbered_list', // 번호 목록
  'toggle', // 토글 블록
  'mention', // 멘션 블록
  'comment', // 댓글 블록
] as const;

export type BlockType = typeof blockTypes[number];

// Block schema for individual content blocks
export const blockSchema = z.object({
  id: z.string(),
  type: z.enum(blockTypes),
  content: z.string().default(''),
  properties: z.record(z.any()).default({}),
  order: z.number(),
  parentId: z.string().optional(),
  children: z.array(z.string()).default([]), // child block IDs
});

export type Block = z.infer<typeof blockSchema>;

export const wikiPages = pgTable("wiki_pages", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  content: text("content").notNull(),
  blocks: jsonb("blocks").default([]), // New field for block-based content
  folder: text("folder").notNull(), // docs, ideas, members, logs, archive, team1, team2, etc.
  tags: text("tags").array().notNull().default([]),
  author: text("author").notNull(),
  teamId: integer("team_id").references(() => teams.id, { onDelete: "set null" }), // 팀 소속
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isPublished: boolean("is_published").notNull().default(true),
  metadata: jsonb("metadata").default({}), // for frontmatter data
});

export const insertWikiPageSchema = createInsertSchema(wikiPages).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateWikiPageSchema = insertWikiPageSchema.partial();

export type InsertWikiPage = z.infer<typeof insertWikiPageSchema>;
export type UpdateWikiPage = z.infer<typeof updateWikiPageSchema>;
export type WikiPage = typeof wikiPages.$inferSelect;

// Tags schema for filtering
export const tagSchema = z.object({
  name: z.string(),
  count: z.number(),
});

export type Tag = z.infer<typeof tagSchema>;

// Search schema
export const searchSchema = z.object({
  query: z.string().optional(),
  folder: z.string().optional(),
  tags: z.array(z.string()).optional(),
  teamId: z.string().optional(),
  limit: z.number().optional().default(20),
  offset: z.number().optional().default(0),
});

export type SearchParams = z.infer<typeof searchSchema>;

// Calendar events schema
export const calendarEvents = pgTable("calendar_events", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"),
  startTime: text("start_time"), // Optional time in HH:MM format (24-hour)
  endTime: text("end_time"), // Optional time in HH:MM format (24-hour)
  priority: integer("priority").notNull().default(1), // Priority 1-5
  teamId: text("team_id").notNull(), // team1, team2, etc.
  linkedPageId: integer("linked_page_id").references(() => wikiPages.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCalendarEventSchema = createInsertSchema(calendarEvents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateCalendarEventSchema = insertCalendarEventSchema.partial();

export type InsertCalendarEvent = z.infer<typeof insertCalendarEventSchema>;
export type UpdateCalendarEvent = z.infer<typeof updateCalendarEventSchema>;
export type CalendarEvent = typeof calendarEvents.$inferSelect;

// Directory management schema
export const directories = pgTable("directories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  displayName: text("display_name").notNull(),
  password: text("password"), // Optional password protection
  isVisible: boolean("is_visible").notNull().default(true),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertDirectorySchema = createInsertSchema(directories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateDirectorySchema = insertDirectorySchema.partial();

export type InsertDirectory = z.infer<typeof insertDirectorySchema>;
export type UpdateDirectory = z.infer<typeof updateDirectorySchema>;
export type Directory = typeof directories.$inferSelect;

// Comments schema
export const comments = pgTable("comments", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  author: text("author").notNull(), // Author name (will be enhanced with user system later)
  pageId: integer("page_id").notNull().references(() => wikiPages.id, { onDelete: "cascade" }),
  parentId: integer("parent_id"), // For nested replies - will be handled as foreign key later
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCommentSchema = createInsertSchema(comments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateCommentSchema = insertCommentSchema.partial();

export type InsertComment = z.infer<typeof insertCommentSchema>;
export type UpdateComment = z.infer<typeof updateCommentSchema>;
export type Comment = typeof comments.$inferSelect;

// Teams schema
export const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  password: text("password"), // 팀 접근 비밀번호
  icon: text("icon"), // Lucide icon name
  color: text("color"), // Tailwind color class
  isActive: boolean("is_active").notNull().default(true),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Members schema  
export const members = pgTable("members", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").notNull(), // 팀장, 개발자, 디자이너, PM 등
  teamId: integer("team_id").references(() => teams.id, { onDelete: "set null" }), // 팀 소속
  avatarUrl: text("avatar_url"), // 프로필 이미지 URL (선택)
  bio: text("bio"), // 자기소개 (선택)
  githubUsername: text("github_username"), // GitHub 사용자명 (선택)
  skills: text("skills").array().notNull().default([]), // 기술 스택 배열
  joinedDate: timestamp("joined_date").notNull().defaultNow(), // 팀 가입일
  isActive: boolean("is_active").notNull().default(true), // 활성 상태
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertMemberSchema = createInsertSchema(members).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateMemberSchema = insertMemberSchema.partial();

// Teams types and schemas
export const insertTeamSchema = createInsertSchema(teams).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateTeamSchema = insertTeamSchema.partial();

export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type UpdateTeam = z.infer<typeof updateTeamSchema>;
export type Team = typeof teams.$inferSelect;

export type InsertMember = z.infer<typeof insertMemberSchema>;
export type UpdateMember = z.infer<typeof updateMemberSchema>;
export type Member = typeof members.$inferSelect;

// Study progress & contribution stats schema
export const progressStats = pgTable("progress_stats", {
  id: serial("id").primaryKey(),
  teamId: text("team_id").notNull(), // 팀 구분
  memberId: integer("member_id").references(() => members.id, { onDelete: "cascade" }), // 멤버별(전체 통계는 null)
  pagesCreated: integer("pages_created").notNull().default(0),
  commentsWritten: integer("comments_written").notNull().default(0),
  tasksCompleted: integer("tasks_completed").notNull().default(0),
  lastActiveAt: timestamp("last_active_at"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Tasks schema for assignment tracking
export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("todo"), // todo, in_progress, review, done
  priority: integer("priority").notNull().default(3), // 1-5 (1: highest, 5: lowest)
  assignedTo: integer("assigned_to").references(() => members.id, { onDelete: "set null" }),
  teamId: text("team_id").notNull(), // team1, team2, etc.
  dueDate: timestamp("due_date"),
  estimatedHours: integer("estimated_hours"), // 예상 소요 시간
  actualHours: integer("actual_hours"), // 실제 소요 시간
  progress: integer("progress").notNull().default(0), // 0-100%
  tags: text("tags").array().notNull().default([]),
  linkedPageId: integer("linked_page_id").references(() => wikiPages.id, { onDelete: "set null" }),
  createdBy: integer("created_by").references(() => members.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertTaskSchema = createInsertSchema(tasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateTaskSchema = insertTaskSchema.partial();

export type InsertTask = z.infer<typeof insertTaskSchema>;
export type UpdateTask = z.infer<typeof updateTaskSchema>;
export type Task = typeof tasks.$inferSelect;

// Notifications schema
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // comment, mention, task_due, task_assigned
  title: text("title").notNull(),
  content: text("content").notNull(),
  recipientId: integer("recipient_id").notNull().references(() => members.id, { onDelete: "cascade" }),
  senderId: integer("sender_id").references(() => members.id, { onDelete: "set null" }),
  relatedPageId: integer("related_page_id").references(() => wikiPages.id, { onDelete: "cascade" }),
  relatedTaskId: integer("related_task_id").references(() => tasks.id, { onDelete: "cascade" }),
  relatedCommentId: integer("related_comment_id").references(() => comments.id, { onDelete: "cascade" }),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});

export const updateNotificationSchema = insertNotificationSchema.partial();

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type UpdateNotification = z.infer<typeof updateNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

// Template Categories schema
export const templateCategories = pgTable("template_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  icon: text("icon"), // Lucide icon name
  color: text("color"), // Tailwind color class
  order: integer("order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Templates schema
export const templates = pgTable("templates", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  content: text("content").notNull(), // Markdown content
  categoryId: integer("category_id").references(() => templateCategories.id, { onDelete: "cascade" }),
  tags: text("tags").array().notNull().default([]),
  author: text("author").notNull(),
  isPublic: boolean("is_public").notNull().default(true),
  usageCount: integer("usage_count").notNull().default(0),
  rating: integer("rating").notNull().default(0), // 1-5 stars
  thumbnail: text("thumbnail"), // Preview image URL
  metadata: jsonb("metadata").default({}), // Additional template data
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Template Categories types
export type TemplateCategory = typeof templateCategories.$inferSelect;
export type InsertTemplateCategory = typeof templateCategories.$inferInsert;
export type UpdateTemplateCategory = Partial<InsertTemplateCategory>;

// Template Categories schemas
export const insertTemplateCategorySchema = createInsertSchema(templateCategories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateTemplateCategorySchema = insertTemplateCategorySchema.partial();

// Templates schemas
export const insertTemplateSchema = createInsertSchema(templates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateTemplateSchema = insertTemplateSchema.partial();

// Templates types
export type Template = typeof templates.$inferSelect;
export type InsertTemplate = z.infer<typeof insertTemplateSchema>;
export type UpdateTemplate = z.infer<typeof updateTemplateSchema>;
