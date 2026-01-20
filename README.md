# Papyr.us - Modern Team Collaboration Wiki

> **🚀 Production-Ready | Full-Stack TypeScript | AI-Powered**

A comprehensive **team collaboration platform** built with React and Express.js, featuring real-time collaboration, AI integration, and an intuitive user experience. Designed to be the next generation of wiki platforms with Notion-like capabilities.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6.3-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.3.1-61dafb.svg)](https://reactjs.org/)
[![Express](https://img.shields.io/badge/Express-4.21.2-000000.svg)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791.svg)](https://www.postgresql.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 📌 TL;DR (For Hiring Managers)

- **Real-time collaboration** via Socket.IO + Yjs CRDT for conflict-free concurrent editing
- **AI integration** using GPT-4o: RAG pipeline, semantic search, document summarization, task extraction, smart tagging, and related content discovery
- **Multi-tenant B2B SaaS architecture** with team-based isolation and comprehensive RBAC (Role-Based Access Control)
- **Production-grade security**: JWT authentication, bcrypt hashing, rate limiting, Helmet middleware, input validation, and SQL injection prevention
- **Scalable full-stack TypeScript** codebase with comprehensive test coverage, Docker containerization, and CI/CD pipeline
- **Enterprise-grade storage**: PostgreSQL 16 with Full-Text Search (FTS), Drizzle ORM for type-safe queries, and migration system

This project serves as a comprehensive portfolio piece demonstrating system design, AI integration, and security best practices for senior backend and AI engineering roles.

---

## ✨ Key Features

### 📝 Advanced Wiki System

- **Block-based editor** with multiple content types (paragraphs, headings, code, quotes, checkboxes, images)
- **Markdown support** with real-time preview and syntax highlighting
- **Postgres Full-Text Search (FTS)** with relevance ranking and automatic indexing ⭐ **NEW**
- **Tag-based organization** with smart filtering
- **Folder structure** with directory management
- **Slug-based URLs** for SEO-friendly pages

### 👥 Team Collaboration

- **Team workspaces** with isolated environments
- **Team calendar** with priority levels and smart time validation
- **Task management** with status tracking and assignments
- **File manager** with upload/download and team-based storage
- **Real-time notifications** for comments, tasks, and mentions

### 🤖 AI Integration (GPT-4o)

- **Smart search** with natural language queries
- **Content generation** with context-aware suggestions
- **Auto-suggestions** for search queries
- **Related pages** discovery

### ⚡ Real-time Collaboration

- **Socket.IO** with exponential backoff reconnection ⭐ **IMPROVED**
- **Yjs CRDT** integration for conflict-free concurrent editing
- **Real-time cursor tracking** with user presence indicators ⭐ **NEW**
- **Live notifications** with badge counts
- **Connection status UI** with automatic recovery ⭐ **NEW**

### 🔐 Security & Authentication

- **JWT-based authentication** with secure token management
- **bcrypt password hashing** with salt rounds (10) ⭐ **IMPROVED**
- **Role-based access control (RBAC)** for admin and team permissions
- **Password-protected** directories and teams with secure hashing ⭐ **IMPROVED**
- **Rate limiting** on sensitive endpoints
- **Security headers** (Helmet middleware)
- **Migration tools** for upgrading security implementations ⭐ **NEW**

### 🎨 Modern UI/UX

- **shadcn/ui components** for consistent design
- **Dark/Light mode** with system preference detection
- **Responsive design** for mobile, tablet, and desktop
- **Smooth animations** with Framer Motion
- **Accessible** with ARIA labels and keyboard navigation

## 🏗️ System Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer                            │
│  React 18 + TypeScript + Vite + TanStack Query + Socket.IO     │
└────────────────────────┬────────────────────────────────────────┘
                         │
                    HTTP/WebSocket
                         │
┌────────────────────────▼────────────────────────────────────────┐
│                       Server Layer                              │
│       Express.js + TypeScript + JWT Auth + Middleware          │
│                                                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐   │
│  │   Routes    │  │   Services   │  │   Real-time        │   │
│  │  (REST API) │─▶│  (Business)  │  │  (Socket.IO + Yjs) │   │
│  └─────────────┘  └──────┬───────┘  └────────────────────┘   │
│                           │                                     │
└───────────────────────────┼─────────────────────────────────────┘
                            │
                ┌───────────┴──────────┐
                │                      │
        ┌───────▼──────┐      ┌───────▼──────┐
        │  PostgreSQL  │      │   OpenAI     │
        │  + Drizzle   │      │   GPT-4o     │
        │  + FTS       │      │   API        │
        └──────────────┘      └──────────────┘
```

### Architecture Layers

**1. Client Layer (React SPA)**

- Single Page Application with React 18
- Real-time updates via Socket.IO client
- TanStack Query for server state management
- shadcn/ui + Tailwind CSS for consistent UI

**2. Server Layer (Express.js)**

- RESTful API with 100+ endpoints
- JWT-based authentication & RBAC
- Rate limiting & security middleware (Helmet)
- Service layer for business logic separation

**3. Real-time Communication**

- **Socket.IO**: WebSocket connections for live updates
- **Yjs CRDT**: Conflict-free concurrent editing
- Automatic reconnection with exponential backoff
- Real-time notifications, presence, and cursors

**4. Data Layer**

- **PostgreSQL 16**: Primary database with ACID guarantees
- **Drizzle ORM**: Type-safe SQL query builder
- **Full-Text Search (FTS)**: Postgres native search with ranking
- Migration system for schema versioning

**5. AI Integration**

- **OpenAI GPT-4o**: Natural language processing
- Smart search with semantic understanding
- Content generation and summarization
- RAG (Retrieval-Augmented Generation) pipeline for context-aware responses

### Data Flow

```
User Action → Client Component → TanStack Query/Socket.IO
                                          ↓
                              API Route + Auth Middleware
                                          ↓
                              Service Layer (Business Logic)
                                          ↓
                      Storage Layer (Drizzle ORM + PostgreSQL)
                                          ↓
                              Response + Real-time Broadcast
```

---

## 🛠 Tech Stack

### Frontend

```
React 18.3.1
├── TypeScript 5.6.3
├── Vite 7.0.2
├── React Router DOM 7.8.2
├── TanStack Query 5.87.1
├── Tailwind CSS 3.4.17
├── shadcn/ui
└── Socket.IO Client 4.8.1
```

### Backend

```
Express.js 4.21.2
├── TypeScript 5.6.3
├── Drizzle ORM 0.39.3
├── PostgreSQL 16
├── Socket.IO 4.8.1
├── Passport.js 0.7.0
├── OpenAI SDK 5.6.0
├── Winston 3.18.3
└── Helmet + CORS
```

### DevOps & Testing

- **Docker & Docker Compose** for containerization
- **Playwright** for E2E testing with high test reliability
- **Vitest** for unit/integration tests
- **ESLint & Prettier** with Husky pre-commit hooks
- **GitHub Actions** CI/CD pipeline

## 🤖 AI-Powered Features

Papyr.us integrates **GPT-4o** throughout the platform to enhance productivity and collaboration:

### What AI Does in Papyr.us

#### 🔍 Smart Search with Semantic Understanding

- **Natural Language Queries**: Search using plain language (e.g., "pages about deployment")
- **Relevance Ranking**: AI ranks results based on semantic meaning, not just keywords
- **Multi-source Search**: Searches across pages, files, tasks, and calendar events
- **Auto-suggestions**: Real-time query suggestions as you type

```typescript
// Example: Smart search with AI ranking
const results = await smartSearch('how to deploy to production', documents);
// Returns: Deployment guides, Docker configs, CI/CD workflows
```

#### 📝 Document Summarization & Analysis

- **Automatic Summaries**: Generate concise summaries of long documents
- **Key Points Extraction**: Extract main takeaways from meeting notes
- **Reading Time Estimation**: Calculate reading time based on content length

#### 💬 Wiki Context-based Q&A (RAG Pipeline)

- **Context-aware Answers**: Ask questions about your workspace content
- **Page-specific Assistance**: Get help based on current page context
- **Related Content Discovery**: Find relevant pages and documents automatically

```typescript
// RAG pipeline: Question answering with workspace context
const answer = await chatWithCopilot(messages, { pageTitle, pageContent, recentPages });
```

#### ✍️ Content Generation

- **Section Writing**: Generate well-structured markdown sections
- **Template Expansion**: Expand outlines into full content
- **Improvement Suggestions**: AI suggests ways to enhance documentation

#### 🏷️ Tag & Task Recommendations

- **Smart Tagging**: Auto-suggest relevant tags based on content
- **Task Extraction**: Identify action items from meeting notes and discussions
- **Priority Scoring**: Recommend task priorities based on content analysis

```typescript
// Extract tasks from meeting notes
const tasks = await extractTasks(meetingContent);
// Returns: [{title, description, priority, estimatedHours}, ...]
```

#### 🔗 Related Pages Discovery

- **Semantic Linking**: Find related pages based on topic similarity
- **Knowledge Graph**: Build connections between related content
- **Navigation Suggestions**: Recommend next pages to read

### AI Integration Architecture

```
┌─────────────────────────────────────────────────────┐
│                  User Query                         │
└────────────────────┬────────────────────────────────┘
                     │
            ┌────────▼────────┐
            │  AI Service     │
            │  (GPT-4o API)   │
            └────────┬────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
   ┌────▼─────┐           ┌──────▼──────┐
   │ Embeddings│           │  Chat       │
   │ (Search)  │           │  Completion │
   └────┬─────┘           └──────┬──────┘
        │                         │
   ┌────▼─────────────────────────▼────┐
   │    Workspace Context (RAG)        │
   │  • Pages  • Files  • Tasks        │
   └────────────────┬──────────────────┘
                    │
            ┌───────▼────────┐
            │   PostgreSQL   │
            │   Full-Text    │
            │   Search (FTS) │
            └────────────────┘
```

**Key Benefits:**

- 🚀 **Significantly Faster Search**: Find relevant content instantly
- 💡 **Smarter Insights**: Discover connections between documents
- ⏱️ **Time Savings**: Auto-generate summaries and content
- 🎯 **Better Organization**: AI-powered tagging and recommendations

---

## 🔐 Security & Multi-Tenancy

### Multi-Tenant Architecture

Papyr.us is built with **team-based isolation** to support multiple teams securely:

```
┌─────────────────────────────────────────────────────────┐
│                    Application Layer                    │
└────────────────────────┬────────────────────────────────┘
                         │
         ┌───────────────┴───────────────┐
         │                               │
    ┌────▼─────┐                    ┌───▼──────┐
    │  Team A  │                    │  Team B  │
    │  Workspace│                    │  Workspace│
    └────┬─────┘                    └───┬──────┘
         │                               │
    ┌────▼──────────┐              ┌────▼──────────┐
    │ • Pages       │              │ • Pages       │
    │ • Tasks       │              │ • Tasks       │
    │ • Calendar    │              │ • Calendar    │
    │ • Files       │              │ • Files       │
    └───────────────┘              └───────────────┘
```

**Isolation Features:**

- ✅ **Team-level Data Segregation**: Each team's data is logically isolated
- ✅ **Workspace Boundaries**: Teams cannot access each other's content
- ✅ **Team-specific Resources**: Calendar events, tasks, and files are team-scoped
- ✅ **Password Protection**: Optional password gates for team access

### Role-Based Access Control (RBAC)

```typescript
// Permission hierarchy
Admin → Team Owner → Team Admin → Team Member → Viewer
```

**Role Levels:**

1. **System Admin** (`admin` role)
   - Full platform access
   - User management
   - Directory configuration
   - System settings

2. **Team Owner** (per team)
   - Team configuration
   - Member management
   - Resource deletion

3. **Team Admin** (per team)
   - Content moderation
   - Member invitation
   - Settings management

4. **Team Member** (per team)
   - Create/edit pages
   - Manage tasks
   - Comment and collaborate

5. **Page Viewer** (per page)
   - Read-only access
   - Comment (if permitted)

**RBAC Implementation:**

```typescript
// Middleware-based authorization
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  // Only admins can access
});

app.post(
  '/api/teams/:teamId/pages',
  requireTeamRole(['owner', 'admin', 'member']),
  async (req, res) => {
    // Team members can create pages
  }
);

app.get('/api/pages/:id', requirePagePermission('viewer'), async (req, res) => {
  // Check page-level permissions
});
```

### Security Features

**Authentication & Authorization:**

- ✅ JWT-based authentication with secure token storage
- ✅ bcrypt password hashing (10 rounds)
- ✅ Role-based middleware (`requireAdmin`, `requireTeamRole`)
- ✅ Page-level permissions (`owner`, `editor`, `viewer`, `commenter`)
- ✅ OAuth 2.0 ready (Google, GitHub)

**Application Security:**

- ✅ Helmet.js security headers
- ✅ CORS with configurable origin whitelist
- ✅ Rate limiting on auth and admin endpoints
- ✅ SQL injection prevention (Drizzle ORM parameterized queries)
- ✅ XSS protection (React built-in escaping)
- ✅ CSRF protection (SameSite cookies)

**Data Protection:**

- ✅ Input validation with Zod schemas
- ✅ Secure file upload validation (type, size limits)
- ✅ Environment variable-based secrets management
- ✅ Production mode enforcement (`NODE_ENV`)

**Database Security:**

```sql
-- Row-level security examples
SELECT * FROM wiki_pages WHERE teamId = :userTeamId;
SELECT * FROM tasks WHERE teamId = :userTeamId;
```

### Security Configuration

```bash
# Environment variables for security
JWT_SECRET=<random-256-bit-secret>
ADMIN_PASSWORD=<strong-password>
ENFORCE_AUTH_WRITES=true  # Require auth for all write operations
ALLOW_ADMIN_PASSWORD=false  # Disable password-based admin (use JWT only)
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX=100  # Max requests per window
```

**Perfect for B2B SaaS:**

- 🏢 Clear tenant boundaries
- 🔒 Enterprise-grade security
- 👥 Flexible permission system
- 📊 Audit-ready architecture (logs + trails)

---

## 🚀 Quick Start

### Prerequisites

- **Docker & Docker Compose** (recommended) OR
- **Node.js 18+** and **PostgreSQL 16** (local development)
- **OpenAI API Key** (optional, for AI features)

### 🐳 Option 1: Docker (Recommended)

The fastest way to get started:

```bash
# Clone the repository
git clone https://github.com/joeylife94/papyr-us.git
cd papyr-us

# Create environment file (optional)
cp .env.example .env
# Add your OPENAI_API_KEY if you want AI features

# Start with Docker Compose
docker-compose up --build
```

**Access the app:**

- Frontend: http://localhost:5001
- API: http://localhost:5001/api
- Health Check: http://localhost:5001/health

### 💻 Option 2: Local Development

```bash
# Clone and install
git clone https://github.com/joeylife94/papyr-us.git
cd papyr-us
npm install

# Set up environment
cp .env.example .env
# Configure DATABASE_URL and OPENAI_API_KEY

# Start development server
npm run dev

# Or use convenience scripts
# Windows: local-dev.bat
# Linux/Mac: ./local-dev.sh
```

**Note:** Local development requires PostgreSQL 16 running on your machine.

### 📝 Environment Variables

Create a `.env` file in the root directory:

```env
# Core
NODE_ENV=development
PORT=5001

# Modes (Notion-style)
# - Team mode (default): collaboration ON by default
# - Personal mode: collaboration OFF by default (but can be enabled)
#
# PAPYR_MODE=personal
# FEATURE_COLLABORATION=true

# Collaboration Engine tuning (Yjs + legacy Socket.IO)
# See docs/collaboration-engine.md for full details.
#
# Core safety knobs
# COLLAB_REQUIRE_AUTH=1
# COLLAB_MAX_DOCS=50
# COLLAB_MAX_CLIENTS_PER_DOC=20
#
# Persistence + lifecycle
# COLLAB_SAVE_DEBOUNCE_MS=3000
# COLLAB_SNAPSHOT_INTERVAL_MS=60000
# COLLAB_DOC_TTL_MS=300000
# COLLAB_RATE_LIMIT_SAVES_PER_MIN=6
#
# Event rate limits (defaults are reasonable; tune only if needed)
# COLLAB_RATE_LIMIT_UPDATES_PER_SEC=200
# COLLAB_RATE_LIMIT_AWARENESS_PER_SEC=100
# COLLAB_RATE_LIMIT_DOC_CHANGES_PER_SEC=50
# COLLAB_RATE_LIMIT_CURSOR_PER_SEC=30
# COLLAB_RATE_LIMIT_TYPING_PER_SEC=20

# Firebat self-host stability suggestion (if collaboration is enabled)
# COLLAB_SAVE_DEBOUNCE_MS=5000
# COLLAB_SNAPSHOT_INTERVAL_MS=120000
# COLLAB_DOC_TTL_MS=120000
# COLLAB_MAX_DOCS=20
# COLLAB_MAX_CLIENTS_PER_DOC=5

# Database
DATABASE_URL=postgresql://papyrus_user:papyrus_password_2024@localhost:5433/papyrus_db

# Authentication
JWT_SECRET=your_jwt_secret_here
ADMIN_PASSWORD=your_admin_password

# AI Features (optional)
OPENAI_API_KEY=sk-...

# Security
ENFORCE_AUTH_WRITES=false  # Set to true in production
RATE_LIMIT_ENABLED=true
```

````bash
## 📜 Available Scripts

```bash
# Development
npm run dev              # Start development server with hot reload
npm run dev:secure       # Start with security features enabled

# Building
npm run build            # Build for production (TypeScript + Vite)
npm start                # Start production server

# Testing
npm test                 # Run unit/integration tests (Vitest)
npm run test:watch       # Run tests in watch mode
npm run e2e              # Run E2E tests (Playwright)
npm run test:smoke       # Run quick smoke tests

# Code Quality
npm run check            # TypeScript type checking
npm run lint             # ESLint check
npm run lint:fix         # Auto-fix ESLint issues
npm run format           # Format code with Prettier

# Database
npm run db:push          # Push schema changes to database
npm run db:migrate       # Run migrations
npm run db:generate      # Generate migration files
npm run db:seed          # Seed database with initial data
````

## 📁 Project Structure

```
papyr-us/
├── client/                    # Frontend React application (~5,000 lines)
│   ├── src/
│   │   ├── components/        # UI components (50+ files)
│   │   │   ├── ui/           # shadcn/ui components
│   │   │   ├── blocks/       # Block editor components
│   │   │   └── ...
│   │   ├── pages/            # Route pages (15+ files)
│   │   ├── hooks/            # Custom React hooks
│   │   └── lib/              # Utilities and helpers
│   └── index.html
│
├── server/                    # Backend Express server (~12,000 lines)
│   ├── routes.ts             # API routes (2,600+ lines, 100+ endpoints)
│   ├── storage.ts            # Database layer (3,000+ lines)
│   ├── middleware.ts         # Auth, RBAC, rate limiting
│   ├── services/             # Business logic
│   │   ├── ai.ts            # OpenAI integration
│   │   ├── socket.ts        # Real-time collaboration
│   │   ├── upload.ts        # File upload handling
│   │   └── yjs-collaboration.ts  # CRDT system
│   └── tests/               # Unit/integration tests (50+ test cases)
│
├── shared/                   # Shared types and schemas (~800 lines)
│   └── schema.ts            # Drizzle ORM schemas, Zod validators
│
├── docs/                     # Documentation (15+ files)
│   ├── PROJECT_FINAL_EVALUATION.md  # ⭐ Comprehensive project overview
│   ├── development-guide.md
│   ├── user-guide.md
│   └── ...
│
├── migrations/              # Database migrations (12+ files)
├── tests/                   # E2E tests (20+ Playwright tests)
└── docker-compose.yml       # Docker configuration
```

## 🧪 Testing

### Test Coverage

- **E2E Tests**: High test reliability with Playwright
- **Integration Tests**: 50+ test cases with Vitest
- **API Coverage**: Strong coverage across core modules
- **Smoke Tests**: Quick sanity checks for core functionality

### Running Tests

```bash
# Run all tests
npm test

# Run E2E tests
npm run e2e

# Run smoke tests (fast)
npm run test:smoke

# Watch mode for development
npm run test:watch
```

### Test Structure

```
tests/
├── example.spec.ts          # Main E2E test suite
├── auth-redirect.spec.ts    # Authentication flow tests
├── yjs-collaboration.spec.ts # Real-time collaboration tests
└── global-setup.ts          # Test environment setup

server/tests/
├── routes.test.ts           # API endpoint tests
├── storage.test.ts          # Database layer tests
└── realtime.notifications.socket.test.ts  # Socket.IO tests
```

## 🔒 Security Features

- **JWT Authentication** with secure token management
- **Role-Based Access Control (RBAC)** for admin and team permissions
- **Password Hashing** with bcrypt (10 rounds)
- **Rate Limiting** on sensitive endpoints (auth, admin, upload)
- **Security Headers** via Helmet middleware
- **CORS Configuration** with whitelisting
- **SQL Injection Prevention** via Drizzle ORM
- **XSS Protection** built into React
- **Input Validation** with Zod schemas

## 📊 Database Schema

The application uses **PostgreSQL 16** with **Drizzle ORM** for type-safe database operations.

### Main Tables (15+)

- `wiki_pages` - Page content and metadata
- `comments` - Page comments
- `directories` - Folder structure
- `teams` - Team workspaces
- `members` - Team members
- `calendar_events` - Team calendar events
- `tasks` - Task management
- `files` - File uploads
- `templates` - Page templates
- `notifications` - User notifications
- `workflows` - Automation workflows
- `saved_views` - Saved filters/views
- `page_permissions` - Access control
- `team_roles` - Role management
- `sessions` - User sessions

## 🚀 Deployment

### Docker Deployment (Recommended)

```bash
# Production build and run
docker-compose up -d --build

# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

### Supported Platforms

- ✅ **Docker & Docker Compose** (any platform)
- ✅ **Replit** (pre-configured)
- ✅ **Vercel** (serverless deployment)
- ✅ **Render** (Docker deployment)
- ✅ **Railway** (Docker deployment)
- ✅ **Ubuntu Server** (see [deployment guide](docs/ubuntu-deployment-guide.md))

### Health Check

The application exposes a health check endpoint:

```bash
GET /health

Response:
{
  "status": "healthy",
  "time": "2025-11-08T10:00:00.000Z",
  "uptimeSeconds": 3600,
  "version": "1.0.0"
}
```

## 📚 Documentation

Comprehensive documentation is available in the `docs/` directory:

- **[📋 Final Evaluation](docs/PROJECT_FINAL_EVALUATION.md)** - ⭐ **Start Here!** Comprehensive project overview
- **[🛠 Development Guide](docs/development-guide.md)** - Setup and development workflow
- **[👤 User Guide](docs/user-guide.md)** - End-user documentation
- **[🔐 RBAC Guide](docs/rbac-guide.md)** - Security and permissions
- **[🤖 AI Features Guide](docs/ai-features-guide.md)** - AI integration details
- **[🧪 Test Cases](docs/backend-test-cases.md)** - Testing documentation
- **[🗺 Roadmap](docs/roadmap.md)** - Future development plans

## 🎯 Key Statistics

- **Total Code**: ~25,000 lines of TypeScript
- **Components**: 80+ React components
- **API Endpoints**: 100+ REST endpoints
- **Database Tables**: 15 tables
- **Test Coverage**: High reliability across E2E and integration tests
- **Development Time**: 4 weeks
- **Team Size**: 1 developer

## 🌟 Highlights

### What Makes Papyr.us Special

1. **🎨 Modern UX** - Beautiful, responsive design with dark mode
2. **⚡ Real-time** - Socket.IO + Yjs CRDT for live collaboration
3. **🤖 AI-Powered** - GPT-4o integration for smart features
4. **🔒 Secure** - Production-ready security implementation
5. **🧪 Well-Tested** - Comprehensive test coverage
6. **📦 Type-Safe** - Full TypeScript with Zod validation
7. **🐳 Container-Ready** - Docker deployment out of the box
8. **📖 Well-Documented** - Extensive documentation

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guidelines](CONTRIBUTING.md) before submitting a PR.

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`npm test && npm run e2e`)
5. Lint your code (`npm run lint`)
6. Commit your changes (`git commit -m 'Add amazing feature'`)
7. Push to the branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **shadcn/ui** for the beautiful component library
- **Drizzle ORM** for type-safe database operations
- **OpenAI** for GPT-4o API
- **Socket.IO** for real-time communication
- **Yjs** for CRDT implementation
- All open-source contributors

---

**Built with ❤️ using modern web technologies**

For more information, visit the [documentation](docs/PROJECT_FINAL_EVALUATION.md) or open an issue.
