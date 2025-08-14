import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { users, wikiPages, calendarEvents, directories, comments } from "../shared/schema.js";
import dotenv from "dotenv";
import path from "path";

// Load environment variables based on NODE_ENV
const envPath = process.env.NODE_ENV === 'test' 
  ? path.resolve(process.cwd(), '.env.test') 
  : path.resolve(process.cwd(), '.env');
  
dotenv.config({ path: envPath, override: true });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Please check your .env file.");
}

// PostgreSQL 연결
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool);

console.log("🚀 데이터 마이그레이션 시작...");

// 테스트용 사용자 데이터
const defaultUsers = [
  {
    name: "Test User",
    email: "test@example.com",
    password: "password123",
  }
];

// 기본 위키 페이지 데이터
const defaultPages = [
  {
    title: "Getting Started",
    slug: "getting-started",
    content: `# Getting Started\n\nWelcome to Papyr.us, your modern wiki and documentation platform.\n\n## Overview\n\nPapyr.us is designed to help you organize and share knowledge effectively. Here's what you can do:\n\n- Create and edit markdown-based documentation\n- Organize content into folders (docs, ideas, members, logs, archive)\n- Use team directories for collaborative workspaces\n- Use tags to categorize and filter content\n- Search across all your content\n\n## Quick Start\n\n1. Navigate through the sidebar to explore different sections\n2. Use the search bar to find specific content\n3. Click on any page to view or edit it\n4. Use tags to filter content by topic\n5. Teams can create their own workspaces in team directories\n\nStart exploring and building your knowledge base!`,
    folder: "docs",
    tags: ["tutorial", "getting-started"],
    author: "System",
    isPublished: true,
    metadata: {}
  },
  {
    title: "API Reference Guide",
    slug: "api-reference",
    content: `# API Reference Guide\n\nThis comprehensive guide covers all available API endpoints, authentication methods, and response formats for the Papyr.us platform.\n\n## Authentication\n\nThe Papyr.us API uses token-based authentication to secure endpoints. You'll need to include your API token in the header of each request.\n\n\
Authorization: Bearer YOUR_API_TOKEN\nContent-Type: application/json\n\
\n## Endpoints\n\n### GET /api/pages\n\nRetrieve a list of all pages in your wiki.\n\n**Example Response:**
\
{\n  "pages": [\n    {\n      "id": "page-1",\n      "title": "Getting Started",\n      "slug": "getting-started",\n      "tags": ["tutorial", "beginner"],\n      "created_at": "2024-03-01T10:00:00Z",\n      "updated_at": "2024-03-15T14:30:00Z"\n    }\n  ],\n  "total": 1,\n  "page": 1,\n  "per_page": 20\n}\n\
\n### POST /api/pages\n\nCreate a new wiki page with markdown content and frontmatter metadata.\n\n**Request Body:**
\
{\n  "title": "New Page Title",\n  "content": "# Page Content\\n\\nYour markdown content here...",\n  "tags": ["documentation", "api"],\n  "folder": "docs"\n}\n\
\n## Rate Limiting\n\nThe API implements rate limiting to ensure fair usage. Each API key is limited to 1000 requests per hour.`,
    folder: "docs",
    tags: ["api", "reference", "documentation"],
    author: "System",
    isPublished: true,
    metadata: {}
  },
  {
    title: "Project Ideas",
    slug: "project-ideas",
    content: `# Project Ideas\n\nCollection of ideas and concepts for future development.\n\n## New Features\n\n- Mobile app for offline reading\n- Advanced search with full-text indexing\n- Real-time collaborative editing\n- Integration with external tools (Slack, Discord)\n- Advanced analytics and usage tracking\n\n## Improvements\n\n- Enhanced markdown editor with live preview\n- Better file organization and tagging system\n- Custom themes and branding options\n- Export capabilities (PDF, EPUB, etc.)\n\n## Community Features\n\n- User comments and discussions\n- Community-driven content curation\n- Public wiki hosting options`,
    folder: "ideas",
    tags: ["brainstorming", "features", "roadmap"],
    author: "System",
    isPublished: true,
    metadata: {}
  },
  {
    title: "Team Alpha Workspace",
    slug: "team-alpha-workspace",
    content: `# Team Alpha Workspace\n\nWelcome to Team Alpha's collaborative workspace! This is your dedicated area for team-specific documentation, planning, and knowledge sharing.\n\n## Current Projects\n\n### Project Phoenix\n- **Status**: In Progress\n- **Lead**: Alice Johnson\n- **Deadline**: Q2 2024\n- **Description**: Revolutionary new feature set for enhanced user experience\n\n### Project Quantum\n- **Status**: Planning\n- **Lead**: Bob Smith\n- **Deadline**: Q3 2024\n- **Description**: Performance optimization and scalability improvements\n\n## Team Resources\n\n- [Team Calendar](../calendar/team-alpha)\n- [Meeting Notes](../logs/team-alpha-meetings)\n- [Code Guidelines](../docs/coding-standards)\n- [Design System](../docs/design-system)\n\n## Quick Links\n\n- 📊 [Analytics Dashboard](https://analytics.example.com)\n- 🔧 [Development Environment](https://dev.example.com)\n- 📱 [Testing Platform](https://test.example.com)\n- 📚 [Documentation Hub](https://docs.example.com)`,
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
    console.log("👤 사용자 데이터 마이그레이션...");
    for (const user of defaultUsers) {
      try {
        const hashedPassword = await bcrypt.hash(user.password, 10);
        await db.insert(users).values({
          name: user.name,
          email: user.email,
          hashedPassword: hashedPassword,
        });
        console.log(`✅ 사용자 생성: ${user.email}`);
      } catch (error) {
        if (error.code === '23505') { // Unique constraint violation
          console.log(`⚠️  사용자 이미 존재: ${user.email}`);
        } else {
          throw error;
        }
      }
    }

    console.log("\n📁 디렉토리 데이터 마이그레이션...");
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
    const userCount = await db.select().from(users);
    const pageCount = await db.select().from(wikiPages);
    const eventCount = await db.select().from(calendarEvents);
    const directoryCount = await db.select().from(directories);
    
    console.log("\n📊 마이그레이션 결과:");
    console.log(`   - 사용자: ${userCount.length}개`);
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