import { wikiPages, type WikiPage, type InsertWikiPage, type UpdateWikiPage, type Tag, type SearchParams, type CalendarEvent, type InsertCalendarEvent, type UpdateCalendarEvent, type Directory, type InsertDirectory, type UpdateDirectory, calendarEvents, directories } from "../shared/schema.ts";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, like, and, sql, desc, asc } from "drizzle-orm";
import { Pool } from "pg";

export interface IStorage {
  // Wiki pages CRUD
  getWikiPage(id: number): Promise<WikiPage | undefined>;
  getWikiPageBySlug(slug: string): Promise<WikiPage | undefined>;
  createWikiPage(page: InsertWikiPage): Promise<WikiPage>;
  updateWikiPage(id: number, page: UpdateWikiPage): Promise<WikiPage | undefined>;
  deleteWikiPage(id: number): Promise<boolean>;
  
  // Search and filtering
  searchWikiPages(params: SearchParams): Promise<{ pages: WikiPage[]; total: number }>;
  getWikiPagesByFolder(folder: string): Promise<WikiPage[]>;
  getAllTags(): Promise<Tag[]>;
  
  // Folder operations
  getFolders(): Promise<string[]>;
  
  // Calendar events CRUD
  getCalendarEvents(teamId: string): Promise<CalendarEvent[]>;
  getCalendarEvent(id: number): Promise<CalendarEvent | undefined>;
  createCalendarEvent(event: InsertCalendarEvent): Promise<CalendarEvent>;
  updateCalendarEvent(id: number, event: UpdateCalendarEvent): Promise<CalendarEvent | undefined>;
  deleteCalendarEvent(id: number): Promise<boolean>;
  
  // Directory management
  getDirectories(): Promise<Directory[]>;
  getDirectory(id: number): Promise<Directory | undefined>;
  createDirectory(directory: InsertDirectory): Promise<Directory>;
  updateDirectory(id: number, directory: UpdateDirectory): Promise<Directory | undefined>;
  deleteDirectory(id: number): Promise<boolean>;
  verifyDirectoryPassword(directoryName: string, password: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private wikiPages: Map<number, WikiPage>;
  private calendarEvents: Map<number, CalendarEvent>;
  private directories: Map<number, Directory>;
  private currentId: number;
  private currentEventId: number;
  private currentDirectoryId: number;

  constructor() {
    this.wikiPages = new Map();
    this.calendarEvents = new Map();
    this.directories = new Map();
    this.currentId = 1;
    this.currentEventId = 1;
    this.currentDirectoryId = 1;
    this.initializeDefaultPages();
    this.initializeDefaultEvents();
    this.initializeDefaultDirectories();
  }

  private initializeDefaultPages() {
    // Initialize with some default pages for each folder
    const defaultPages: Omit<WikiPage, 'id'>[] = [
      {
        title: "Getting Started",
        slug: "getting-started",
        content: `# Getting Started

Welcome to Papyr.us, your modern wiki and documentation platform.

## Overview

Papyr.us is designed to help you organize and share knowledge effectively. Here's what you can do:

- Create and edit markdown-based documentation
- Organize content into folders (docs, ideas, members, logs, archive)
- Use team directories for collaborative workspaces
- Use tags to categorize and filter content
- Search across all your content

## Quick Start

1. Navigate through the sidebar to explore different sections
2. Use the search bar to find specific content
3. Click on any page to view or edit it
4. Use tags to filter content by topic
5. Teams can create their own workspaces in team directories

Start exploring and building your knowledge base!`,
        folder: "docs",
        tags: ["tutorial", "getting-started"],
        author: "System",
        createdAt: new Date(),
        updatedAt: new Date(),
        isPublished: true,
        metadata: {}
      },
      {
        title: "API Reference Guide",
        slug: "api-reference",
        content: `# API Reference Guide

This comprehensive guide covers all available API endpoints, authentication methods, and response formats for the Papyr.us platform.

## Authentication

The Papyr.us API uses token-based authentication to secure endpoints. You'll need to include your API token in the header of each request.

\`\`\`
Authorization: Bearer YOUR_API_TOKEN
Content-Type: application/json
\`\`\`

## Endpoints

### GET /api/pages

Retrieve a list of all pages in your wiki.

**Example Response:**
\`\`\`json
{
  "pages": [
    {
      "id": "page-1",
      "title": "Getting Started",
      "slug": "getting-started",
      "tags": ["tutorial", "beginner"],
      "created_at": "2024-03-01T10:00:00Z",
      "updated_at": "2024-03-15T14:30:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "per_page": 20
}
\`\`\`

### POST /api/pages

Create a new wiki page with markdown content and frontmatter metadata.

**Request Body:**
\`\`\`json
{
  "title": "New Page Title",
  "content": "# Page Content\\n\\nYour markdown content here...",
  "tags": ["documentation", "api"],
  "folder": "docs"
}
\`\`\`

## Rate Limiting

The API implements rate limiting to ensure fair usage. Each API key is limited to 1000 requests per hour.`,
        folder: "docs",
        tags: ["api", "reference", "documentation"],
        author: "System",
        createdAt: new Date(),
        updatedAt: new Date(),
        isPublished: true,
        metadata: {}
      },
      {
        title: "Project Ideas",
        slug: "project-ideas",
        content: `# Project Ideas

Collection of ideas and concepts for future development.

## New Features

- Mobile app for offline reading
- Advanced search with full-text indexing
- Real-time collaborative editing
- Integration with external tools (Slack, Discord)
- Advanced analytics and usage tracking

## Improvements

- Enhanced markdown editor with live preview
- Better file organization and tagging system
- Custom themes and branding options
- Export capabilities (PDF, EPUB, etc.)

## Community Features

- User comments and discussions
- Community-driven content curation
- Public wiki hosting options`,
        folder: "ideas",
        tags: ["brainstorming", "features", "roadmap"],
        author: "System",
        createdAt: new Date(),
        updatedAt: new Date(),
        isPublished: true,
        metadata: {}
      },
      {
        title: "Team Alpha Workspace",
        slug: "team-alpha-workspace",
        content: `# Team Alpha Workspace

Welcome to Team Alpha's dedicated workspace! Use this area to collaborate and organize your team's content.

## Current Projects

### Project Phoenix
- Status: In Development
- Lead: Sarah Chen
- Timeline: Q2 2024

### Database Migration
- Status: Planning
- Lead: Mike Rodriguez
- Timeline: Q1 2024

## Team Resources

### Meeting Notes
- Weekly standup notes
- Sprint planning documents
- Retrospective summaries

### Documentation
- Team processes and workflows
- Code standards and guidelines
- Deployment procedures

## Quick Links

- [Team Calendar](https://calendar.example.com/team-alpha)
- [Project Board](https://board.example.com/team-alpha)
- [Shared Drive](https://drive.example.com/team-alpha)

## Team Members

- Sarah Chen (Team Lead)
- Mike Rodriguez (Backend Developer)
- Lisa Wang (Frontend Developer)
- David Kim (Designer)`,
        folder: "team1",
        tags: ["team", "workspace", "collaboration", "projects"],
        author: "Sarah Chen",
        createdAt: new Date(),
        updatedAt: new Date(),
        isPublished: true,
        metadata: {}
      },
      {
        title: "Team Beta Guidelines",
        slug: "team-beta-guidelines",
        content: `# Team Beta Guidelines

## Working Guidelines

### Code Review Process
1. Create feature branch from main
2. Submit pull request with detailed description
3. Request review from at least 2 team members
4. Address feedback and get approval before merging

### Communication Standards
- Use Slack for quick questions
- Schedule meetings for complex discussions
- Document decisions in this wiki
- Update project status weekly

### Development Workflow
- Follow test-driven development (TDD)
- Write comprehensive documentation
- Use semantic commit messages
- Keep branches up to date with main

## Current Initiatives

### Performance Optimization
- Database query optimization
- Frontend bundle size reduction
- CDN implementation

### Security Enhancements
- Authentication system upgrade
- Data encryption improvements
- Vulnerability assessments

## Resources

### Tools We Use
- Visual Studio Code with extensions
- Docker for containerization
- Jest for testing
- GitHub Actions for CI/CD

### Learning Materials
- Internal training videos
- External course recommendations
- Technical blog posts
- Conference talk recordings`,
        folder: "team2",
        tags: ["team", "guidelines", "development", "processes"],
        author: "Alex Thompson",
        createdAt: new Date(),
        updatedAt: new Date(),
        isPublished: true,
        metadata: {}
      }
    ];

    defaultPages.forEach(page => {
      const id = this.currentId++;
      this.wikiPages.set(id, { ...page, id });
    });
  }

  async getWikiPage(id: number): Promise<WikiPage | undefined> {
    return this.wikiPages.get(id);
  }

  async getWikiPageBySlug(slug: string): Promise<WikiPage | undefined> {
    return Array.from(this.wikiPages.values()).find(page => page.slug === slug);
  }

  async createWikiPage(insertPage: InsertWikiPage): Promise<WikiPage> {
    const id = this.currentId++;
    const now = new Date();
    const page: WikiPage = {
      id,
      title: insertPage.title,
      slug: insertPage.slug,
      content: insertPage.content,
      folder: insertPage.folder,
      tags: insertPage.tags || [],
      author: insertPage.author,
      createdAt: now,
      updatedAt: now,
      isPublished: insertPage.isPublished ?? true,
      metadata: insertPage.metadata || {},
    };
    this.wikiPages.set(id, page);
    return page;
  }

  async updateWikiPage(id: number, updatePage: UpdateWikiPage): Promise<WikiPage | undefined> {
    const existingPage = this.wikiPages.get(id);
    if (!existingPage) return undefined;

    const updatedPage: WikiPage = {
      ...existingPage,
      ...updatePage,
      updatedAt: new Date(),
    };
    this.wikiPages.set(id, updatedPage);
    return updatedPage;
  }

  async deleteWikiPage(id: number): Promise<boolean> {
    return this.wikiPages.delete(id);
  }

  async searchWikiPages(params: SearchParams): Promise<{ pages: WikiPage[]; total: number }> {
    let pages = Array.from(this.wikiPages.values());

    // Filter by folder
    if (params.folder) {
      pages = pages.filter(page => page.folder === params.folder);
    }

    // Filter by tags
    if (params.tags && params.tags.length > 0) {
      pages = pages.filter(page => 
        params.tags!.some(tag => page.tags.includes(tag))
      );
    }

    // Search by query (title and content)
    if (params.query) {
      const query = params.query.toLowerCase();
      pages = pages.filter(page => 
        page.title.toLowerCase().includes(query) ||
        page.content.toLowerCase().includes(query)
      );
    }

    // Sort by updated date (newest first)
    pages.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    const total = pages.length;
    const offset = params.offset || 0;
    const limit = params.limit || 20;
    
    return {
      pages: pages.slice(offset, offset + limit),
      total
    };
  }

  async getWikiPagesByFolder(folder: string): Promise<WikiPage[]> {
    return Array.from(this.wikiPages.values())
      .filter(page => page.folder === folder)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async getAllTags(): Promise<Tag[]> {
    const tagCounts = new Map<string, number>();
    
    Array.from(this.wikiPages.values()).forEach(page => {
      page.tags.forEach(tag => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      });
    });

    return Array.from(tagCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }

  async getFolders(): Promise<string[]> {
    return ["docs", "ideas", "members", "logs", "archive", "team1", "team2"];
  }

  private initializeDefaultEvents() {
    // Sample calendar events for team1 and team2
    this.calendarEvents.set(1, {
      id: 1,
      title: "Project Phoenix Kickoff",
      description: "Initial planning meeting for Project Phoenix",
      startDate: new Date("2024-02-15T10:00:00Z"),
      endDate: new Date("2024-02-15T11:00:00Z"),
      teamId: "team1",
      linkedPageId: 4, // Link to Team Alpha Workspace
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    this.calendarEvents.set(2, {
      id: 2,
      title: "Code Review Session",
      description: "Weekly code review and discussion",
      startDate: new Date("2024-02-20T14:00:00Z"),
      endDate: new Date("2024-02-20T15:30:00Z"),
      teamId: "team2",
      linkedPageId: 5, // Link to Team Beta Guidelines
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    this.currentEventId = 3;
  }

  // Calendar events CRUD methods
  async getCalendarEvents(teamId: string): Promise<CalendarEvent[]> {
    return Array.from(this.calendarEvents.values())
      .filter(event => event.teamId === teamId)
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  }

  async getCalendarEvent(id: number): Promise<CalendarEvent | undefined> {
    return this.calendarEvents.get(id);
  }

  async createCalendarEvent(insertEvent: InsertCalendarEvent): Promise<CalendarEvent> {
    const id = this.currentEventId++;
    const now = new Date();
    const event: CalendarEvent = {
      id,
      title: insertEvent.title,
      description: insertEvent.description || null,
      startDate: insertEvent.startDate,
      endDate: insertEvent.endDate || null,
      teamId: insertEvent.teamId,
      linkedPageId: insertEvent.linkedPageId || null,
      createdAt: now,
      updatedAt: now,
    };
    this.calendarEvents.set(id, event);
    return event;
  }

  async updateCalendarEvent(id: number, updateEvent: UpdateCalendarEvent): Promise<CalendarEvent | undefined> {
    const existingEvent = this.calendarEvents.get(id);
    if (!existingEvent) return undefined;

    const updatedEvent: CalendarEvent = {
      ...existingEvent,
      ...updateEvent,
      updatedAt: new Date(),
    };
    this.calendarEvents.set(id, updatedEvent);
    return updatedEvent;
  }

  async deleteCalendarEvent(id: number): Promise<boolean> {
    return this.calendarEvents.delete(id);
  }

  private initializeDefaultDirectories() {
    // Initialize default directories
    const defaultDirs = [
      { name: "docs", displayName: "Documentation", order: 1 },
      { name: "ideas", displayName: "Ideas", order: 2 },
      { name: "members", displayName: "Members", order: 3 },
      { name: "logs", displayName: "Logs", order: 4 },
      { name: "archive", displayName: "Archive", order: 5 },
      { name: "team1", displayName: "Team Alpha", order: 6 },
      { name: "team2", displayName: "Team Beta", order: 7 },
    ];

    defaultDirs.forEach(dir => {
      const id = this.currentDirectoryId++;
      this.directories.set(id, {
        id,
        name: dir.name,
        displayName: dir.displayName,
        password: null,
        isVisible: true,
        order: dir.order,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });
  }

  // Directory management methods
  async getDirectories(): Promise<Directory[]> {
    return Array.from(this.directories.values())
      .filter(dir => dir.isVisible)
      .sort((a, b) => a.order - b.order);
  }

  async getDirectory(id: number): Promise<Directory | undefined> {
    return this.directories.get(id);
  }

  async createDirectory(insertDirectory: InsertDirectory): Promise<Directory> {
    const id = this.currentDirectoryId++;
    const now = new Date();
    const directory: Directory = {
      id,
      name: insertDirectory.name,
      displayName: insertDirectory.displayName,
      password: insertDirectory.password || null,
      isVisible: insertDirectory.isVisible ?? true,
      order: insertDirectory.order || 999,
      createdAt: now,
      updatedAt: now,
    };
    this.directories.set(id, directory);
    return directory;
  }

  async updateDirectory(id: number, updateDirectory: UpdateDirectory): Promise<Directory | undefined> {
    const existingDirectory = this.directories.get(id);
    if (!existingDirectory) return undefined;

    const updatedDirectory: Directory = {
      ...existingDirectory,
      ...updateDirectory,
      updatedAt: new Date(),
    };
    this.directories.set(id, updatedDirectory);
    return updatedDirectory;
  }

  async deleteDirectory(id: number): Promise<boolean> {
    return this.directories.delete(id);
  }

  async verifyDirectoryPassword(directoryName: string, password: string): Promise<boolean> {
    const directory = Array.from(this.directories.values())
      .find(dir => dir.name === directoryName);
    
    if (!directory || !directory.password) return true; // No password required
    return directory.password === password;
  }
}

// PostgreSQL-based storage implementation
export class DBStorage implements IStorage {
  private db: any;

  constructor() {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required for database storage");
    }
    
    // Use node-postgres for PostgreSQL connection
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
    this.db = drizzle(pool);
  }

  // Wiki pages CRUD
  async getWikiPage(id: number): Promise<WikiPage | undefined> {
    const result = await this.db.select().from(wikiPages).where(eq(wikiPages.id, id)).limit(1);
    return result[0] || undefined;
  }

  async getWikiPageBySlug(slug: string): Promise<WikiPage | undefined> {
    const result = await this.db.select().from(wikiPages).where(eq(wikiPages.slug, slug)).limit(1);
    return result[0] || undefined;
  }

  async createWikiPage(insertPage: InsertWikiPage): Promise<WikiPage> {
    const result = await this.db.insert(wikiPages).values(insertPage).returning();
    return result[0];
  }

  async updateWikiPage(id: number, updatePage: UpdateWikiPage): Promise<WikiPage | undefined> {
    const result = await this.db
      .update(wikiPages)
      .set({ ...updatePage, updatedAt: new Date() })
      .where(eq(wikiPages.id, id))
      .returning();
    return result[0] || undefined;
  }

  async deleteWikiPage(id: number): Promise<boolean> {
    const result = await this.db.delete(wikiPages).where(eq(wikiPages.id, id));
    return result.rowCount > 0;
  }

  async searchWikiPages(params: SearchParams): Promise<{ pages: WikiPage[]; total: number }> {
    let query = this.db.select().from(wikiPages);
    let conditions = [];

    // Apply filters
    if (params.folder) {
      conditions.push(eq(wikiPages.folder, params.folder));
    }

    if (params.query) {
      const searchTerm = `%${params.query.toLowerCase()}%`;
      conditions.push(
        sql`(lower(${wikiPages.title}) LIKE ${searchTerm} OR lower(${wikiPages.content}) LIKE ${searchTerm})`
      );
    }

    if (params.tags && params.tags.length > 0) {
      conditions.push(sql`${wikiPages.tags} && ${params.tags}`);
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    // Get total count
    const totalResult = await query.execute();
    const total = totalResult.length;

    // Apply pagination and ordering
    const pages = await query
      .orderBy(desc(wikiPages.updatedAt))
      .limit(params.limit || 20)
      .offset(params.offset || 0)
      .execute();

    return { pages, total };
  }

  async getWikiPagesByFolder(folder: string): Promise<WikiPage[]> {
    return await this.db
      .select()
      .from(wikiPages)
      .where(eq(wikiPages.folder, folder))
      .orderBy(desc(wikiPages.updatedAt))
      .execute();
  }

  async getAllTags(): Promise<Tag[]> {
    const result = await this.db
      .select({
        tag: sql`unnest(${wikiPages.tags})`.as('tag'),
        count: sql`count(*)`.as('count')
      })
      .from(wikiPages)
      .groupBy(sql`unnest(${wikiPages.tags})`)
      .orderBy(desc(sql`count(*)`))
      .execute();

    return result.map((row: any) => ({ name: row.tag, count: Number(row.count) }));
  }

  async getFolders(): Promise<string[]> {
    const result = await this.db
      .selectDistinct({ folder: wikiPages.folder })
      .from(wikiPages)
      .execute();
    return result.map((row: any) => row.folder);
  }

  // Calendar events CRUD
  async getCalendarEvents(teamId: string): Promise<CalendarEvent[]> {
    return await this.db
      .select()
      .from(calendarEvents)
      .where(eq(calendarEvents.teamId, teamId))
      .orderBy(asc(calendarEvents.startDate))
      .execute();
  }

  async getCalendarEvent(id: number): Promise<CalendarEvent | undefined> {
    const result = await this.db.select().from(calendarEvents).where(eq(calendarEvents.id, id)).limit(1);
    return result[0] || undefined;
  }

  async createCalendarEvent(insertEvent: InsertCalendarEvent): Promise<CalendarEvent> {
    const result = await this.db.insert(calendarEvents).values(insertEvent).returning();
    return result[0];
  }

  async updateCalendarEvent(id: number, updateEvent: UpdateCalendarEvent): Promise<CalendarEvent | undefined> {
    const result = await this.db
      .update(calendarEvents)
      .set({ ...updateEvent, updatedAt: new Date() })
      .where(eq(calendarEvents.id, id))
      .returning();
    return result[0] || undefined;
  }

  async deleteCalendarEvent(id: number): Promise<boolean> {
    const result = await this.db.delete(calendarEvents).where(eq(calendarEvents.id, id));
    return result.rowCount > 0;
  }

  // Directory management
  async getDirectories(): Promise<Directory[]> {
    return await this.db
      .select()
      .from(directories)
      .where(eq(directories.isVisible, true))
      .orderBy(asc(directories.order))
      .execute();
  }

  async getDirectory(id: number): Promise<Directory | undefined> {
    const result = await this.db.select().from(directories).where(eq(directories.id, id)).limit(1);
    return result[0] || undefined;
  }

  async createDirectory(insertDirectory: InsertDirectory): Promise<Directory> {
    const result = await this.db.insert(directories).values(insertDirectory).returning();
    return result[0];
  }

  async updateDirectory(id: number, updateDirectory: UpdateDirectory): Promise<Directory | undefined> {
    const result = await this.db
      .update(directories)
      .set({ ...updateDirectory, updatedAt: new Date() })
      .where(eq(directories.id, id))
      .returning();
    return result[0] || undefined;
  }

  async deleteDirectory(id: number): Promise<boolean> {
    const result = await this.db.delete(directories).where(eq(directories.id, id));
    return result.rowCount > 0;
  }

  async verifyDirectoryPassword(directoryName: string, password: string): Promise<boolean> {
    const result = await this.db
      .select()
      .from(directories)
      .where(eq(directories.name, directoryName))
      .limit(1);
    
    const directory = result[0];
    if (!directory || !directory.password) return true; // No password required
    return directory.password === password;
  }
}

// Choose storage implementation based on environment
function createStorage(): IStorage {
  if (process.env.DATABASE_URL) {
    console.log("Using PostgreSQL database storage");
    return new DBStorage();
  } else {
    console.log("Using in-memory storage");
    return new MemStorage();
  }
}

export const storage = createStorage();
