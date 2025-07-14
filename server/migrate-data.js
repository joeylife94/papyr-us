import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { wikiPages, calendarEvents, directories, comments } from "../shared/schema.js";

// PostgreSQL 연결
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://papyrus_user:papyrus_password_2024@localhost:5432/papyrus_db",
});

const db = drizzle(pool);

console.log("🚀 데이터 마이그레이션 시작...");

// 기본 위키 페이지 데이터
const defaultPages = [
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
    isPublished: true,
    metadata: {}
  },
  {
    title: "Team Alpha Workspace",
    slug: "team-alpha-workspace",
    content: `# Team Alpha Workspace

Welcome to Team Alpha's collaborative workspace! This is your dedicated area for team-specific documentation, planning, and knowledge sharing.

## Current Projects

### Project Phoenix
- **Status**: In Progress
- **Lead**: Alice Johnson
- **Deadline**: Q2 2024
- **Description**: Revolutionary new feature set for enhanced user experience

### Project Quantum
- **Status**: Planning
- **Lead**: Bob Smith
- **Deadline**: Q3 2024
- **Description**: Performance optimization and scalability improvements

## Team Resources

- [Team Calendar](../calendar/team-alpha)
- [Meeting Notes](../logs/team-alpha-meetings)
- [Code Guidelines](../docs/coding-standards)
- [Design System](../docs/design-system)

## Quick Links

- 📊 [Analytics Dashboard](https://analytics.example.com)
- 🔧 [Development Environment](https://dev.example.com)
- 📱 [Testing Platform](https://test.example.com)
- 📚 [Documentation Hub](https://docs.example.com)`,
    folder: "team-alpha",
    tags: ["team", "workspace", "collaboration"],
    author: "System",
    isPublished: true,
    metadata: {}
  }
];

// 기본 캘린더 이벤트 데이터
const defaultEvents = [
  {
    title: "Team Alpha Weekly Standup",
    description: "Weekly progress review and planning session for Team Alpha",
    startDate: new Date("2024-03-15T09:00:00Z"),
    endDate: new Date("2024-03-15T10:00:00Z"),
    teamId: "team-alpha"
  },
  {
    title: "Documentation Review",
    description: "Monthly review of documentation quality and updates",
    startDate: new Date("2024-03-20T14:00:00Z"),
    endDate: new Date("2024-03-20T15:30:00Z"),
    teamId: "general"
  },
  {
    title: "Project Phoenix Milestone",
    description: "Major milestone delivery for Project Phoenix",
    startDate: new Date("2024-04-01T00:00:00Z"),
    endDate: new Date("2024-04-01T23:59:59Z"),
    teamId: "team-alpha"
  }
];

// 기본 디렉토리 데이터
const defaultDirectories = [
  {
    name: "docs",
    displayName: "📚 Documentation",
    password: null,
    isVisible: true,
    order: 1
  },
  {
    name: "ideas",
    displayName: "💡 Ideas & Brainstorming",
    password: null,
    isVisible: true,
    order: 2
  },
  {
    name: "members",
    displayName: "👥 Team Members",
    password: null,
    isVisible: true,
    order: 3
  },
  {
    name: "logs",
    displayName: "📋 Meeting Logs",
    password: null,
    isVisible: true,
    order: 4
  },
  {
    name: "archive",
    displayName: "📦 Archive",
    password: null,
    isVisible: true,
    order: 5
  },
  {
    name: "team-alpha",
    displayName: "🚀 Team Alpha",
    password: "alpha2024",
    isVisible: true,
    order: 6
  }
];

async function migrateData() {
  try {
    console.log("📁 디렉토리 데이터 마이그레이션...");
    for (const directory of defaultDirectories) {
      try {
        await db.insert(directories).values(directory);
        console.log(`✅ 디렉토리 생성: ${directory.displayName}`);
      } catch (error) {
        if (error.code === '23505') { // Unique constraint violation
          console.log(`⚠️  디렉토리 이미 존재: ${directory.displayName}`);
        } else {
          throw error;
        }
      }
    }

    console.log("\n📄 위키 페이지 데이터 마이그레이션...");
    for (const page of defaultPages) {
      try {
        await db.insert(wikiPages).values(page);
        console.log(`✅ 페이지 생성: ${page.title}`);
      } catch (error) {
        if (error.code === '23505') { // Unique constraint violation
          console.log(`⚠️  페이지 이미 존재: ${page.title}`);
        } else {
          throw error;
        }
      }
    }

    console.log("\n📅 캘린더 이벤트 데이터 마이그레이션...");
    for (const event of defaultEvents) {
      try {
        await db.insert(calendarEvents).values(event);
        console.log(`✅ 이벤트 생성: ${event.title}`);
      } catch (error) {
        console.log(`⚠️  이벤트 생성 실패: ${event.title} - ${error.message}`);
      }
    }

    console.log("\n🎉 데이터 마이그레이션 완료!");
    
    // 결과 확인
    const pageCount = await db.select().from(wikiPages);
    const eventCount = await db.select().from(calendarEvents);
    const directoryCount = await db.select().from(directories);
    
    console.log("\n📊 마이그레이션 결과:");
    console.log(`   - 위키 페이지: ${pageCount.length}개`);
    console.log(`   - 캘린더 이벤트: ${eventCount.length}개`);
    console.log(`   - 디렉토리: ${directoryCount.length}개`);

  } catch (error) {
    console.error("❌ 마이그레이션 실패:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// 스크립트 실행
migrateData(); 