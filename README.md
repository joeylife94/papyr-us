# Wiki Platform

A comprehensive wiki platform built with React and Express.js, enabling collaborative knowledge management through advanced markdown support, dynamic directory structures, and intelligent content organization.

## Features

- 📝 Advanced markdown support with syntax highlighting
- 🏗️ Dynamic directory structures
- 🔍 Full-text search and tag filtering
- 📅 Team calendar integration
- 🎨 Modern UI with dark/light theme support
- ⚡ Real-time updates with hot reload
- 🔐 Directory-based access control
- 🤖 AI Assistant powered by GPT-4o for content generation

## Tech Stack

### Frontend
- React 18 with TypeScript
- Vite for fast development
- Tailwind CSS for styling
- shadcn/ui components
- TanStack Query for state management
- Wouter for routing

### Backend
- Express.js with TypeScript
- PostgreSQL 16 with Drizzle ORM
- RESTful API design
- Docker containerization

## Quick Start

### 🐳 Docker 환경 (권장)

이 프로젝트는 **Docker 환경에서 개발**하는 것을 권장합니다.

#### Prerequisites
- Docker Desktop
- Docker Compose

#### Docker Development

1. **Clone and start with Docker:**
   ```bash
   git clone <your-repo-url>
   cd papyr-us
   docker-compose up --build
   ```

2. **Set up environment (optional):**
   ```bash
   cp .env.example .env
   # Edit .env file with your preferred settings
   ```

3. **Access the application:**
   - **Frontend**: `http://localhost:5001/papyr-us/`
   - **API**: `http://localhost:5001/papyr-us/api/`

### 🔧 로컬 환경 (대안)

Docker 환경을 사용할 수 없는 경우에만 사용하세요.

#### Prerequisites
- Node.js 18+ 
- npm or yarn
- PostgreSQL 16 (선택사항)

#### Local Development

1. **Clone and install dependencies:**
   ```bash
   git clone <your-repo-url>
   cd papyr-us
   npm install
   ```

2. **Set up environment:**
   ```bash
   cp .env.example .env
   # Edit .env file with your preferred settings
   ```

3. **Start development server:**
   
   **Option A: Using npm scripts**
   ```bash
   npm run dev
   ```
   
   **Option B: Using convenience scripts**
   ```bash
   # For Linux/Mac
   ./local-dev.sh
   
   # For Windows
   local-dev.bat
   ```
   
   The application will be available at `http://localhost:5001`

4. **Build for production:**
   ```bash
   npm run build
   npm start
   ```

### Replit Deployment

This project is pre-configured for Replit:

1. Import the project to Replit
2. Click "Run" - all dependencies will be installed automatically
3. The app will be available at your Replit URL

## Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run check` - Type checking with TypeScript

## Project Structure

```
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/         # Page components
│   │   ├── hooks/         # Custom React hooks
│   │   └── lib/           # Utility functions
├── server/                # Backend Express server
│   ├── routes.ts          # API routes
│   ├── storage.ts         # Data storage layer
│   └── services/          # Business logic
├── shared/                # Shared types and schemas
└── dist/                  # Production build output
```

## Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
NODE_ENV=development
PORT=5001

# Optional: Database configuration
# DATABASE_URL=postgresql://...

# AI Assistant configuration (required for AI features)
OPENAI_API_KEY=your_openai_api_key_here
```

### Storage Options

The application uses **PostgreSQL 16** as the primary database:

1. **Docker 환경**: PostgreSQL이 자동으로 설정됩니다
2. **로컬 환경**: PostgreSQL을 별도로 설치하고 `DATABASE_URL` 환경 변수를 설정하세요
3. **개발용**: 메모리 저장소도 지원됩니다 (자동 전환)

## Features Overview

### Wiki Pages
- Create, edit, and delete wiki pages
- Markdown support with live preview
- Tag-based organization
- Full-text search

### Directory Management
- Organize pages into folders
- Custom directory structures
- Password-protected directories

### Team Collaboration
- Team-specific calendars
- Shared workspaces
- Member management

### AI Integration (Optional)
- Content suggestions
- Auto-summarization
- Smart content generation
- GPT-4o powered assistance

## Development

### Adding New Features

1. Define data models in `shared/schema.ts`
2. Update storage interface in `server/storage.ts`
3. Add API routes in `server/routes.ts`
4. Create frontend components in `client/src/`

### Code Style

- TypeScript for type safety
- ESLint and Prettier for code formatting
- Consistent naming conventions
- Component-based architecture

## Deployment

### Local Production

```bash
npm run build
NODE_ENV=production npm start
```

### Cloud Platforms

This application works on:
- Replit (pre-configured)
- Vercel
- Netlify
- Railway
- Heroku

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details