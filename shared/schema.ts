import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
  jsonb,
  varchar,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// Block types for the new block-based editor
export const blockTypes = [
  'heading1',
  'heading2',
  'heading3', // 제목 블록
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
  'callout', // ✨ 정보 강조 블록 (아이콘 + 색상)
  'embed', // ✨ 외부 콘텐츠 임베드 (YouTube, Figma, etc.)
  'math', // ✨ LaTeX 수식 블록
  'synced_block', // ✨ 동기화 블록
  'database_inline', // ✨ 데이터베이스 인라인 뷰
  'relation', // ✨ 관계형 필드
  'rollup', // ✨ 집계 필드
  'formula', // ✨ 계산 필드
] as const;

export type BlockType = (typeof blockTypes)[number];

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

export const wikiPages = pgTable('wiki_pages', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(),
  content: text('content').notNull(),
  blocks: jsonb('blocks').default([]), // New field for block-based content
  folder: text('folder').notNull(), // docs, ideas, members, logs, archive, team1, team2, etc.
  tags: text('tags').array().notNull().default([]),
  author: text('author').notNull(),
  parentId: integer('parent_id'), // Nested pages: reference to parent page
  teamId: integer('team_id').references(() => teams.id, { onDelete: 'set null' }), // 팀 소속
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  isPublished: boolean('is_published').notNull().default(true),
  metadata: jsonb('metadata').default({}), // for frontmatter data
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

// Page version history
export const pageVersions = pgTable('page_versions', {
  id: serial('id').primaryKey(),
  pageId: integer('page_id')
    .notNull()
    .references(() => wikiPages.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  content: text('content').notNull(),
  blocks: jsonb('blocks').default([]),
  author: text('author').notNull(),
  versionNumber: integer('version_number').notNull(),
  changeDescription: text('change_description'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertPageVersionSchema = createInsertSchema(pageVersions).omit({
  id: true,
  createdAt: true,
});

export type InsertPageVersion = z.infer<typeof insertPageVersionSchema>;
export type PageVersion = typeof pageVersions.$inferSelect;

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
  sort: z.enum(['rank', 'updated']).optional(),
  limit: z.number().optional().default(20),
  offset: z.number().optional().default(0),
});

export type SearchParams = z.infer<typeof searchSchema>;

// Calendar events schema
export const calendarEvents = pgTable('calendar_events', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date'),
  startTime: text('start_time'), // Optional time in HH:MM format (24-hour)
  endTime: text('end_time'), // Optional time in HH:MM format (24-hour)
  priority: integer('priority').notNull().default(1), // Priority 1-5
  teamId: text('team_id').notNull(), // team1, team2, etc.
  linkedPageId: integer('linked_page_id').references(() => wikiPages.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
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
export const directories = pgTable('directories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  displayName: text('display_name').notNull(),
  password: text('password'), // Optional password protection
  isVisible: boolean('is_visible').notNull().default(true),
  order: integer('order').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
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
export const comments = pgTable('comments', {
  id: serial('id').primaryKey(),
  content: text('content').notNull(),
  author: text('author').notNull(), // Author name (will be enhanced with user system later)
  pageId: integer('page_id')
    .notNull()
    .references(() => wikiPages.id, { onDelete: 'cascade' }),
  parentId: integer('parent_id'), // For nested replies - will be handled as foreign key later
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
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
export const teams = pgTable('teams', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  displayName: text('display_name').notNull(),
  description: text('description'),
  password: text('password'), // 팀 접근 비밀번호
  icon: text('icon'), // Lucide icon name
  color: text('color'), // Tailwind color class
  isActive: boolean('is_active').notNull().default(true),
  order: integer('order').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Members schema
export const members = pgTable('members', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  role: text('role').notNull(), // 팀장, 개발자, 디자이너, PM 등
  teamId: integer('team_id').references(() => teams.id, { onDelete: 'set null' }), // 팀 소속
  avatarUrl: text('avatar_url'), // 프로필 이미지 URL (선택)
  bio: text('bio'), // 자기소개 (선택)
  githubUsername: text('github_username'), // GitHub 사용자명 (선택)
  skills: text('skills').array().notNull().default([]), // 기술 스택 배열
  joinedDate: timestamp('joined_date').notNull().defaultNow(), // 팀 가입일
  isActive: boolean('is_active').notNull().default(true), // 활성 상태
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
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
export const progressStats = pgTable('progress_stats', {
  id: serial('id').primaryKey(),
  teamId: text('team_id').notNull(), // 팀 구분
  memberId: integer('member_id').references(() => members.id, { onDelete: 'cascade' }), // 멤버별(전체 통계는 null)
  pagesCreated: integer('pages_created').notNull().default(0),
  commentsWritten: integer('comments_written').notNull().default(0),
  tasksCompleted: integer('tasks_completed').notNull().default(0),
  lastActiveAt: timestamp('last_active_at'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Tasks schema for assignment tracking
export const tasks = pgTable('tasks', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull().default('todo'), // todo, in_progress, review, done
  priority: integer('priority').notNull().default(3), // 1-5 (1: highest, 5: lowest)
  assignedTo: integer('assigned_to').references(() => members.id, { onDelete: 'set null' }),
  teamId: text('team_id').notNull(), // team1, team2, etc.
  dueDate: timestamp('due_date'),
  estimatedHours: integer('estimated_hours'), // 예상 소요 시간
  actualHours: integer('actual_hours'), // 실제 소요 시간
  progress: integer('progress').notNull().default(0), // 0-100%
  tags: text('tags').array().notNull().default([]),
  linkedPageId: integer('linked_page_id').references(() => wikiPages.id, { onDelete: 'set null' }),
  createdBy: integer('created_by').references(() => members.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
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
export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  type: text('type').notNull(), // comment, mention, task_due, task_assigned
  title: text('title').notNull(),
  content: text('content').notNull(),
  recipientId: integer('recipient_id')
    .notNull()
    .references(() => members.id, { onDelete: 'cascade' }),
  senderId: integer('sender_id').references(() => members.id, { onDelete: 'set null' }),
  relatedPageId: integer('related_page_id').references(() => wikiPages.id, { onDelete: 'cascade' }),
  relatedTaskId: integer('related_task_id').references(() => tasks.id, { onDelete: 'cascade' }),
  relatedCommentId: integer('related_comment_id').references(() => comments.id, {
    onDelete: 'cascade',
  }),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
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
export const templateCategories = pgTable('template_categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  displayName: text('display_name').notNull(),
  description: text('description'),
  icon: text('icon'), // Lucide icon name
  color: text('color'), // Tailwind color class
  order: integer('order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Templates schema
export const templates = pgTable('templates', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  content: text('content').notNull(), // Markdown content
  categoryId: integer('category_id').references(() => templateCategories.id, {
    onDelete: 'cascade',
  }),
  tags: text('tags').array().notNull().default([]),
  author: text('author').notNull(),
  isPublic: boolean('is_public').notNull().default(true),
  usageCount: integer('usage_count').notNull().default(0),
  rating: integer('rating').notNull().default(0), // 1-5 stars
  thumbnail: text('thumbnail'), // Preview image URL
  metadata: jsonb('metadata').default({}), // Additional template data
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
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

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  hashedPassword: text('hashed_password'),
  provider: varchar('provider', { length: 50 }),
  providerId: varchar('provider_id', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Saved Views schema for customizable data views (table, kanban, calendar)
export const savedViews = pgTable('saved_views', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  viewType: text('view_type').notNull(), // table, kanban, calendar, list
  entityType: text('entity_type').notNull(), // tasks, pages, events
  teamId: integer('team_id').references(() => teams.id, { onDelete: 'cascade' }),
  createdBy: integer('created_by').references(() => members.id, { onDelete: 'set null' }),
  isDefault: boolean('is_default').notNull().default(false),
  isPublic: boolean('is_public').notNull().default(false), // Shared with team
  config: jsonb('config').notNull().default({}), // Filters, sorts, columns, grouping
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertSavedViewSchema = createInsertSchema(savedViews).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateSavedViewSchema = insertSavedViewSchema.partial();

export type InsertSavedView = z.infer<typeof insertSavedViewSchema>;
export type UpdateSavedView = z.infer<typeof updateSavedViewSchema>;
export type SavedView = typeof savedViews.$inferSelect;

// View configuration types
export interface ViewConfig {
  // Filters
  filters?: {
    field: string;
    operator: 'equals' | 'contains' | 'greater_than' | 'less_than' | 'in' | 'not_in';
    value: any;
  }[];

  // Sorting
  sorts?: {
    field: string;
    direction: 'asc' | 'desc';
  }[];

  // Column visibility (for table view)
  columns?: {
    field: string;
    visible: boolean;
    width?: number;
    order?: number;
  }[];

  // Grouping (for kanban view)
  groupBy?: string; // Field to group by (e.g., 'status', 'assignedTo', 'priority')

  // Calendar settings
  dateField?: string; // Field to use for calendar date

  // Display options
  displayOptions?: {
    showCompletedTasks?: boolean;
    cardFields?: string[]; // Fields to show on kanban cards
    colorBy?: string; // Field to use for color coding
  };
}

// ==================== Automation Workflows ====================

export const workflows = pgTable('workflows', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  teamId: integer('team_id').references(() => teams.id, { onDelete: 'cascade' }),
  isActive: boolean('is_active').notNull().default(true),
  trigger: jsonb('trigger').notNull(), // { type, config }
  actions: jsonb('actions').notNull(), // [{ type, config }]
  conditions: jsonb('conditions').default([]), // [{ field, operator, value }]
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const workflowRuns = pgTable('workflow_runs', {
  id: serial('id').primaryKey(),
  workflowId: integer('workflow_id')
    .notNull()
    .references(() => workflows.id, { onDelete: 'cascade' }),
  status: text('status').notNull(), // 'running', 'success', 'failed'
  triggerData: jsonb('trigger_data').notNull(), // Data that triggered the workflow
  results: jsonb('results').default([]), // Results from each action
  error: text('error'),
  startedAt: timestamp('started_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
});

export const insertWorkflowSchema = createInsertSchema(workflows).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateWorkflowSchema = insertWorkflowSchema.partial();

export type InsertWorkflow = z.infer<typeof insertWorkflowSchema>;
export type UpdateWorkflow = z.infer<typeof updateWorkflowSchema>;
export type Workflow = typeof workflows.$inferSelect;
export type WorkflowRun = typeof workflowRuns.$inferSelect;

// Workflow trigger types
export const triggerTypes = [
  'page_created',
  'page_updated',
  'page_deleted',
  'task_created',
  'task_status_changed',
  'task_assigned',
  'task_due_soon',
  'comment_added',
  'tag_added',
  'scheduled', // Cron-based trigger
] as const;

export type TriggerType = (typeof triggerTypes)[number];

// Workflow action types
export const actionTypes = [
  'send_notification',
  'create_task',
  'update_task',
  'send_email',
  'create_page',
  'add_comment',
  'add_tag',
  'assign_task',
  'move_page',
  'run_ai_summary',
  'webhook',
] as const;

export type ActionType = (typeof actionTypes)[number];

// Workflow trigger configuration
export interface WorkflowTrigger {
  type: TriggerType;
  config: {
    // For page/task triggers
    folder?: string;
    tags?: string[];

    // For scheduled triggers
    cron?: string; // e.g., "0 9 * * 1" for every Monday at 9am

    // For task_due_soon
    daysBeforeDue?: number;

    // For task_status_changed
    fromStatus?: string;
    toStatus?: string;
  };
}

// Workflow action configuration
export interface WorkflowAction {
  type: ActionType;
  config: {
    // For notifications
    message?: string;
    recipients?: string[]; // user IDs or emails

    // For task actions
    title?: string;
    description?: string;
    status?: string;
    priority?: string;
    assignedTo?: string;
    dueDate?: string;

    // For page actions
    folder?: string;
    content?: string;
    tags?: string[];

    // For AI actions
    prompt?: string;

    // For webhook
    url?: string;
    method?: 'GET' | 'POST' | 'PUT';
    headers?: Record<string, string>;
    body?: any;

    // Variable substitution support
    useVariables?: boolean; // {{trigger.title}}, {{trigger.author}}, etc.
  };
}

// Workflow condition
export interface WorkflowCondition {
  field: string; // e.g., 'trigger.priority', 'trigger.tags'
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'in' | 'not_in';
  value: any;
}

// ==================== Page Permissions & Sharing ====================

// Permission levels for pages
export const permissionLevels = ['owner', 'editor', 'viewer', 'commenter'] as const;
export type PermissionLevel = (typeof permissionLevels)[number];

// Entity types that can have permissions
export const entityTypes = ['user', 'team', 'public'] as const;
export type EntityType = (typeof entityTypes)[number];

// Page permissions table
export const pagePermissions = pgTable('page_permissions', {
  id: serial('id').primaryKey(),
  pageId: integer('page_id')
    .notNull()
    .references(() => wikiPages.id, { onDelete: 'cascade' }),
  entityType: text('entity_type').notNull(), // 'user', 'team', 'public'
  entityId: integer('entity_id'), // user_id or team_id (NULL for public)
  permission: text('permission').notNull(), // 'owner', 'editor', 'viewer', 'commenter'
  grantedBy: integer('granted_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertPagePermissionSchema = createInsertSchema(pagePermissions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updatePagePermissionSchema = insertPagePermissionSchema.partial();

export type InsertPagePermission = z.infer<typeof insertPagePermissionSchema>;
export type UpdatePagePermission = z.infer<typeof updatePagePermissionSchema>;
export type PagePermission = typeof pagePermissions.$inferSelect;

// Public/shared links table
export const publicLinks = pgTable('public_links', {
  id: serial('id').primaryKey(),
  pageId: integer('page_id')
    .notNull()
    .references(() => wikiPages.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  password: text('password'), // Optional bcrypt hash
  permission: text('permission').notNull().default('viewer'), // 'viewer', 'commenter', 'editor'
  expiresAt: timestamp('expires_at'),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  lastAccessedAt: timestamp('last_accessed_at'),
  accessCount: integer('access_count').notNull().default(0),
});

export const insertPublicLinkSchema = createInsertSchema(publicLinks).omit({
  id: true,
  createdAt: true,
  lastAccessedAt: true,
  accessCount: true,
});

export const updatePublicLinkSchema = insertPublicLinkSchema.partial();

export type InsertPublicLink = z.infer<typeof insertPublicLinkSchema>;
export type UpdatePublicLink = z.infer<typeof updatePublicLinkSchema>;
export type PublicLink = typeof publicLinks.$inferSelect;

// ==================== Advanced Block Types ====================

// Callout block configuration
export interface CalloutBlockProperties {
  icon?: string; // Emoji or Lucide icon name
  color?: 'blue' | 'yellow' | 'red' | 'green' | 'purple' | 'gray' | 'orange';
  content: string;
}

// Embed block configuration
export interface EmbedBlockProperties {
  url: string;
  provider?: 'youtube' | 'figma' | 'miro' | 'loom' | 'twitter' | 'codepen' | 'github' | 'generic';
  title?: string;
  thumbnail?: string;
  aspectRatio?: string; // e.g., '16:9', '4:3'
}

// Math block configuration
export interface MathBlockProperties {
  expression: string; // LaTeX expression
  displayMode?: 'inline' | 'block'; // inline or display mode
}

// Synced block configuration
export interface SyncedBlockProperties {
  originalBlockId?: string; // null if this is the original, otherwise ID of original
  syncedContent?: any[]; // Content to sync
}

// ==================== Database & Relation Fields ====================

// Database field types
export const databaseFieldTypes = [
  'text',
  'number',
  'select',
  'multi_select',
  'date',
  'checkbox',
  'url',
  'email',
  'phone',
  'file',
  'relation', // ⭐ Link to another database
  'rollup', // ⭐ Aggregate related data
  'formula', // ⭐ Computed field
  'created_time',
  'created_by',
  'last_edited_time',
  'last_edited_by',
] as const;

export type DatabaseFieldType = (typeof databaseFieldTypes)[number];

// Relation field configuration
export interface RelationFieldConfig {
  type: 'relation';
  targetSchemaId: number; // Target database schema ID
  relationshipType: 'one_to_many' | 'many_to_many';
  reverseProperty?: string; // Name in target database
}

// Rollup field configuration
export interface RollupFieldConfig {
  type: 'rollup';
  relationProperty: string; // Which relation to follow
  targetProperty: string; // Property to aggregate
  aggregation: 'count' | 'sum' | 'average' | 'min' | 'max' | 'first' | 'last' | 'unique';
}

// Formula field configuration
export interface FormulaFieldConfig {
  type: 'formula';
  expression: string; // e.g., "prop('Price') * prop('Quantity')"
  returnType: 'number' | 'text' | 'boolean' | 'date';
}

// Database field definition
export interface DatabaseField {
  name: string;
  type: DatabaseFieldType;
  config?: RelationFieldConfig | RollupFieldConfig | FormulaFieldConfig | any;
  required?: boolean;
  defaultValue?: any;
}

// Database schemas table
export const databaseSchemas = pgTable('database_schemas', {
  id: serial('id').primaryKey(),
  pageId: integer('page_id')
    .notNull()
    .references(() => wikiPages.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  fields: jsonb('fields').notNull().default([]), // Array of DatabaseField
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertDatabaseSchemaSchema = createInsertSchema(databaseSchemas).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateDatabaseSchemaSchema = insertDatabaseSchemaSchema.partial();

export type InsertDatabaseSchema = z.infer<typeof insertDatabaseSchemaSchema>;
export type UpdateDatabaseSchema = z.infer<typeof updateDatabaseSchemaSchema>;
export type DatabaseSchema = typeof databaseSchemas.$inferSelect;

// Database rows table
export const databaseRows = pgTable('database_rows', {
  id: serial('id').primaryKey(),
  schemaId: integer('schema_id')
    .notNull()
    .references(() => databaseSchemas.id, { onDelete: 'cascade' }),
  data: jsonb('data').notNull().default({}), // Row data as key-value pairs
  orderIndex: integer('order_index').notNull().default(0),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertDatabaseRowSchema = createInsertSchema(databaseRows).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateDatabaseRowSchema = insertDatabaseRowSchema.partial();

export type InsertDatabaseRow = z.infer<typeof insertDatabaseRowSchema>;
export type UpdateDatabaseRow = z.infer<typeof updateDatabaseRowSchema>;
export type DatabaseRow = typeof databaseRows.$inferSelect;

// Database relations table
export const databaseRelations = pgTable('database_relations', {
  id: serial('id').primaryKey(),
  fromSchemaId: integer('from_schema_id')
    .notNull()
    .references(() => databaseSchemas.id, { onDelete: 'cascade' }),
  fromRowId: integer('from_row_id')
    .notNull()
    .references(() => databaseRows.id, { onDelete: 'cascade' }),
  toSchemaId: integer('to_schema_id')
    .notNull()
    .references(() => databaseSchemas.id, { onDelete: 'cascade' }),
  toRowId: integer('to_row_id')
    .notNull()
    .references(() => databaseRows.id, { onDelete: 'cascade' }),
  propertyName: text('property_name').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertDatabaseRelationSchema = createInsertSchema(databaseRelations).omit({
  id: true,
  createdAt: true,
});

export type InsertDatabaseRelation = z.infer<typeof insertDatabaseRelationSchema>;
export type DatabaseRelation = typeof databaseRelations.$inferSelect;

// Synced blocks table
export const syncedBlocks = pgTable('synced_blocks', {
  id: serial('id').primaryKey(),
  originalBlockId: text('original_block_id').notNull().unique(),
  pageId: integer('page_id')
    .notNull()
    .references(() => wikiPages.id, { onDelete: 'cascade' }),
  content: jsonb('content').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertSyncedBlockSchema = createInsertSchema(syncedBlocks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSyncedBlock = z.infer<typeof insertSyncedBlockSchema>;
export type SyncedBlock = typeof syncedBlocks.$inferSelect;

// Synced block references table
export const syncedBlockReferences = pgTable('synced_block_references', {
  id: serial('id').primaryKey(),
  syncedBlockId: integer('synced_block_id')
    .notNull()
    .references(() => syncedBlocks.id, { onDelete: 'cascade' }),
  pageId: integer('page_id')
    .notNull()
    .references(() => wikiPages.id, { onDelete: 'cascade' }),
  blockId: text('block_id').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertSyncedBlockReferenceSchema = createInsertSchema(syncedBlockReferences).omit({
  id: true,
  createdAt: true,
});

export type InsertSyncedBlockReference = z.infer<typeof insertSyncedBlockReferenceSchema>;
export type SyncedBlockReference = typeof syncedBlockReferences.$inferSelect;
