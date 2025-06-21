import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const wikiPages = pgTable("wiki_pages", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  content: text("content").notNull(),
  folder: text("folder").notNull(), // docs, ideas, members, logs, archive, team1, team2, etc.
  tags: text("tags").array().notNull().default([]),
  author: text("author").notNull(),
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
