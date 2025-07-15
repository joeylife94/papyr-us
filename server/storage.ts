import { wikiPages, type WikiPage, type InsertWikiPage, type UpdateWikiPage, type Tag, type SearchParams, type CalendarEvent, type InsertCalendarEvent, type UpdateCalendarEvent, type Directory, type InsertDirectory, type UpdateDirectory, type Comment, type InsertComment, type UpdateComment, type Member, type InsertMember, type UpdateMember, type Task, type InsertTask, type UpdateTask, type Notification, type InsertNotification, type UpdateNotification, calendarEvents, directories, comments, members, tasks, notifications } from "../shared/schema.ts";
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
  
  // Comments CRUD
  getCommentsByPageId(pageId: number): Promise<Comment[]>;
  getComment(id: number): Promise<Comment | undefined>;
  createComment(comment: InsertComment): Promise<Comment>;
  updateComment(id: number, comment: UpdateComment): Promise<Comment | undefined>;
  deleteComment(id: number): Promise<boolean>;
  
  // Members CRUD
  getMembers(): Promise<Member[]>;
  getMember(id: number): Promise<Member | undefined>;
  getMemberByEmail(email: string): Promise<Member | undefined>;
  createMember(member: InsertMember): Promise<Member>;
  updateMember(id: number, member: UpdateMember): Promise<Member | undefined>;
  deleteMember(id: number): Promise<boolean>;
  
  // Dashboard & Progress Stats
  getTeamProgressStats(teamId: string): Promise<any[]>;
  getMemberProgressStats(memberId: number): Promise<any | undefined>;
  updateProgressStats(teamId: string, memberId: number | null, type: 'page' | 'comment' | 'task'): Promise<void>;
  getDashboardOverview(): Promise<any>;
  
  // Tasks CRUD
  getTasks(teamId?: string, status?: string): Promise<Task[]>;
  getTask(id: number): Promise<Task | undefined>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: number, task: UpdateTask): Promise<Task | undefined>;
  deleteTask(id: number): Promise<boolean>;
  updateTaskProgress(id: number, progress: number): Promise<Task | undefined>;
  
  // Notifications CRUD
  getNotifications(recipientId: number): Promise<Notification[]>;
  getNotification(id: number): Promise<Notification | undefined>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  updateNotification(id: number, notification: UpdateNotification): Promise<Notification | undefined>;
  deleteNotification(id: number): Promise<boolean>;
  markNotificationAsRead(id: number): Promise<Notification | undefined>;
  markAllNotificationsAsRead(recipientId: number): Promise<void>;
  getUnreadNotificationCount(recipientId: number): Promise<number>;
}

export class MemStorage implements IStorage {
  private wikiPages: Map<number, WikiPage>;
  private calendarEvents: Map<number, CalendarEvent>;
  private directories: Map<number, Directory>;
  private comments: Map<number, Comment>;
  private members: Map<number, Member>;
  private tasks: Map<number, Task>;
  private notifications: Map<number, Notification>;
  private currentId: number;
  private currentEventId: number;
  private currentDirectoryId: number;
  private currentCommentId: number;
  private currentMemberId: number;
  private currentTaskId: number;
  private currentNotificationId: number;

  constructor() {
    this.wikiPages = new Map();
    this.calendarEvents = new Map();
    this.directories = new Map();
    this.comments = new Map();
    this.members = new Map();
    this.tasks = new Map();
    this.notifications = new Map();
    this.currentId = 1;
    this.currentEventId = 1;
    this.currentDirectoryId = 1;
    this.currentCommentId = 1;
    this.currentMemberId = 1;
    this.currentTaskId = 1;
    this.currentNotificationId = 1;
    this.initializeDefaultPages();
    this.initializeDefaultEvents();
    this.initializeDefaultDirectories();
    this.initializeDefaultMembers();
    this.initializeDefaultTasks();
    this.initializeDefaultNotifications();
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
      startTime: "10:00",
      endTime: "11:00",
      priority: 3,
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
      startTime: "14:00",
      endTime: "15:30",
      priority: 2,
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
      startTime: insertEvent.startTime || null,
      endTime: insertEvent.endTime || null,
      priority: insertEvent.priority || 1,
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

  // Comments CRUD
  async getCommentsByPageId(pageId: number): Promise<Comment[]> {
    return Array.from(this.comments.values())
      .filter(comment => comment.pageId === pageId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async getComment(id: number): Promise<Comment | undefined> {
    return this.comments.get(id);
  }

  async createComment(insertComment: InsertComment): Promise<Comment> {
    const id = this.currentCommentId++;
    const comment: Comment = {
      id,
      ...insertComment,
      parentId: insertComment.parentId || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.comments.set(id, comment);
    return comment;
  }

  async updateComment(id: number, updateComment: UpdateComment): Promise<Comment | undefined> {
    const existing = this.comments.get(id);
    if (!existing) return undefined;

    const updated: Comment = {
      ...existing,
      ...updateComment,
      updatedAt: new Date(),
    };
    this.comments.set(id, updated);
    return updated;
  }

  async deleteComment(id: number): Promise<boolean> {
    return this.comments.delete(id);
  }

  // Members methods
  private initializeDefaultMembers() {
    // Initialize with some default team members
    const defaultMembers: Omit<Member, 'id' | 'createdAt' | 'updatedAt'>[] = [
      {
        name: "바이브코딩 팀장",
        email: "leader@vibecoding.com",
        role: "팀장",
        avatarUrl: "https://github.com/identicons/leader.png",
        bio: "바이브코딩 스터디를 이끌어가는 팀장입니다. 풀스택 개발과 팀 관리에 열정을 가지고 있습니다.",
        githubUsername: "vibecoding-leader", 
        skills: ["React", "Node.js", "PostgreSQL", "TypeScript", "Docker"],
        joinedDate: new Date("2024-01-01"),
        isActive: true,
      },
      {
        name: "Frontend 개발자 A",
        email: "frontend-a@vibecoding.com",
        role: "프론트엔드 개발자",
        avatarUrl: "https://github.com/identicons/frontend-a.png",
        bio: "사용자 경험에 중점을 둔 프론트엔드 개발자입니다. React와 TypeScript를 주로 사용합니다.",
        githubUsername: "frontend-developer-a",
        skills: ["React", "TypeScript", "CSS", "HTML", "Figma"],
        joinedDate: new Date("2024-01-15"),
        isActive: true,
      },
      {
        name: "Backend 개발자 B", 
        email: "backend-b@vibecoding.com",
        role: "백엔드 개발자",
        avatarUrl: "https://github.com/identicons/backend-b.png",
        bio: "서버 아키텍처와 API 설계에 관심이 많은 백엔드 개발자입니다.",
        githubUsername: "backend-developer-b",
        skills: ["Node.js", "Express", "PostgreSQL", "Docker", "AWS"],
        joinedDate: new Date("2024-02-01"),
        isActive: true,
      }
    ];

    defaultMembers.forEach(memberData => {
      const member: Member = {
        id: this.currentMemberId++,
        ...memberData,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.members.set(member.id, member);
    });
  }

  async getMembers(): Promise<Member[]> {
    return Array.from(this.members.values()).filter(member => member.isActive);
  }

  async getMember(id: number): Promise<Member | undefined> {
    return this.members.get(id);
  }

  async getMemberByEmail(email: string): Promise<Member | undefined> {
    return Array.from(this.members.values()).find(member => member.email === email);
  }

  async createMember(insertMember: InsertMember): Promise<Member> {
    const id = this.currentMemberId++;
    const now = new Date();
    const member: Member = {
      id,
      name: insertMember.name,
      email: insertMember.email,
      role: insertMember.role,
      avatarUrl: insertMember.avatarUrl || null,
      bio: insertMember.bio || null,
      githubUsername: insertMember.githubUsername || null,
      skills: insertMember.skills || [],
      joinedDate: insertMember.joinedDate || now,
      isActive: insertMember.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.members.set(id, member);
    return member;
  }

  async updateMember(id: number, updateMember: UpdateMember): Promise<Member | undefined> {
    const existingMember = this.members.get(id);
    if (!existingMember) return undefined;

    const updated: Member = {
      ...existingMember,
      ...updateMember,
      updatedAt: new Date(),
    };
    this.members.set(id, updated);
    return updated;
  }

  async deleteMember(id: number): Promise<boolean> {
    return this.members.delete(id);
  }

  // Dashboard & Progress Stats (MemStorage implementation)
  async getTeamProgressStats(teamId: string): Promise<any[]> {
    // Mock data for memory storage
    const mockStats = [
      {
        id: 1,
        teamId: "team1",
        memberId: null,
        pagesCreated: 15,
        commentsWritten: 25,
        tasksCompleted: 8,
        lastActiveAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 2,
        teamId: "team2", 
        memberId: null,
        pagesCreated: 12,
        commentsWritten: 18,
        tasksCompleted: 6,
        lastActiveAt: new Date(),
        updatedAt: new Date()
      }
    ];
    
    return mockStats.filter(stat => stat.teamId === teamId);
  }

  async getMemberProgressStats(memberId: number): Promise<any | undefined> {
    // Mock data for memory storage
    const mockMemberStats = [
      {
        id: 3,
        teamId: "team1",
        memberId: 1,
        pagesCreated: 8,
        commentsWritten: 12,
        tasksCompleted: 4,
        lastActiveAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 4,
        teamId: "team1",
        memberId: 2,
        pagesCreated: 5,
        commentsWritten: 8,
        tasksCompleted: 2,
        lastActiveAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 5,
        teamId: "team2",
        memberId: 3,
        pagesCreated: 7,
        commentsWritten: 10,
        tasksCompleted: 3,
        lastActiveAt: new Date(),
        updatedAt: new Date()
      }
    ];
    
    return mockMemberStats.find(stat => stat.memberId === memberId);
  }

  async updateProgressStats(teamId: string, memberId: number | null, type: 'page' | 'comment' | 'task'): Promise<void> {
    // In memory storage, we don't persist progress stats updates
    // This would be implemented in a real scenario
    console.log(`Progress stats updated: Team ${teamId}, Member ${memberId}, Type ${type}`);
  }

  async getDashboardOverview(): Promise<any> {
    // Mock dashboard overview data
    return {
      totalPages: 27,
      totalComments: 43,
      totalMembers: 3, // Add totalMembers field
      totalTasks: 14,
      activeTeams: 2,
      recentActivity: [
        { type: 'page', title: 'API Reference Guide', author: '바이브코딩 팀장', time: new Date() },
        { type: 'comment', content: '좋은 문서네요!', author: 'Frontend 개발자 A', time: new Date() },
        { type: 'task', title: '데이터베이스 마이그레이션', author: 'Backend 개발자 B', time: new Date() }
      ],
      teamStats: [
        { teamId: 'team1', name: 'Team Alpha', pages: 15, comments: 25, tasks: 8 },
        { teamId: 'team2', name: 'Team Beta', pages: 12, comments: 18, tasks: 6 }
      ]
    };
  }

  // Tasks methods
  private initializeDefaultTasks() {
    // Initialize with some default tasks
    const defaultTasks: Omit<Task, 'id'>[] = [
      {
        title: "프로젝트 기획서 작성",
        description: "새로운 기능 개발을 위한 상세 기획서 작성",
        status: "in_progress",
        priority: 1,
        assignedTo: 1, // 바이브코딩 팀장
        teamId: "team1",
        dueDate: new Date("2024-02-15"),
        estimatedHours: 8,
        actualHours: 4,
        progress: 50,
        tags: ["기획", "문서화"],
        linkedPageId: null,
        createdBy: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        title: "UI 컴포넌트 개발",
        description: "재사용 가능한 UI 컴포넌트 라이브러리 구축",
        status: "todo",
        priority: 2,
        assignedTo: 2, // Frontend 개발자 A
        teamId: "team1",
        dueDate: new Date("2024-02-20"),
        estimatedHours: 16,
        actualHours: 0,
        progress: 0,
        tags: ["프론트엔드", "UI/UX"],
        linkedPageId: null,
        createdBy: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        title: "API 엔드포인트 구현",
        description: "백엔드 API 엔드포인트 개발 및 테스트",
        status: "todo",
        priority: 2,
        assignedTo: 3, // Backend 개발자 B
        teamId: "team2",
        dueDate: new Date("2024-02-25"),
        estimatedHours: 12,
        actualHours: 0,
        progress: 0,
        tags: ["백엔드", "API"],
        linkedPageId: null,
        createdBy: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    defaultTasks.forEach(task => {
      this.tasks.set(this.currentTaskId, { ...task, id: this.currentTaskId });
      this.currentTaskId++;
    });
  }

  async getTasks(teamId?: string, status?: string): Promise<Task[]> {
    let filteredTasks = Array.from(this.tasks.values());
    
    if (teamId) {
      filteredTasks = filteredTasks.filter(task => task.teamId === teamId);
    }
    
    if (status) {
      filteredTasks = filteredTasks.filter(task => task.status === status);
    }
    
    return filteredTasks.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getTask(id: number): Promise<Task | undefined> {
    return this.tasks.get(id);
  }

  async createTask(insertTask: InsertTask): Promise<Task> {
    const id = this.currentTaskId++;
    const now = new Date();
    const task: Task = {
      id,
      title: insertTask.title,
      description: insertTask.description || null,
      status: insertTask.status || "todo",
      priority: insertTask.priority || 3,
      assignedTo: insertTask.assignedTo || null,
      teamId: insertTask.teamId,
      dueDate: insertTask.dueDate || null,
      estimatedHours: insertTask.estimatedHours || null,
      actualHours: insertTask.actualHours || null,
      progress: insertTask.progress || 0,
      tags: insertTask.tags || [],
      linkedPageId: insertTask.linkedPageId || null,
      createdBy: insertTask.createdBy || null,
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.set(id, task);
    return task;
  }

  async updateTask(id: number, updateTask: UpdateTask): Promise<Task | undefined> {
    const existingTask = this.tasks.get(id);
    if (!existingTask) return undefined;

    const updated: Task = {
      ...existingTask,
      ...updateTask,
      updatedAt: new Date(),
    };
    this.tasks.set(id, updated);
    return updated;
  }

  async deleteTask(id: number): Promise<boolean> {
    return this.tasks.delete(id);
  }

  async updateTaskProgress(id: number, progress: number): Promise<Task | undefined> {
    const existingTask = this.tasks.get(id);
    if (!existingTask) return undefined;

    const updated: Task = {
      ...existingTask,
      progress: Math.max(0, Math.min(100, progress)), // Ensure progress is between 0-100
      updatedAt: new Date(),
    };
    this.tasks.set(id, updated);
    return updated;
  }

  // Notifications methods
  private initializeDefaultNotifications() {
    // Initialize with some default notifications
    const defaultNotifications: Omit<Notification, 'id'>[] = [
      {
        type: 'comment',
        title: '새 댓글이 작성되었습니다',
        content: 'API Reference Guide 페이지에 새 댓글이 작성되었습니다.',
        recipientId: 1,
        senderId: 2,
        relatedPageId: 2,
        relatedCommentId: null,
        relatedTaskId: null,
        isRead: false,
        createdAt: new Date()
      },
      {
        type: 'mention',
        title: '멘션되었습니다',
        content: '프로젝트 기획서 작성 과제에서 멘션되었습니다.',
        recipientId: 2,
        senderId: 1,
        relatedPageId: null,
        relatedCommentId: null,
        relatedTaskId: 1,
        isRead: false,
        createdAt: new Date()
      },
      {
        type: 'task_due',
        title: '과제 마감일 임박',
        content: 'UI 컴포넌트 개발 과제의 마감일이 3일 남았습니다.',
        recipientId: 2,
        senderId: null,
        relatedPageId: null,
        relatedCommentId: null,
        relatedTaskId: 2,
        isRead: true,
        createdAt: new Date()
      }
    ];

    defaultNotifications.forEach(notification => {
      this.notifications.set(this.currentNotificationId, { ...notification, id: this.currentNotificationId });
      this.currentNotificationId++;
    });
  }

  async getNotifications(recipientId: number): Promise<Notification[]> {
    return Array.from(this.notifications.values())
      .filter(notification => notification.recipientId === recipientId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getNotification(id: number): Promise<Notification | undefined> {
    return this.notifications.get(id);
  }

  async createNotification(insertNotification: InsertNotification): Promise<Notification> {
    const id = this.currentNotificationId++;
    const now = new Date();
    const notification: Notification = {
      id,
      type: insertNotification.type,
      title: insertNotification.title,
      content: insertNotification.content,
      recipientId: insertNotification.recipientId,
      senderId: insertNotification.senderId || null,
      relatedPageId: insertNotification.relatedPageId || null,
      relatedTaskId: insertNotification.relatedTaskId || null,
      relatedCommentId: insertNotification.relatedCommentId || null,
      isRead: false,
      createdAt: now,
    };
    this.notifications.set(id, notification);
    return notification;
  }

  async updateNotification(id: number, updateNotification: UpdateNotification): Promise<Notification | undefined> {
    const existingNotification = this.notifications.get(id);
    if (!existingNotification) return undefined;

    const updated: Notification = {
      ...existingNotification,
      ...updateNotification,
    };
    this.notifications.set(id, updated);
    return updated;
  }

  async deleteNotification(id: number): Promise<boolean> {
    return this.notifications.delete(id);
  }

  async markNotificationAsRead(id: number): Promise<Notification | undefined> {
    const existingNotification = this.notifications.get(id);
    if (!existingNotification) return undefined;

    const updated: Notification = {
      ...existingNotification,
      isRead: true,
    };
    this.notifications.set(id, updated);
    return updated;
  }

  async markAllNotificationsAsRead(recipientId: number): Promise<void> {
    Array.from(this.notifications.values())
      .filter(notification => notification.recipientId === recipientId && !notification.isRead)
      .forEach(notification => {
        this.notifications.set(notification.id, { ...notification, isRead: true });
      });
  }

  async getUnreadNotificationCount(recipientId: number): Promise<number> {
    return Array.from(this.notifications.values())
      .filter(notification => notification.recipientId === recipientId && !notification.isRead)
      .length;
  }
}

// PostgreSQL-based storage implementation
export class DBStorage implements IStorage {
  private db: any;
  private pool: Pool;

  constructor() {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required for database storage");
    }
    
    // Use node-postgres for PostgreSQL connection
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
    this.db = drizzle(this.pool);
    
    // Initialize database tables
    this.initializeTables();
  }

  private async initializeTables() {
    try {
      // Check if comments table exists
      const checkTableQuery = `
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'comments'
        );
      `;
      
      const checkResult = await this.pool.query(checkTableQuery);
      const tableExists = checkResult.rows[0].exists;
      
      if (!tableExists) {
        console.log("🚀 Creating comments table...");
        
        // Create comments table
        const createTableQuery = `
          CREATE TABLE comments (
            id SERIAL PRIMARY KEY,
            content TEXT NOT NULL,
            author TEXT NOT NULL,
            page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
            parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          );
        `;

        await this.pool.query(createTableQuery);
        console.log("✅ Comments table created successfully!");

        // Create indexes for better performance
        const createIndexQueries = [
          "CREATE INDEX idx_comments_page_id ON comments(page_id);",
          "CREATE INDEX idx_comments_parent_id ON comments(parent_id);",
          "CREATE INDEX idx_comments_created_at ON comments(created_at);"
        ];

        for (const query of createIndexQueries) {
          await this.pool.query(query);
        }
        console.log("✅ Comments table indexes created successfully!");
      } else {
        console.log("✅ Comments table already exists");
      }

      // Check if members table exists
      const checkMembersTableQuery = `
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'members'
        );
      `;
      
      const checkMembersResult = await this.pool.query(checkMembersTableQuery);
      const membersTableExists = checkMembersResult.rows[0].exists;
      
      if (!membersTableExists) {
        console.log("🚀 Creating members table...");
        
        // Create members table
        const createMembersTableQuery = `
          CREATE TABLE members (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            role TEXT NOT NULL,
            avatar_url TEXT,
            bio TEXT,
            github_username TEXT,
            skills TEXT[] DEFAULT '{}',
            joined_date TIMESTAMP NOT NULL DEFAULT NOW(),
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          );
        `;

        await this.pool.query(createMembersTableQuery);
        console.log("✅ Members table created successfully!");

        // Create indexes for better performance
        const createMembersIndexQueries = [
          "CREATE INDEX idx_members_email ON members(email);",
          "CREATE INDEX idx_members_is_active ON members(is_active);",
          "CREATE INDEX idx_members_name ON members(name);",
          "CREATE INDEX idx_members_role ON members(role);"
        ];

        for (const query of createMembersIndexQueries) {
          await this.pool.query(query);
        }
        console.log("✅ Members table indexes created successfully!");

        // Insert default members
        const defaultMembersQuery = `
          INSERT INTO members (name, email, role, avatar_url, bio, github_username, skills, joined_date) VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8),
          ($9, $10, $11, $12, $13, $14, $15, $16),
          ($17, $18, $19, $20, $21, $22, $23, $24)
        `;

        await this.pool.query(defaultMembersQuery, [
          "바이브코딩 팀장", "leader@vibecoding.com", "팀장", 
          "https://github.com/identicons/leader.png", 
          "바이브코딩 스터디를 이끌어가는 팀장입니다. 풀스택 개발과 팀 관리에 열정을 가지고 있습니다.",
          "vibecoding-leader", ["React", "Node.js", "PostgreSQL", "TypeScript", "Docker"], 
          new Date("2024-01-01"),

          "Frontend 개발자 A", "frontend-a@vibecoding.com", "프론트엔드 개발자",
          "https://github.com/identicons/frontend-a.png",
          "사용자 경험에 중점을 둔 프론트엔드 개발자입니다. React와 TypeScript를 주로 사용합니다.",
          "frontend-developer-a", ["React", "TypeScript", "CSS", "HTML", "Figma"],
          new Date("2024-01-15"),

          "Backend 개발자 B", "backend-b@vibecoding.com", "백엔드 개발자",
          "https://github.com/identicons/backend-b.png",
          "서버 아키텍처와 API 설계에 관심이 많은 백엔드 개발자입니다.",
          "backend-developer-b", ["Node.js", "Express", "PostgreSQL", "Docker", "AWS"],
          new Date("2024-02-01")
        ]);
        
        console.log("✅ Default members added successfully!");
      } else {
        console.log("✅ Members table already exists");
      }

      // Check if progress_stats table exists
      const checkProgressStatsTableQuery = `
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'progress_stats'
        );
      `;
      
      const checkProgressStatsResult = await this.pool.query(checkProgressStatsTableQuery);
      const progressStatsTableExists = checkProgressStatsResult.rows[0].exists;
      
      if (!progressStatsTableExists) {
        console.log("🚀 Creating progress_stats table...");
        
        // Create progress_stats table
        const createProgressStatsTableQuery = `
          CREATE TABLE progress_stats (
            id SERIAL PRIMARY KEY,
            team_id TEXT NOT NULL,
            member_id INTEGER REFERENCES members(id) ON DELETE CASCADE,
            pages_created INTEGER NOT NULL DEFAULT 0,
            comments_written INTEGER NOT NULL DEFAULT 0,
            tasks_completed INTEGER NOT NULL DEFAULT 0,
            last_active_at TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          );
        `;

        await this.pool.query(createProgressStatsTableQuery);
        console.log("✅ Progress stats table created successfully!");

        // Create indexes for better performance
        const createProgressStatsIndexQueries = [
          "CREATE INDEX idx_progress_stats_team_id ON progress_stats(team_id);",
          "CREATE INDEX idx_progress_stats_member_id ON progress_stats(member_id);",
          "CREATE INDEX idx_progress_stats_last_active ON progress_stats(last_active_at);",
          "CREATE UNIQUE INDEX idx_progress_stats_team_member ON progress_stats(team_id, member_id);"
        ];

        for (const query of createProgressStatsIndexQueries) {
          await this.pool.query(query);
        }
        console.log("✅ Progress stats table indexes created successfully!");

        // Insert default progress stats for teams
        const defaultProgressStatsQuery = `
          INSERT INTO progress_stats (team_id, member_id, pages_created, comments_written, tasks_completed, last_active_at) VALUES
          ($1, $2, $3, $4, $5, $6),
          ($7, $8, $9, $10, $11, $12),
          ($13, $14, $15, $16, $17, $18),
          ($19, $20, $21, $22, $23, $24),
          ($25, $26, $27, $28, $29, $30)
        `;

        await this.pool.query(defaultProgressStatsQuery, [
          // Team Alpha 전체 통계
          "team1", null, 15, 25, 8, new Date(),
          // Team Beta 전체 통계  
          "team2", null, 12, 18, 6, new Date(),
          // 팀장 개인 통계
          "team1", 1, 8, 12, 4, new Date(),
          // Frontend 개발자 개인 통계
          "team1", 2, 5, 8, 2, new Date(),
          // Backend 개발자 개인 통계
          "team2", 3, 7, 10, 3, new Date()
        ]);
        
        console.log("✅ Default progress stats added successfully!");
      } else {
        console.log("✅ Progress stats table already exists");
      }

      // Check if tasks table exists
      const checkTasksTableQuery = `
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'tasks'
        );
      `;
      
      const checkTasksResult = await this.pool.query(checkTasksTableQuery);
      const tasksTableExists = checkTasksResult.rows[0].exists;
      
      if (!tasksTableExists) {
        console.log("🚀 Creating tasks table...");
        
        // Create tasks table
        const createTasksTableQuery = `
          CREATE TABLE tasks (
            id SERIAL PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            status TEXT NOT NULL DEFAULT 'todo',
            priority INTEGER NOT NULL DEFAULT 3,
            assigned_to INTEGER REFERENCES members(id) ON DELETE SET NULL,
            team_id TEXT NOT NULL,
            due_date TIMESTAMP,
            estimated_hours INTEGER,
            actual_hours INTEGER,
            progress INTEGER NOT NULL DEFAULT 0,
            tags TEXT[] DEFAULT '{}',
            linked_page_id INTEGER REFERENCES wiki_pages(id) ON DELETE SET NULL,
            created_by INTEGER REFERENCES members(id) ON DELETE SET NULL,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          );
        `;

        await this.pool.query(createTasksTableQuery);
        console.log("✅ Tasks table created successfully!");

        // Create indexes for better performance
        const createTasksIndexQueries = [
          "CREATE INDEX idx_tasks_team_id ON tasks(team_id);",
          "CREATE INDEX idx_tasks_status ON tasks(status);",
          "CREATE INDEX idx_tasks_assigned_to ON tasks(assigned_to);",
          "CREATE INDEX idx_tasks_due_date ON tasks(due_date);",
          "CREATE INDEX idx_tasks_priority ON tasks(priority);",
          "CREATE INDEX idx_tasks_created_at ON tasks(created_at);"
        ];

        for (const query of createTasksIndexQueries) {
          await this.pool.query(query);
        }
        console.log("✅ Tasks table indexes created successfully!");

        // Insert default tasks
        const defaultTasksQuery = `
          INSERT INTO tasks (title, description, status, priority, assigned_to, team_id, due_date, estimated_hours, actual_hours, progress, tags, created_by) VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12),
          ($13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24),
          ($25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36)
        `;

        await this.pool.query(defaultTasksQuery, [
          // 프로젝트 기획서 작성
          "프로젝트 기획서 작성", "새로운 기능 개발을 위한 상세 기획서 작성", "in_progress", 1, 1, "team1", 
          new Date("2024-02-15"), 8, 4, 50, ["기획", "문서화"], 1,
          
          // UI 컴포넌트 개발
          "UI 컴포넌트 개발", "재사용 가능한 UI 컴포넌트 라이브러리 구축", "todo", 2, 2, "team1", 
          new Date("2024-02-20"), 16, 0, 0, ["프론트엔드", "UI/UX"], 1,
          
          // API 엔드포인트 구현
          "API 엔드포인트 구현", "백엔드 API 엔드포인트 개발 및 테스트", "todo", 2, 3, "team2", 
          new Date("2024-02-25"), 12, 0, 0, ["백엔드", "API"], 1
        ]);
        
        console.log("✅ Default tasks added successfully!");
      } else {
        console.log("✅ Tasks table already exists");
      }

      // Check if notifications table exists
      const checkNotificationsTableQuery = `
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'notifications'
        );
      `;
      
      const checkNotificationsResult = await this.pool.query(checkNotificationsTableQuery);
      const notificationsTableExists = checkNotificationsResult.rows[0].exists;
      
      if (!notificationsTableExists) {
        console.log("🚀 Creating notifications table...");
        
        // Create notifications table
        const createNotificationsTableQuery = `
          CREATE TABLE notifications (
            id SERIAL PRIMARY KEY,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            recipient_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
            sender_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
            related_page_id INTEGER REFERENCES wiki_pages(id) ON DELETE CASCADE,
            related_task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
            related_comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
            is_read BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
          );
        `;

        await this.pool.query(createNotificationsTableQuery);
        console.log("✅ Notifications table created successfully!");

        // Create indexes for better performance
        const createNotificationsIndexQueries = [
          "CREATE INDEX idx_notifications_recipient_id ON notifications(recipient_id);",
          "CREATE INDEX idx_notifications_sender_id ON notifications(sender_id);",
          "CREATE INDEX idx_notifications_type ON notifications(type);",
          "CREATE INDEX idx_notifications_is_read ON notifications(is_read);",
          "CREATE INDEX idx_notifications_created_at ON notifications(created_at);"
        ];

        for (const query of createNotificationsIndexQueries) {
          await this.pool.query(query);
        }
        console.log("✅ Notifications table indexes created successfully!");

        // Insert default notifications
        const defaultNotificationsQuery = `
          INSERT INTO notifications (type, title, content, recipient_id, sender_id, related_page_id, related_task_id, related_comment_id, is_read) VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9),
          ($10, $11, $12, $13, $14, $15, $16, $17, $18),
          ($19, $20, $21, $22, $23, $24, $25, $26, $27)
        `;

        await this.pool.query(defaultNotificationsQuery, [
          // 댓글 알림
          "comment", "새 댓글이 작성되었습니다", "API Reference Guide 페이지에 새 댓글이 작성되었습니다.", 
          1, 2, 2, null, null, false,
          
          // 멘션 알림
          "mention", "멘션되었습니다", "프로젝트 기획서 작성 과제에서 멘션되었습니다.", 
          2, 1, null, null, null, false,
          
          // 과제 마감 알림
          "task_due", "과제 마감일 임박", "UI 컴포넌트 개발 과제의 마감일이 3일 남았습니다.", 
          2, null, null, null, null, true
        ]);
        
        console.log("✅ Default notifications added successfully!");
      } else {
        console.log("✅ Notifications table already exists");
      }
    } catch (error) {
      console.error("❌ Error initializing tables:", error);
    }
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

    return result.map((row: { tag: string; count: string | number }) => ({ 
      name: row.tag, 
      count: Number(row.count) 
    }));
  }

  async getFolders(): Promise<string[]> {
    const result = await this.db
      .selectDistinct({ folder: wikiPages.folder })
      .from(wikiPages)
      .execute();
    return result.map((row: { folder: string }) => row.folder);
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

  // Comments CRUD
  async getCommentsByPageId(pageId: number): Promise<Comment[]> {
    return await this.db
      .select()
      .from(comments)
      .where(eq(comments.pageId, pageId))
      .orderBy(asc(comments.createdAt))
      .execute();
  }

  async getComment(id: number): Promise<Comment | undefined> {
    const result = await this.db.select().from(comments).where(eq(comments.id, id)).limit(1);
    return result[0];
  }

  async createComment(insertComment: InsertComment): Promise<Comment> {
    const result = await this.db.insert(comments).values(insertComment).returning();
    return result[0];
  }

  async updateComment(id: number, updateComment: UpdateComment): Promise<Comment | undefined> {
    const result = await this.db
      .update(comments)
      .set({ ...updateComment, updatedAt: new Date() })
      .where(eq(comments.id, id))
      .returning();
    return result[0];
  }

  async deleteComment(id: number): Promise<boolean> {
    const result = await this.db.delete(comments).where(eq(comments.id, id));
    return result.rowCount > 0;
  }

  // Members CRUD
  async getMembers(): Promise<Member[]> {
    const result = await this.db.select().from(members).where(eq(members.isActive, true)).orderBy(asc(members.name));
    return result;
  }

  async getMember(id: number): Promise<Member | undefined> {
    const result = await this.db.select().from(members).where(eq(members.id, id)).limit(1);
    return result[0];
  }

  async getMemberByEmail(email: string): Promise<Member | undefined> {
    const result = await this.db.select().from(members).where(eq(members.email, email)).limit(1);
    return result[0];
  }

  async createMember(insertMember: InsertMember): Promise<Member> {
    const result = await this.db.insert(members).values(insertMember).returning();
    return result[0];
  }

  async updateMember(id: number, updateMember: UpdateMember): Promise<Member | undefined> {
    const result = await this.db.update(members).set({
      ...updateMember,
      updatedAt: new Date(),
    }).where(eq(members.id, id)).returning();
    return result[0];
  }

  async deleteMember(id: number): Promise<boolean> {
    const result = await this.db.delete(members).where(eq(members.id, id));
    return result.rowCount > 0;
  }

  // Dashboard & Progress Stats (DBStorage implementation)
  async getTeamProgressStats(teamId: string): Promise<any[]> {
    const query = `
      SELECT ps.*, m.name as member_name, m.role as member_role
      FROM progress_stats ps
      LEFT JOIN members m ON ps.member_id = m.id
      WHERE ps.team_id = $1
      ORDER BY ps.last_active_at DESC
    `;
    
    const result = await this.pool.query(query, [teamId]);
    return result.rows;
  }

  async getMemberProgressStats(memberId: number): Promise<any | undefined> {
    const query = `
      SELECT ps.*, m.name as member_name, m.role as member_role
      FROM progress_stats ps
      JOIN members m ON ps.member_id = m.id
      WHERE ps.member_id = $1
    `;
    
    const result = await this.pool.query(query, [memberId]);
    return result.rows[0] || undefined;
  }

  async updateProgressStats(teamId: string, memberId: number | null, type: 'page' | 'comment' | 'task'): Promise<void> {
    const now = new Date();
    
    // Update or insert progress stats
    const upsertQuery = `
      INSERT INTO progress_stats (team_id, member_id, pages_created, comments_written, tasks_completed, last_active_at, updated_at)
      VALUES ($1, $2, 
        CASE WHEN $3 = 'page' THEN 1 ELSE 0 END,
        CASE WHEN $3 = 'comment' THEN 1 ELSE 0 END,
        CASE WHEN $3 = 'task' THEN 1 ELSE 0 END,
        $4, $4)
      ON CONFLICT (team_id, member_id) 
      DO UPDATE SET
        pages_created = progress_stats.pages_created + CASE WHEN $3 = 'page' THEN 1 ELSE 0 END,
        comments_written = progress_stats.comments_written + CASE WHEN $3 = 'comment' THEN 1 ELSE 0 END,
        tasks_completed = progress_stats.tasks_completed + CASE WHEN $3 = 'task' THEN 1 ELSE 0 END,
        last_active_at = $4,
        updated_at = $4
    `;
    
    await this.pool.query(upsertQuery, [teamId, memberId, type, now]);
  }

  async getDashboardOverview(): Promise<any> {
    // Get total counts
    const totalPagesQuery = "SELECT COUNT(*) as count FROM wiki_pages";
    const totalCommentsQuery = "SELECT COUNT(*) as count FROM comments";
    const totalMembersQuery = "SELECT COUNT(*) as count FROM members WHERE is_active = true";
    const totalTasksQuery = "SELECT COUNT(*) as count FROM tasks";
    
    const [pagesResult, commentsResult, membersResult, tasksResult] = await Promise.all([
      this.pool.query(totalPagesQuery),
      this.pool.query(totalCommentsQuery),
      this.pool.query(totalMembersQuery),
      this.pool.query(totalTasksQuery)
    ]);
    
    // Get recent activity
    const recentActivityQuery = `
      (SELECT 'page' as type, title, author, created_at as time, NULL as content
       FROM wiki_pages 
       ORDER BY created_at DESC 
       LIMIT 3)
      UNION ALL
      (SELECT 'comment' as type, NULL as title, author, created_at as time, content
       FROM comments 
       ORDER BY created_at DESC 
       LIMIT 3)
      UNION ALL
      (SELECT 'task' as type, title, NULL as author, created_at as time, NULL as content
       FROM tasks 
       ORDER BY created_at DESC 
       LIMIT 3)
      ORDER BY time DESC 
      LIMIT 5
    `;
    
    const activityResult = await this.pool.query(recentActivityQuery);
    
    // Get team stats
    const teamStatsQuery = `
      SELECT 
        team_id,
        SUM(pages_created) as pages,
        SUM(comments_written) as comments,
        SUM(tasks_completed) as tasks
      FROM progress_stats 
      WHERE member_id IS NULL
      GROUP BY team_id
    `;
    
    const teamStatsResult = await this.pool.query(teamStatsQuery);
    
    return {
      totalPages: parseInt(pagesResult.rows[0].count),
      totalComments: parseInt(commentsResult.rows[0].count),
      totalMembers: parseInt(membersResult.rows[0].count),
      totalTasks: parseInt(tasksResult.rows[0].count),
      activeTeams: teamStatsResult.rows.length,
      recentActivity: activityResult.rows,
      teamStats: teamStatsResult.rows.map(row => ({
        teamId: row.team_id,
        name: row.team_id === 'team1' ? 'Team Alpha' : 'Team Beta',
        pages: parseInt(row.pages),
        comments: parseInt(row.comments),
        tasks: parseInt(row.tasks)
      }))
    };
  }

  // Tasks CRUD (DBStorage implementation)
  async getTasks(teamId?: string, status?: string): Promise<Task[]> {
    let query = this.db.select().from(tasks);
    
    if (teamId) {
      query = query.where(eq(tasks.teamId, teamId));
    }
    
    if (status) {
      query = query.where(eq(tasks.status, status));
    }
    
    return await query.orderBy(desc(tasks.createdAt)).execute();
  }

  async getTask(id: number): Promise<Task | undefined> {
    const result = await this.db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    return result[0];
  }

  async createTask(insertTask: InsertTask): Promise<Task> {
    const result = await this.db.insert(tasks).values(insertTask).returning();
    return result[0];
  }

  async updateTask(id: number, updateTask: UpdateTask): Promise<Task | undefined> {
    const result = await this.db
      .update(tasks)
      .set({ ...updateTask, updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning();
    return result[0];
  }

  async deleteTask(id: number): Promise<boolean> {
    const result = await this.db.delete(tasks).where(eq(tasks.id, id));
    return result.rowCount > 0;
  }

  async updateTaskProgress(id: number, progress: number): Promise<Task | undefined> {
    const result = await this.db
      .update(tasks)
      .set({ 
        progress: Math.max(0, Math.min(100, progress)), // Ensure progress is between 0-100
        updatedAt: new Date() 
      })
      .where(eq(tasks.id, id))
      .returning();
    return result[0];
  }

  // Notifications CRUD (DBStorage implementation)
  async getNotifications(recipientId: number): Promise<Notification[]> {
    return await this.db
      .select()
      .from(notifications)
      .where(eq(notifications.recipientId, recipientId))
      .orderBy(desc(notifications.createdAt))
      .execute();
  }

  async getNotification(id: number): Promise<Notification | undefined> {
    const result = await this.db.select().from(notifications).where(eq(notifications.id, id)).limit(1);
    return result[0];
  }

  async createNotification(insertNotification: InsertNotification): Promise<Notification> {
    const result = await this.db.insert(notifications).values(insertNotification).returning();
    return result[0];
  }

  async updateNotification(id: number, updateNotification: UpdateNotification): Promise<Notification | undefined> {
    const result = await this.db
      .update(notifications)
      .set(updateNotification)
      .where(eq(notifications.id, id))
      .returning();
    return result[0];
  }

  async deleteNotification(id: number): Promise<boolean> {
    const result = await this.db.delete(notifications).where(eq(notifications.id, id));
    return result.rowCount > 0;
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
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(and(eq(notifications.recipientId, recipientId), eq(notifications.isRead, false)));
    return result[0].count;
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
