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
- In-memory storage (expandable to PostgreSQL)
- RESTful API design

## Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Local Development

1. **Clone and install dependencies:**
   ```bash
   git clone <your-repo-url>
   cd wiki-platform
   npm install
   ```

2. **Set up environment (optional):**
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

By default, the application uses in-memory storage. For persistent data:

1. Set up PostgreSQL database
2. Add `DATABASE_URL` to your environment variables
3. The application will automatically use database storage

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