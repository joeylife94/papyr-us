import type { Express } from 'express';
import { createServer, type Server as HttpServer } from 'http';
import { Server as SocketIoServer } from 'socket.io';
import {
  authMiddleware,
  requireAdmin,
  writeAuthGate,
  buildRateLimiter,
  requireAuthIfEnabled,
  requirePagePermission,
  requireTeamMembership,
  requireTeamRole,
  optionalAuth,
  type AuthRequest,
} from './middleware.js';
import { config } from './config.js';
import {
  insertWikiPageSchema,
  updateWikiPageSchema,
  searchSchema,
  insertCalendarEventSchema,
  updateCalendarEventSchema,
  insertDirectorySchema,
  updateDirectorySchema,
  insertCommentSchema,
  updateCommentSchema,
  insertMemberSchema,
  updateMemberSchema,
  insertTaskSchema,
  updateTaskSchema,
  insertNotificationSchema,
  updateNotificationSchema,
  insertTemplateCategorySchema,
  updateTemplateCategorySchema,
  insertTemplateSchema,
  updateTemplateSchema,
  insertTeamSchema,
  insertSavedViewSchema,
  updateSavedViewSchema,
  pageFavorites,
  pageViews,
  activityFeed,
  wikiPages,
  tasks,
  comments,
  users,
  type CalendarEvent,
  type Task,
} from '../shared/schema.js';
import {
  upload,
  processUploadedFile,
  deleteUploadedFile,
  listUploadedFiles,
  getFileInfo,
  getFileTeamId,
} from './services/upload.js';
import { smartSearch, generateSearchSuggestions, inlineAIAction } from './services/ai.js';
import * as aiService from './services/ai.js';
import { aiAssistant } from './services/ai-assistant.js';
import { triggerWorkflows, initWorkflowService, executeWorkflow } from './services/workflow.js';
import logger from './services/logger.js';
import { ExternalIntegrationError } from './services/resilience.js';
import path from 'path';
import { existsSync, appendFileSync } from 'fs';
import type { Request } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import passport from 'passport';
import { eq, and, isNull } from 'drizzle-orm';
import { DBStorage } from './storage.js';
import { featureFlags } from './features.js';

interface MulterRequest extends Request {
  files?: any[];
}

export async function registerRoutes(
  app: Express,
  storage: DBStorage
): Promise<{ httpServer: HttpServer; io?: SocketIoServer }> {
  const httpServer = createServer(app);
  let io: SocketIoServer | undefined;

  // Expose storage to middleware via app.locals
  app.locals.storage = storage;

  // Initialize Passport for OAuth strategies
  app.use(passport.initialize());
  const { initPassportStrategies } = await import('./services/passport.js');
  initPassportStrategies(storage.db);

  // Setup Socket.IO / Yjs collaboration (feature-gated)
  // In personal mode, collaboration is disabled by default and should not:
  // - initialize Socket.IO namespaces
  // - register socket listeners
  // - start Yjs persistence intervals
  // - write to DB via realtime handlers
  const enableRealtimeSockets =
    featureFlags.FEATURE_COLLABORATION || featureFlags.FEATURE_NOTIFICATIONS;
  if (enableRealtimeSockets) {
    try {
      const { setupSocketIO } = await import('./services/socket.js');
      io = await setupSocketIO(httpServer, storage, {
        enableCollaboration: featureFlags.FEATURE_COLLABORATION,
        enableNotifications: featureFlags.FEATURE_NOTIFICATIONS,
      });

      // Setup Yjs CRDT collaboration for conflict-free concurrent editing
      if (featureFlags.FEATURE_COLLABORATION) {
        const { setupYjsCollaboration } = await import('./services/yjs-collaboration.js');
        setupYjsCollaboration(io, storage);
        logger.info('Yjs CRDT collaboration system initialized');
      }
    } catch (error) {
      logger.warn('Socket.IO/Yjs setup failed:', { error });
    }
  } else {
    logger.info('Realtime sockets disabled by feature flags', {
      FEATURE_COLLABORATION: featureFlags.FEATURE_COLLABORATION,
      FEATURE_NOTIFICATIONS: featureFlags.FEATURE_NOTIFICATIONS,
    });
  }

  // Initialize shared storage for workflow service
  initWorkflowService(storage);

  // --- Authentication Routes ---

  // Optional global write guard (no-op unless ENFORCE_AUTH_WRITES=true)
  app.use(writeAuthGate);

  // --- Health Check ---
  app.get('/health', async (req, res) => {
    const uptime = process.uptime();
    const now = new Date();
    const version = process.env.npm_package_version || '0.0.0';
    const memUsage = process.memoryUsage();

    // Check database connectivity
    let dbStatus = 'unknown';
    try {
      const pool = (storage as any).pool;
      if (pool) {
        await pool.query('SELECT 1');
        dbStatus = 'connected';
      }
    } catch {
      dbStatus = 'disconnected';
    }

    res.json({
      status: dbStatus === 'connected' ? 'healthy' : 'degraded',
      time: now.toISOString(),
      uptimeSeconds: Math.round(uptime),
      version,
      database: dbStatus,
      memory: {
        heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
        rssMB: Math.round(memUsage.rss / 1024 / 1024),
      },
    });
  });

  // --- Feature Flags (client runtime config) ---
  // Source of truth is server env; client reads flags from this endpoint.
  app.get('/api/features', (req, res) => {
    res.json(featureFlags);
  });

  // Rate limiters (enabled by config)
  const rlAuth = buildRateLimiter({ windowMs: 60_000, max: 20 }); // tighter for auth endpoints
  const rlAdmin = buildRateLimiter({ windowMs: 60_000, max: 30 });
  const rlUpload = buildRateLimiter({ windowMs: 60_000, max: 30 });
  const rlAI = buildRateLimiter({ windowMs: 60_000, max: 15 }); // AI endpoints are expensive
  const rlAnalytics = buildRateLimiter({ windowMs: 60_000, max: 60 }); // analytics view recording

  // User Registration
  app.post('/api/auth/register', rlAuth, async (req, res) => {
    try {
      if (process.env.E2E_DEBUG_AUTH === '1') {
        logger.debug('[E2E DEBUG] /api/auth/register body', {
          name: req.body?.name,
          email: req.body?.email,
        });
      }
      const { name, email, password } = req.body;
      if (!name || !email || !password) {
        return res.status(400).json({ message: 'Name, email, and password are required' });
      }

      // Validate name length
      if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 100) {
        return res.status(400).json({ message: 'Name must be between 1 and 100 characters' });
      }

      // Validate email format and length
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (typeof email !== 'string' || email.length > 255 || !emailRegex.test(email)) {
        return res.status(400).json({ message: 'Invalid email format' });
      }

      // Validate password strength (min 8 chars, at least one letter and one number)
      if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
        return res.status(400).json({ message: 'Password must be between 8 and 128 characters' });
      }
      if (
        !/[a-zA-Z]/.test(password) ||
        !/[0-9]/.test(password) ||
        !/[!@#$%^&*(),.?":{}|<>]/.test(password)
      ) {
        return res.status(400).json({
          message:
            'Password must contain at least one letter, one number, and one special character',
        });
      }

      const existingUser = await storage.db.select().from(users).where(eq(users.email, email));
      if (existingUser.length > 0) {
        return res.status(409).json({ message: 'User with this email already exists' });
      }

      const hashedPassword = await bcrypt.hash(password, 12);

      const newUserResult = await storage.db
        .insert(users)
        .values({ name, email, hashedPassword, provider: 'local' })
        .returning();
      const newUser = newUserResult[0];
      if (process.env.E2E_DEBUG_AUTH === '1') {
        logger.debug('[E2E DEBUG] /api/auth/register response user', {
          id: newUser.id,
          email: newUser.email,
        });
      }

      // Issue access token (1 hour) and refresh token (30 days)
      const role = config.adminEmails.includes(email.toLowerCase()) ? 'admin' : 'user';
      const accessToken = jwt.sign(
        { id: newUser.id, email: newUser.email, role },
        config.jwtSecret,
        {
          expiresIn: '1h',
        }
      );
      const refreshToken = jwt.sign({ id: newUser.id, type: 'refresh' }, config.jwtSecret, {
        expiresIn: '30d',
      });

      res
        .cookie('accessToken', accessToken, {
          httpOnly: true,
          secure: config.isProduction,
          sameSite: 'lax',
          maxAge: 60 * 60 * 1000,
        })
        .cookie('refreshToken', refreshToken, {
          httpOnly: true,
          secure: config.isProduction,
          sameSite: 'lax',
          maxAge: 30 * 24 * 60 * 60 * 1000,
        })
        .status(201)
        .json({
          message: 'User registered successfully',
          user: { id: newUser.id, name: newUser.name, email: newUser.email, role },
        });
    } catch (error: any) {
      logger.error('Registration critical error:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        code: error.code,
        stack: error instanceof Error ? error.stack : undefined,
      });
      // Handle unique constraint violation for PostgreSQL (code 23505)
      if (error.code === '23505') {
        return res.status(409).json({ message: 'User with this email already exists' });
      }
      res.status(500).json({ message: 'Server error during registration' });
    }
  });

  // User Login
  app.post('/api/auth/login', rlAuth, async (req, res) => {
    try {
      if (process.env.E2E_DEBUG_AUTH === '1') {
        logger.debug('[E2E DEBUG] POST /api/auth/login body', { email: req.body?.email });
      }
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
      }

      const userResult = await storage.db.select().from(users).where(eq(users.email, email));
      if (userResult.length === 0) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      const user = userResult[0];
      if (!user.hashedPassword) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
      const isPasswordValid = await bcrypt.compare(password, user.hashedPassword);
      if (!isPasswordValid) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      const role =
        Array.isArray((config as any).adminEmails) &&
        (config as any).adminEmails.includes((user.email || '').toLowerCase())
          ? 'admin'
          : 'user';

      // Issue access token (1 hour) and refresh token (30 days)
      const accessToken = jwt.sign({ id: user.id, email: user.email, role }, config.jwtSecret, {
        expiresIn: '1h',
      });
      const refreshToken = jwt.sign({ id: user.id, type: 'refresh' }, config.jwtSecret, {
        expiresIn: '30d',
      });

      if (process.env.E2E_DEBUG_AUTH === '1' || process.env.NODE_ENV !== 'production') {
        logger.debug('[E2E DEBUG] login success:', {
          id: user.id,
          email: user.email,
          role,
          accessTokenPresent: !!accessToken,
          refreshTokenPresent: !!refreshToken,
        });
      }

      res
        .cookie('accessToken', accessToken, {
          httpOnly: true,
          secure: config.isProduction,
          sameSite: 'lax',
          maxAge: 60 * 60 * 1000,
        })
        .cookie('refreshToken', refreshToken, {
          httpOnly: true,
          secure: config.isProduction,
          sameSite: 'lax',
          maxAge: 30 * 24 * 60 * 60 * 1000,
        })
        .json({
          user: { id: user.id, name: user.name, email: user.email, role },
        });
    } catch (error) {
      res.status(500).json({ message: 'Server error during login' });
    }
  });

  // Refresh access token using refresh token (reads from httpOnly cookie)
  app.post('/api/auth/refresh', rlAuth, async (req, res) => {
    try {
      // Cookie-based refresh token only ? no body fallback
      const refreshToken = (req as any).cookies?.refreshToken;

      if (!refreshToken) {
        return res.status(401).json({ message: 'Refresh token required' });
      }

      // Verify refresh token
      const payload = jwt.verify(refreshToken, config.jwtSecret) as { id: number; type: string };

      if (payload.type !== 'refresh') {
        return res.status(401).json({ message: 'Invalid refresh token' });
      }

      // Get user info
      const userResult = await storage.db.select().from(users).where(eq(users.id, payload.id));

      if (userResult.length === 0) {
        return res.status(404).json({ message: 'User not found' });
      }

      const user = userResult[0];
      const role = config.adminEmails.includes(user.email.toLowerCase()) ? 'admin' : 'user';

      // Issue new access token (7 days) and refresh token (30 days) - token rotation
      const newAccessToken = jwt.sign({ id: user.id, email: user.email, role }, config.jwtSecret, {
        expiresIn: '1h',
      });
      const newRefreshToken = jwt.sign({ id: user.id, type: 'refresh' }, config.jwtSecret, {
        expiresIn: '30d',
      });

      res
        .cookie('accessToken', newAccessToken, {
          httpOnly: true,
          secure: config.isProduction,
          sameSite: 'lax',
          maxAge: 60 * 60 * 1000,
        })
        .cookie('refreshToken', newRefreshToken, {
          httpOnly: true,
          secure: config.isProduction,
          sameSite: 'lax',
          maxAge: 30 * 24 * 60 * 60 * 1000,
        })
        .json({
          user: { id: user.id, name: user.name, email: user.email, role },
        });
    } catch (error) {
      logger.error('Token refresh failed:', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      res.status(401).json({ message: 'Invalid or expired refresh token' });
    }
  });

  // Get current user info (Protected Route)
  app.get('/api/auth/me', authMiddleware, async (req: any, res) => {
    try {
      if (process.env.E2E_DEBUG_AUTH === '1') {
        logger.debug('[E2E DEBUG] GET /api/auth/me', {
          hasAuthHeader: !!req.headers.authorization,
          userId: (req.user as any)?.id,
        });
      }
      const userResult = await storage.db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, req.user.id));
      if (userResult.length === 0) {
        return res.status(404).json({ message: 'User not found' });
      }
      // Backward-compat: return only base user info here; role is available from JWT if needed
      res.json(userResult[0]);
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  });

  // Logout ? clear auth cookies
  app.post('/api/auth/logout', (req, res) => {
    res
      .clearCookie('accessToken', {
        httpOnly: true,
        secure: config.isProduction,
        sameSite: 'lax',
      })
      .clearCookie('refreshToken', {
        httpOnly: true,
        secure: config.isProduction,
        sameSite: 'lax',
      })
      .json({ message: 'Logged out successfully' });
  });

  // Passport automatically handles OAuth2 state/nonce validation. SameSite=Lax is required for cross-site top-level redirects.
  // --- Social Auth Routes ---

  // Google Auth
  if (config.googleClientId && config.googleClientSecret) {
    app.get('/api/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
    app.get(
      '/api/auth/google/callback',
      passport.authenticate('google', { failureRedirect: '/login', session: false }),
      (req: any, res) => {
        const role = config.adminEmails.includes(req.user.email.toLowerCase()) ? 'admin' : 'user';
        const accessToken = jwt.sign(
          { id: req.user.id, email: req.user.email, role },
          config.jwtSecret,
          {
            expiresIn: '1h',
          }
        );
        const refreshToken = jwt.sign({ id: req.user.id, type: 'refresh' }, config.jwtSecret, {
          expiresIn: '30d',
        });
        res
          .cookie('accessToken', accessToken, {
            httpOnly: true,
            secure: config.isProduction,
            sameSite: 'lax', // Lax required: callback arrives via cross-site IdP redirect
            maxAge: 60 * 60 * 1000,
          })
          .cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: config.isProduction,
            sameSite: 'lax', // Lax required: callback arrives via cross-site IdP redirect
            maxAge: 30 * 24 * 60 * 60 * 1000,
          })
          .redirect('/');
      }
    );
  }

  // GitHub Auth
  if (config.githubClientId && config.githubClientSecret) {
    app.get('/api/auth/github', passport.authenticate('github', { scope: ['user:email'] }));
    app.get(
      '/api/auth/github/callback',
      passport.authenticate('github', { failureRedirect: '/login', session: false }),
      (req: any, res) => {
        const role = config.adminEmails.includes(req.user.email.toLowerCase()) ? 'admin' : 'user';
        const accessToken = jwt.sign(
          { id: req.user.id, email: req.user.email, role },
          config.jwtSecret,
          {
            expiresIn: '1h',
          }
        );
        const refreshToken = jwt.sign({ id: req.user.id, type: 'refresh' }, config.jwtSecret, {
          expiresIn: '30d',
        });
        res
          .cookie('accessToken', accessToken, {
            httpOnly: true,
            secure: config.isProduction,
            sameSite: 'lax', // Lax required: callback arrives via cross-site IdP redirect
            maxAge: 60 * 60 * 1000,
          })
          .cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: config.isProduction,
            sameSite: 'lax', // Lax required: callback arrives via cross-site IdP redirect
            maxAge: 30 * 24 * 60 * 60 * 1000,
          })
          .redirect('/');
      }
    );
  }

  // Wiki Pages API
  app.get('/api/pages', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const teamIdParam = req.query.teamId as string;
      const cursor = req.query.cursor as string | undefined;

      // Resolve teamName string to numeric team ID
      let resolvedTeamId: number | undefined;
      if (teamIdParam) {
        if (!isNaN(parseInt(teamIdParam))) {
          resolvedTeamId = parseInt(teamIdParam);
        } else {
          const team = await storage.getTeamByName(teamIdParam);
          if (team) {
            resolvedTeamId = team.id;
          }
        }
      }

      // If teamId is specified and user is authenticated, verify team membership
      if (resolvedTeamId && req.user?.id) {
        const userTeamIds = await storage.getUserTeamIds(req.user.id);
        if (!userTeamIds.includes(resolvedTeamId)) {
          return res.status(403).json({ message: 'You are not a member of this team' });
        }
      } else if (resolvedTeamId && config.enforceAuthForWrites) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      // If no teamId specified, scope to user's teams + global pages
      if (!resolvedTeamId && req.user?.id) {
        const userTeamIds = await storage.getUserTeamIds(req.user.id);
        // Search pages across all user's teams and unassigned (global) pages
        const allResults = await Promise.all([
          ...userTeamIds.map((tid) => {
            const params = searchSchema.parse({
              query: req.query.q as string,
              folder: req.query.folder as string,
              sort: req.query.sort as string as any,
              tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
              limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
              offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
              teamId: String(tid),
            });
            return storage.searchWikiPages(params);
          }),
          // Also include pages with no team (personal/shared pages)
          storage.searchWikiPages(
            searchSchema.parse({
              query: req.query.q as string,
              folder: req.query.folder as string,
              sort: req.query.sort as string as any,
              tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
              limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
              offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
              teamId: 'null',
            })
          ),
        ]);

        // Merge and deduplicate by page id
        const seenIds = new Set<number>();
        const mergedPages = allResults
          .flatMap((r) => r.pages)
          .filter((p) => {
            if (seenIds.has(p.id)) return false;
            seenIds.add(p.id);
            return true;
          });

        const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
        const paginatedPages = mergedPages.slice(0, limit);
        const hasMore = mergedPages.length > limit;
        const nextCursor = hasMore ? paginatedPages[paginatedPages.length - 1]?.id : null;

        return res.json({
          pages: paginatedPages,
          total: mergedPages.length,
          pagination: { hasMore, nextCursor, count: paginatedPages.length },
        });
      } else if (!resolvedTeamId && !req.user?.id) {
        // Unauthenticated: in prod reject, in dev return only global pages
        if (config.enforceAuthForWrites) {
          return res.status(401).json({ message: 'Authentication required' });
        }
        // Dev mode unauthenticated ? only global (teamId IS NULL) pages
        const searchParams = searchSchema.parse({
          query: req.query.q as string,
          folder: req.query.folder as string,
          sort: req.query.sort as string as any,
          tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
          limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
          offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
          teamId: 'null',
        });
        const result = await storage.searchWikiPages(searchParams);
        const hasMore = result.pages.length === (searchParams.limit || 20);
        const nextCursor = hasMore ? result.pages[result.pages.length - 1]?.id : null;
        return res.json({
          ...result,
          pagination: { hasMore, nextCursor, count: result.pages.length },
        });
      }

      // resolvedTeamId is specified ? already membership-checked above
      const searchParams = searchSchema.parse({
        query: req.query.q as string,
        folder: req.query.folder as string,
        sort: req.query.sort as string as any,
        tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
        teamId: String(resolvedTeamId),
      });

      const result = await storage.searchWikiPages(searchParams);

      // Add cursor-based pagination metadata
      const hasMore = result.pages.length === (searchParams.limit || 20);
      const nextCursor = hasMore ? result.pages[result.pages.length - 1]?.id : null;

      res.json({
        ...result,
        pagination: {
          hasMore,
          nextCursor,
          count: result.pages.length,
        },
      });
    } catch (error) {
      res.status(400).json({ message: 'Invalid search parameters' });
    }
  });

  app.get('/api/pages/:id', optionalAuth, requirePagePermission('viewer'), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const page = await storage.getWikiPage(id);

      if (!page) {
        return res.status(404).json({ message: 'Page not found' });
      }

      res.json(page);
    } catch (error) {
      res.status(400).json({ message: 'Invalid page ID' });
    }
  });

  app.get(
    '/api/pages/slug/:slug',
    optionalAuth,
    requirePagePermission('viewer'),
    async (req, res) => {
      try {
        // Use page resolved by requirePagePermission middleware if available
        const page =
          (req as any)._resolvedPage || (await storage.getWikiPageBySlug(req.params.slug));

        if (!page) {
          return res.status(404).json({ message: 'Page not found' });
        }

        res.json(page);
      } catch (error) {
        res.status(500).json({ message: 'Server error' });
      }
    }
  );

  app.post(
    '/api/pages',
    requireAuthIfEnabled,
    requireTeamMembership,
    async (req: AuthRequest, res) => {
      try {
        // Removed temporary E2E triage logging. The instrumentation used to write
        // `test-server-received-posts.log` during debugging has been cleaned up.

        const pageData = insertWikiPageSchema.parse(req.body);

        // If teamId is provided, find the actual team ID
        if (pageData.teamId && typeof pageData.teamId === 'string') {
          const team = await storage.getTeamByName(pageData.teamId);
          if (team) {
            pageData.teamId = team.id;
          } else {
            return res.status(400).json({ message: 'Team not found' });
          }
        }

        // Pass creator user ID for automatic owner permission assignment
        const creatorUserId = req.user?.id;
        const page = creatorUserId
          ? await storage.createWikiPage(pageData, creatorUserId)
          : await storage.createWikiPage(pageData);

        // Trigger workflows for page_created event
        triggerWorkflows('page_created', {
          id: page.id,
          title: page.title,
          slug: page.slug,
          content: page.content,
          folder: page.folder,
          tags: page.tags,
          author: page.author,
          teamId: page.teamId,
        }).catch((error) => {
          logger.error('Failed to trigger workflows for page_created:', {
            pageId: page.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        });

        res.status(201).json(page);
      } catch (error) {
        res.status(400).json({ message: 'Invalid page data', error });
      }
    }
  );

  app.put(
    '/api/pages/:id',
    requireAuthIfEnabled,
    requirePagePermission('editor'),
    async (req: AuthRequest, res) => {
      try {
        const id = parseInt(req.params.id);
        const updateData = updateWikiPageSchema.parse(req.body);

        // Get old page data for comparison and version snapshot
        const oldPage = await storage.getWikiPage(id);

        // Save a version snapshot BEFORE updating (only if content/blocks changed)
        if (oldPage && (updateData.content !== undefined || updateData.blocks !== undefined)) {
          try {
            // Get the current max version number
            const db = (storage as any).db;
            if (db) {
              const { pageVersions } = await import('@shared/schema');
              const { desc, eq, sql } = await import('drizzle-orm');
              const [latestVersion] = await db
                .select({
                  maxVersion: sql<number>`COALESCE(MAX(${pageVersions.versionNumber}), 0)`,
                })
                .from(pageVersions)
                .where(eq(pageVersions.pageId, id));
              const nextVersion = (latestVersion?.maxVersion || 0) + 1;

              await db.insert(pageVersions).values({
                pageId: id,
                title: oldPage.title,
                content: oldPage.content,
                blocks: oldPage.blocks || [],
                author: oldPage.author,
                versionNumber: nextVersion,
                changeDescription: `Version ${nextVersion}`,
              });
            }
          } catch (versionError) {
            // Don't block page update if version creation fails
            console.error('Failed to create page version:', versionError);
          }
        }

        const page = await storage.updateWikiPage(id, updateData);

        if (!page) {
          return res.status(404).json({ message: 'Page not found' });
        }

        // Trigger workflows for page_updated event
        triggerWorkflows('page_updated', {
          id: page.id,
          title: page.title,
          slug: page.slug,
          content: page.content,
          folder: page.folder,
          tags: page.tags,
          author: page.author,
          teamId: page.teamId,
          oldTags: oldPage?.tags || [],
          newTags: page.tags,
        }).catch((error) => {
          console.error('Failed to trigger workflows for page_updated:', error);
        });

        // Check if tags were added
        if (oldPage && updateData.tags) {
          const addedTags = updateData.tags.filter((tag) => !oldPage.tags.includes(tag));
          if (addedTags.length > 0) {
            triggerWorkflows('tag_added', {
              id: page.id,
              title: page.title,
              tags: addedTags,
              teamId: page.teamId,
            }).catch((error) => {
              console.error('Failed to trigger workflows for tag_added:', error);
            });
          }
        }

        res.json(page);
      } catch (error) {
        res.status(400).json({ message: 'Invalid update data', error });
      }
    }
  );

  // Page Version History API
  app.get(
    '/api/pages/:id/versions',
    optionalAuth,
    requirePagePermission('viewer'),
    async (req, res) => {
      try {
        const pageId = parseInt(req.params.id);
        const db = (storage as any).db;
        if (!db) return res.status(500).json({ error: 'Database not available' });

        const { pageVersions } = await import('@shared/schema');
        const { desc, eq } = await import('drizzle-orm');

        const versions = await db
          .select({
            id: pageVersions.id,
            pageId: pageVersions.pageId,
            title: pageVersions.title,
            author: pageVersions.author,
            versionNumber: pageVersions.versionNumber,
            changeDescription: pageVersions.changeDescription,
            createdAt: pageVersions.createdAt,
          })
          .from(pageVersions)
          .where(eq(pageVersions.pageId, pageId))
          .orderBy(desc(pageVersions.versionNumber));

        res.json(versions);
      } catch (error) {
        console.error('Error fetching page versions:', error);
        res.status(500).json({ error: 'Failed to fetch page versions' });
      }
    }
  );

  app.get(
    '/api/pages/:id/versions/:versionId',
    optionalAuth,
    requirePagePermission('viewer'),
    async (req, res) => {
      try {
        const versionId = parseInt(req.params.versionId);
        const db = (storage as any).db;
        if (!db) return res.status(500).json({ error: 'Database not available' });

        const { pageVersions } = await import('@shared/schema');
        const { eq } = await import('drizzle-orm');

        const [version] = await db
          .select()
          .from(pageVersions)
          .where(eq(pageVersions.id, versionId));

        if (!version) {
          return res.status(404).json({ error: 'Version not found' });
        }

        res.json(version);
      } catch (error) {
        console.error('Error fetching page version:', error);
        res.status(500).json({ error: 'Failed to fetch page version' });
      }
    }
  );

  // Restore a specific version
  app.post(
    '/api/pages/:id/versions/:versionId/restore',
    requireAuthIfEnabled,
    requirePagePermission('editor'),
    async (req: AuthRequest, res) => {
      try {
        const pageId = parseInt(req.params.id);
        const versionId = parseInt(req.params.versionId);
        const db = (storage as any).db;
        if (!db) return res.status(500).json({ error: 'Database not available' });

        const { pageVersions } = await import('@shared/schema');
        const { eq } = await import('drizzle-orm');

        const [version] = await db
          .select()
          .from(pageVersions)
          .where(eq(pageVersions.id, versionId));

        if (!version) {
          return res.status(404).json({ error: 'Version not found' });
        }

        // Restore the page to this version
        const restoredPage = await storage.updateWikiPage(pageId, {
          title: version.title,
          content: version.content,
          blocks: version.blocks as any,
        });

        if (!restoredPage) {
          return res.status(404).json({ error: 'Page not found' });
        }

        res.json(restoredPage);
      } catch (error) {
        console.error('Error restoring page version:', error);
        res.status(500).json({ error: 'Failed to restore page version' });
      }
    }
  );

  app.delete(
    '/api/pages/:id',
    requireAuthIfEnabled,
    requirePagePermission('owner'),
    async (req: AuthRequest, res) => {
      try {
        const id = parseInt(req.params.id);

        // Get page data before deletion
        const page = await storage.getWikiPage(id);

        const deleted = await storage.deleteWikiPage(id);

        if (!deleted) {
          return res.status(404).json({ message: 'Page not found' });
        }

        // Trigger workflows for page_deleted event
        if (page) {
          triggerWorkflows('page_deleted', {
            id: page.id,
            title: page.title,
            slug: page.slug,
            folder: page.folder,
            tags: page.tags,
            teamId: page.teamId,
          }).catch((error) => {
            console.error('Failed to trigger workflows for page_deleted:', error);
          });
        }

        res.json({ message: 'Page moved to trash' });
      } catch (error) {
        res.status(400).json({ message: 'Invalid page ID' });
      }
    }
  );

  // ==================== Trash / Recycle Bin API ====================

  // List trashed pages
  app.get('/api/trash', requireAuthIfEnabled, async (req: AuthRequest, res) => {
    try {
      const teamId = req.query.teamId ? parseInt(req.query.teamId as string) : undefined;
      const pages = await storage.getTrashPages(teamId);
      res.json(pages);
    } catch (error) {
      logger.error('Error fetching trash:', { error });
      res.status(500).json({ error: 'Failed to fetch trash' });
    }
  });

  // Restore a page from trash
  app.post('/api/trash/:id/restore', requireAuthIfEnabled, async (req: AuthRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const restored = await storage.restoreWikiPage(id);
      if (!restored) {
        return res.status(404).json({ error: 'Page not found in trash' });
      }
      res.json(restored);
    } catch (error) {
      logger.error('Error restoring page:', { error });
      res.status(500).json({ error: 'Failed to restore page' });
    }
  });

  // Permanently delete a page
  app.delete('/api/trash/:id', requireAuthIfEnabled, async (req: AuthRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.permanentlyDeleteWikiPage(id);
      if (!deleted) {
        return res.status(404).json({ error: 'Page not found' });
      }
      res.json({ message: 'Page permanently deleted' });
    } catch (error) {
      logger.error('Error permanently deleting page:', { error });
      res.status(500).json({ error: 'Failed to permanently delete page' });
    }
  });

  // Empty entire trash
  app.delete('/api/trash', requireAuthIfEnabled, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const teamId = req.query.teamId ? parseInt(req.query.teamId as string) : undefined;
      const count = await storage.emptyTrash(teamId);
      res.json({ message: `${count} page(s) permanently deleted` });
    } catch (error) {
      logger.error('Error emptying trash:', { error });
      res.status(500).json({ error: 'Failed to empty trash' });
    }
  });

  // ==================== Page Duplicate / Clone API ====================

  app.post(
    '/api/pages/:id/duplicate',
    requireAuthIfEnabled,
    requirePagePermission('viewer'),
    async (req: AuthRequest, res) => {
      try {
        const id = parseInt(req.params.id);
        const db = (storage as any).db;
        if (!db) return res.status(500).json({ error: 'Database not available' });

        const original = await storage.getWikiPage(id);
        if (!original) {
          return res.status(404).json({ error: 'Page not found' });
        }

        // Generate unique slug
        const baseSlug = `${original.slug}-copy`;
        let slug = baseSlug;
        let suffix = 1;
        while (await storage.getWikiPageBySlug(slug)) {
          slug = `${baseSlug}-${suffix++}`;
        }

        const author = (req as any).user?.email || (req as any).user?.name || original.author;
        const cloned = await storage.createWikiPage(
          {
            title: `${original.title} (Copy)`,
            slug,
            content: original.content,
            blocks: original.blocks as any,
            folder: original.folder,
            tags: original.tags,
            author,
            parentId: original.parentId,
            teamId: original.teamId,
            isPublished: false,
            metadata: original.metadata as any,
          },
          (req as any).user?.id
        );

        res.status(201).json(cloned);
      } catch (error) {
        logger.error('Error duplicating page:', { error });
        res.status(500).json({ error: 'Failed to duplicate page' });
      }
    }
  );

  // ==================== Bulk Operations API ====================

  // Bulk move pages to folder
  app.post('/api/pages/bulk/move', requireAuthIfEnabled, async (req: AuthRequest, res) => {
    try {
      const { pageIds, folder } = req.body;
      if (!Array.isArray(pageIds) || !folder || typeof folder !== 'string') {
        return res.status(400).json({ error: 'pageIds (array) and folder (string) required' });
      }

      const db = (storage as any).db;
      const { inArray } = await import('drizzle-orm');
      const results = await db
        .update(wikiPages)
        .set({ folder, updatedAt: new Date() })
        .where(and(inArray(wikiPages.id, pageIds.map(Number)), isNull(wikiPages.deletedAt)))
        .returning();

      res.json({ updated: results.length });
    } catch (error) {
      logger.error('Error in bulk move:', { error });
      res.status(500).json({ error: 'Failed to move pages' });
    }
  });

  // Bulk add/remove tags
  app.post('/api/pages/bulk/tags', requireAuthIfEnabled, async (req: AuthRequest, res) => {
    try {
      const { pageIds, addTags, removeTags } = req.body;
      if (!Array.isArray(pageIds)) {
        return res.status(400).json({ error: 'pageIds (array) required' });
      }

      const db = (storage as any).db;
      let updated = 0;

      for (const pageId of pageIds) {
        const page = await storage.getWikiPage(Number(pageId));
        if (!page) continue;

        let tags = [...page.tags];
        if (Array.isArray(addTags)) {
          tags = Array.from(new Set([...tags, ...addTags]));
        }
        if (Array.isArray(removeTags)) {
          tags = tags.filter((t: string) => !removeTags.includes(t));
        }

        await storage.updateWikiPage(Number(pageId), { tags });
        updated++;
      }

      res.json({ updated });
    } catch (error) {
      logger.error('Error in bulk tag update:', { error });
      res.status(500).json({ error: 'Failed to update tags' });
    }
  });

  // Bulk delete (soft delete)
  app.post('/api/pages/bulk/delete', requireAuthIfEnabled, async (req: AuthRequest, res) => {
    try {
      const { pageIds } = req.body;
      if (!Array.isArray(pageIds)) {
        return res.status(400).json({ error: 'pageIds (array) required' });
      }

      let deleted = 0;
      for (const pageId of pageIds) {
        const success = await storage.deleteWikiPage(Number(pageId));
        if (success) deleted++;
      }

      res.json({ deleted });
    } catch (error) {
      logger.error('Error in bulk delete:', { error });
      res.status(500).json({ error: 'Failed to delete pages' });
    }
  });

  // ==================== Markdown Import API ====================

  app.post('/api/pages/import/markdown', requireAuthIfEnabled, async (req: AuthRequest, res) => {
    try {
      const { title, content, folder, tags, teamId } = req.body;
      if (!content || typeof content !== 'string') {
        return res.status(400).json({ error: 'content (string) required' });
      }

      const pageTitle =
        title ||
        content
          .split('\n')[0]
          ?.replace(/^#+\s*/, '')
          .trim() ||
        'Untitled Import';
      const slug =
        pageTitle
          .toLowerCase()
          .replace(/[^a-z0-9가-힣]+/g, '-')
          .replace(/^-|-$/g, '') +
        '-' +
        Date.now().toString(36);

      const author = (req as any).user?.email || (req as any).user?.name || 'imported';

      const page = await storage.createWikiPage(
        {
          title: pageTitle,
          slug,
          content,
          folder: folder || 'docs',
          tags: Array.isArray(tags) ? tags : [],
          author,
          teamId: teamId ? Number(teamId) : undefined,
          isPublished: true,
        },
        (req as any).user?.id
      );

      res.status(201).json(page);
    } catch (error) {
      logger.error('Error importing markdown:', { error });
      res.status(500).json({ error: 'Failed to import markdown' });
    }
  });

  // ==================== Dashboard Stats API ====================

  app.get('/api/stats/dashboard', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const db = (storage as any).db;
      if (!db) return res.status(500).json({ error: 'Database not available' });

      const { sql: sqlFn, count } = await import('drizzle-orm');

      // Total counts
      const [pageCount] = await db
        .select({ count: sqlFn`count(*)::int` })
        .from(wikiPages)
        .where(isNull(wikiPages.deletedAt));
      const [taskCount] = await db.select({ count: sqlFn`count(*)::int` }).from(tasks);
      const [commentCount] = await db.select({ count: sqlFn`count(*)::int` }).from(comments);
      const [userCount] = await db.select({ count: sqlFn`count(*)::int` }).from(users);

      // Pages created in last 7 days
      const [recentPages] = await db
        .select({ count: sqlFn`count(*)::int` })
        .from(wikiPages)
        .where(
          sqlFn`${wikiPages.createdAt} > NOW() - INTERVAL '7 days' AND ${wikiPages.deletedAt} IS NULL`
        );

      // Tasks completed in last 7 days
      const [recentTasks] = await db
        .select({ count: sqlFn`count(*)::int` })
        .from(tasks)
        .where(sqlFn`${tasks.status} = 'done' AND ${tasks.updatedAt} > NOW() - INTERVAL '7 days'`);

      // Page growth over last 30 days (daily)
      const pageGrowth = await db.execute(
        sqlFn`SELECT DATE(created_at) as date, COUNT(*)::int as count
              FROM wiki_pages
              WHERE created_at > NOW() - INTERVAL '30 days' AND deleted_at IS NULL
              GROUP BY DATE(created_at)
              ORDER BY date`
      );

      // Top contributors (by pages authored)
      const topContributors = await db.execute(
        sqlFn`SELECT author, COUNT(*)::int as pages_created
              FROM wiki_pages
              WHERE deleted_at IS NULL
              GROUP BY author
              ORDER BY pages_created DESC
              LIMIT 10`
      );

      // Task status breakdown
      const taskBreakdown = await db.execute(
        sqlFn`SELECT status, COUNT(*)::int as count
              FROM tasks
              GROUP BY status
              ORDER BY count DESC`
      );

      res.json({
        totals: {
          pages: pageCount.count,
          tasks: taskCount.count,
          comments: commentCount.count,
          users: userCount.count,
        },
        recent: {
          pagesThisWeek: recentPages.count,
          tasksCompletedThisWeek: recentTasks.count,
        },
        pageGrowth: pageGrowth.rows || pageGrowth,
        topContributors: topContributors.rows || topContributors,
        taskBreakdown: taskBreakdown.rows || taskBreakdown,
      });
    } catch (error) {
      logger.error('Error fetching dashboard stats:', { error });
      res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }
  });

  // Folder and Tag APIs
  app.get('/api/folders', async (req, res) => {
    try {
      const folders = await storage.getFolders();
      res.json(folders);
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  });

  app.get('/api/folders/:folder/pages', async (req, res) => {
    try {
      const folder = req.params.folder;
      const pages = await storage.getWikiPagesByFolder(folder);
      res.json(pages);
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  });

  app.get('/api/tags', async (req, res) => {
    try {
      const tags = await storage.getAllTags();
      res.json(tags);
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  });

  if (featureFlags.FEATURE_CALENDAR) {
    // Calendar Events API
    app.get('/api/calendar', optionalAuth, requireTeamMembership, async (req: AuthRequest, res) => {
      try {
        const teamId = req.query.teamId as string | undefined;

        // If no teamId specified, scope to user's teams to prevent full data leak
        let events: CalendarEvent[];
        if (!teamId) {
          const userTeamIds = (req as any).userTeamIds as number[] | undefined;
          if (userTeamIds && userTeamIds.length > 0) {
            const allEvents = await Promise.all(
              userTeamIds.map((id) => storage.getCalendarEvents(id))
            );
            events = allEvents.flat();
          } else {
            events = [];
          }
        } else {
          events = await storage.getCalendarEvents(Number(teamId));
        }

        // Ensure compatibility with new fields - add defaults if missing
        const safeEvents = events.map((event) => ({
          ...event,
          startTime: event.startTime || null,
          endTime: event.endTime || null,
          priority: event.priority || 1,
        }));

        res.json(safeEvents);
      } catch (error) {
        console.error('Error fetching calendar events:', error);
        res.status(500).json({ message: 'Server error' });
      }
    });

    app.get(
      '/api/calendar/:teamId',
      optionalAuth,
      requireTeamMembership,
      async (req: AuthRequest, res) => {
        try {
          const teamId = req.params.teamId;
          const events = await storage.getCalendarEvents(Number(teamId));

          // Ensure compatibility with new fields - add defaults if missing
          const safeEvents = events.map((event) => ({
            ...event,
            startTime: event.startTime || null,
            endTime: event.endTime || null,
            priority: event.priority || 1,
          }));

          res.json(safeEvents);
        } catch (error) {
          console.error('Error fetching calendar events:', error);
          res.status(500).json({ message: 'Server error' });
        }
      }
    );

    app.get('/api/calendar/event/:id', optionalAuth, async (req: AuthRequest, res) => {
      try {
        const id = parseInt(req.params.id);
        const event = await storage.getCalendarEvent(id);
        if (!event) {
          return res.status(404).json({ message: 'Event not found' });
        }

        // Verify the requester belongs to the event's team
        if (event.teamId && req.user?.id) {
          const userTeamIds = await storage.getUserTeamIds(req.user.id);
          if (!userTeamIds.includes(Number(event.teamId))) {
            return res.status(403).json({ message: 'You are not a member of this team' });
          }
        } else if (event.teamId && config.enforceAuthForWrites) {
          return res.status(401).json({ message: 'Authentication required' });
        }

        res.json(event);
      } catch (error) {
        res.status(500).json({ message: 'Server error' });
      }
    });

    app.post(
      '/api/calendar',
      requireAuthIfEnabled,
      requireTeamMembership,
      async (req: AuthRequest, res) => {
        try {
          // Convert ISO string dates to Date objects
          const requestData = { ...req.body };
          if (requestData.startDate && typeof requestData.startDate === 'string') {
            requestData.startDate = new Date(requestData.startDate);
          }
          if (requestData.endDate && typeof requestData.endDate === 'string') {
            requestData.endDate = new Date(requestData.endDate);
          }

          // If endDate is not provided or is null, set it to startDate
          if (!requestData.endDate && requestData.startDate) {
            requestData.endDate = new Date(requestData.startDate);
          }

          // Handle time fields - convert empty strings to null
          if (requestData.startTime === '' || requestData.startTime === undefined) {
            requestData.startTime = null;
          }
          if (requestData.endTime === '' || requestData.endTime === undefined) {
            requestData.endTime = null;
          }

          // Handle priority field - convert to integer and set default
          if (!requestData.priority || requestData.priority === undefined) {
            requestData.priority = 1;
          } else {
            requestData.priority = parseInt(requestData.priority);
          }

          const eventData = insertCalendarEventSchema.parse(requestData);
          const event = await storage.createCalendarEvent(eventData);
          res.status(201).json(event);
        } catch (error: any) {
          console.error('Calendar event creation error:', error);
          if (error.name === 'ZodError') {
            return res.status(400).json({
              message: 'Invalid event data',
              errors: error.errors,
            });
          }
          res.status(400).json({ message: 'Invalid event data' });
        }
      }
    );

    app.patch('/api/calendar/event/:id', requireAuthIfEnabled, async (req: AuthRequest, res) => {
      try {
        const id = parseInt(req.params.id);

        // Verify team membership from the resource itself ? never trust request-supplied teamId
        const existingEvent = await storage.getCalendarEvent(id);
        if (!existingEvent) {
          return res.status(404).json({ message: 'Event not found' });
        }
        if (req.user?.id) {
          const userTeamIds = await storage.getUserTeamIds(req.user.id);
          // Check membership on the current team (if event has one)
          if (existingEvent.teamId && !userTeamIds.includes(Number(existingEvent.teamId))) {
            return res.status(403).json({ message: 'You are not a member of this team' });
          }
          // Prevent cross-team reassignment ? validate new teamId regardless of whether
          // the original event was team-scoped (blocks moving global events to unauthorized teams)
          const incomingTeamId = req.body.teamId;
          if (
            incomingTeamId !== undefined &&
            incomingTeamId !== null &&
            Number(incomingTeamId) !== Number(existingEvent.teamId)
          ) {
            if (!userTeamIds.includes(Number(incomingTeamId))) {
              return res.status(403).json({ message: 'You are not a member of the target team' });
            }
          }
        } else if (existingEvent.teamId && config.enforceAuthForWrites) {
          return res.status(401).json({ message: 'Authentication required' });
        }

        // Convert ISO string dates to Date objects (same logic as POST)
        const requestData = { ...req.body };
        if (requestData.startDate && typeof requestData.startDate === 'string') {
          requestData.startDate = new Date(requestData.startDate);
        }
        if (requestData.endDate && typeof requestData.endDate === 'string') {
          requestData.endDate = new Date(requestData.endDate);
        }

        // If endDate is not provided or is null, set it to startDate
        if (!requestData.endDate && requestData.startDate) {
          requestData.endDate = new Date(requestData.startDate);
        }

        // Handle time fields - convert empty strings to null
        if (requestData.startTime === '' || requestData.startTime === undefined) {
          requestData.startTime = null;
        }
        if (requestData.endTime === '' || requestData.endTime === undefined) {
          requestData.endTime = null;
        }

        // Handle priority field - convert to integer and set default
        if (!requestData.priority || requestData.priority === undefined) {
          requestData.priority = 1;
        } else {
          requestData.priority = parseInt(requestData.priority);
        }

        const updateData = updateCalendarEventSchema.parse(requestData);
        const event = await storage.updateCalendarEvent(id, updateData);
        if (!event) {
          return res.status(404).json({ message: 'Event not found' });
        }
        res.json(event);
      } catch (error: any) {
        console.error('Calendar event update error:', error);
        if (error.name === 'ZodError') {
          return res.status(400).json({
            message: 'Invalid event data',
            errors: error.errors,
          });
        }
        res.status(400).json({ message: 'Invalid event data' });
      }
    });

    app.delete('/api/calendar/event/:id', requireAuthIfEnabled, async (req: AuthRequest, res) => {
      try {
        const id = parseInt(req.params.id);

        // Verify requester belongs to the event's team
        const event = await storage.getCalendarEvent(id);
        if (event?.teamId && req.user?.id) {
          const userTeamIds = await storage.getUserTeamIds(req.user.id);
          if (!userTeamIds.includes(Number(event.teamId))) {
            return res.status(403).json({ message: 'You are not a member of this team' });
          }
        }

        const deleted = await storage.deleteCalendarEvent(id);
        if (!deleted) {
          return res.status(404).json({ message: 'Event not found' });
        }
        res.status(204).send();
      } catch (error) {
        res.status(500).json({ message: 'Server error' });
      }
    });
  }

  // Comments API
  app.get(
    '/api/pages/:pageId/comments',
    optionalAuth,
    requirePagePermission('viewer'),
    async (req, res) => {
      try {
        const pageId = parseInt(req.params.pageId);
        const comments = await storage.getCommentsByPageId(pageId);
        res.json(comments);
      } catch (error) {
        res.status(400).json({ message: 'Invalid page ID' });
      }
    }
  );

  app.post(
    '/api/pages/:pageId/comments',
    requireAuthIfEnabled,
    requirePagePermission('commenter'),
    async (req: AuthRequest, res) => {
      try {
        const pageId = parseInt(req.params.pageId);
        const authenticatedUser = req.user as any;

        // Server-derive identity from authenticated user; reject anonymous for protected paths
        if (!authenticatedUser?.id) {
          return res.status(401).json({ message: 'Authentication required to create comments' });
        }
        const authorName = authenticatedUser.email || authenticatedUser.name || 'User';
        const authorUserId: number = authenticatedUser.id;

        const commentData = insertCommentSchema.parse({
          content: req.body.content,
          author: authorName,
          authorUserId,
          pageId,
          ...(req.body.parentId !== undefined && { parentId: req.body.parentId }),
        });
        const comment = await storage.createComment(commentData);

        // Get page information for trigger context
        const page = await storage.getWikiPage(pageId);

        // Trigger workflows for comment_added event
        if (page) {
          triggerWorkflows('comment_added', {
            id: comment.id,
            content: comment.content,
            author: comment.author,
            pageId: page.id,
            pageTitle: page.title,
            teamId: page.teamId,
          }).catch((error) => {
            logger.error('Failed to trigger workflows for comment_added:', {
              commentId: comment.id,
              pageId: page.id,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          });
        }

        res.status(201).json(comment);
      } catch (error) {
        res.status(400).json({ message: 'Invalid comment data', error });
      }
    }
  );

  app.put('/api/comments/:id', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = (req.user as any)?.id;

      // Look up the comment to verify ownership
      const existing = await storage.getComment(id);
      if (!existing) {
        return res.status(404).json({ message: 'Comment not found' });
      }

      // Owner-based authorization: only the comment author or an admin may edit
      const isOwner = existing.authorUserId != null && existing.authorUserId === userId;
      const isAdmin = (req.user as any)?.role === 'admin';
      if (!isOwner && !isAdmin) {
        return res
          .status(403)
          .json({ message: 'Only the comment author or an admin can edit this comment' });
      }

      // updateCommentSchema already strips author/authorUserId to prevent identity tampering
      const updateData = updateCommentSchema.parse(req.body);
      const comment = await storage.updateComment(id, updateData);

      if (!comment) {
        return res.status(404).json({ message: 'Comment not found' });
      }

      res.json(comment);
    } catch (error) {
      res.status(400).json({ message: 'Invalid update data', error });
    }
  });

  app.delete('/api/comments/:id', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = (req.user as any)?.id;

      // Look up the comment to verify ownership
      const existing = await storage.getComment(id);
      if (!existing) {
        return res.status(404).json({ message: 'Comment not found' });
      }

      // Owner-based authorization: comment author, page editor, or admin may delete
      const isOwner = existing.authorUserId != null && existing.authorUserId === userId;
      const isAdmin = (req.user as any)?.role === 'admin';
      let isPageEditor = false;
      if (!isOwner && !isAdmin) {
        isPageEditor = await storage.checkPagePermission(userId, existing.pageId, 'editor');
      }

      if (!isOwner && !isAdmin && !isPageEditor) {
        return res.status(403).json({
          message: 'Only the comment author, page editor, or admin can delete this comment',
        });
      }

      const deleted = await storage.deleteComment(id);

      if (!deleted) {
        return res.status(404).json({ message: 'Comment not found' });
      }

      res.json({ message: 'Comment deleted successfully' });
    } catch (error) {
      res.status(400).json({ message: 'Invalid comment ID' });
    }
  });

  // ==================== Page Permissions API ====================

  // Get all permissions for a page
  app.get('/api/pages/:id/permissions', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const pageId = parseInt(req.params.id);

      // Check if user has owner permission to view permissions
      const hasOwnerPermission = await storage.checkPagePermission(req.user?.id, pageId, 'owner');
      if (!hasOwnerPermission) {
        return res.status(403).json({ message: 'Only page owners can view permissions' });
      }

      const permissions = await storage.getPagePermissions(pageId);
      res.json(permissions);
    } catch (error) {
      res.status(500).json({ message: 'Failed to get permissions', error });
    }
  });

  // Add or update a permission for a page
  app.post('/api/pages/:id/permissions', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const pageId = parseInt(req.params.id);

      // Check if user has owner permission to manage permissions
      const hasOwnerPermission = await storage.checkPagePermission(req.user?.id, pageId, 'owner');
      if (!hasOwnerPermission) {
        return res.status(403).json({ message: 'Only page owners can manage permissions' });
      }

      const permissionData = {
        pageId,
        entityType: req.body.entityType,
        entityId: req.body.entityId,
        permission: req.body.permission,
        grantedBy: req.user?.id,
      };

      const permission = await storage.addPagePermission(permissionData);
      res.status(201).json(permission);
    } catch (error) {
      res.status(400).json({ message: 'Invalid permission data', error });
    }
  });

  // Remove a permission from a page
  app.delete(
    '/api/pages/:id/permissions/:permissionId',
    authMiddleware,
    async (req: AuthRequest, res) => {
      try {
        const pageId = parseInt(req.params.id);
        const permissionId = parseInt(req.params.permissionId);

        // Check if user has owner permission to manage permissions
        const hasOwnerPermission = await storage.checkPagePermission(req.user?.id, pageId, 'owner');
        if (!hasOwnerPermission) {
          return res.status(403).json({ message: 'Only page owners can manage permissions' });
        }

        const deleted = await storage.removePagePermission(permissionId);
        if (!deleted) {
          return res.status(404).json({ message: 'Permission not found' });
        }

        res.json({ message: 'Permission removed successfully' });
      } catch (error) {
        res.status(500).json({ message: 'Failed to remove permission', error });
      }
    }
  );

  // ==================== Public Links API ====================

  // Get all public links for a page
  app.get('/api/pages/:id/share', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const pageId = parseInt(req.params.id);

      // Check if user has owner or editor permission
      const hasPermission = await storage.checkPagePermission(req.user?.id, pageId, 'editor');
      if (!hasPermission) {
        return res.status(403).json({ message: 'Insufficient permissions to view share links' });
      }

      const links = await storage.getPagePublicLinks(pageId);
      res.json(links);
    } catch (error) {
      res.status(500).json({ message: 'Failed to get share links', error });
    }
  });

  // Create a public link for a page
  app.post('/api/pages/:id/share', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const pageId = parseInt(req.params.id);

      // Check if user has editor or owner permission
      const hasPermission = await storage.checkPagePermission(req.user?.id, pageId, 'editor');
      if (!hasPermission) {
        return res.status(403).json({ message: 'Insufficient permissions to create share links' });
      }

      // Generate random token
      const token = storage.generatePublicLinkToken();

      // Hash password if provided
      let hashedPassword: string | undefined;
      if (req.body.password) {
        hashedPassword = await bcrypt.hash(req.body.password, 10);
      }

      const linkData = {
        pageId,
        token,
        password: hashedPassword,
        permission: req.body.permission || 'viewer',
        expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : undefined,
        createdBy: req.user?.id,
      };

      const link = await storage.createPublicLink(linkData);

      // Don't send password hash to client
      const { password, ...publicLink } = link;
      res.status(201).json(publicLink);
    } catch (error) {
      res.status(400).json({ message: 'Failed to create share link', error });
    }
  });

  // Delete a public link
  app.delete('/api/pages/:id/share/:token', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const pageId = parseInt(req.params.id);
      const token = req.params.token;

      // Check if user has editor or owner permission
      const hasPermission = await storage.checkPagePermission(req.user?.id, pageId, 'editor');
      if (!hasPermission) {
        return res.status(403).json({ message: 'Insufficient permissions to delete share links' });
      }

      const deleted = await storage.deletePublicLinkByToken(token);
      if (!deleted) {
        return res.status(404).json({ message: 'Share link not found' });
      }

      res.json({ message: 'Share link deleted successfully' });
    } catch (error) {
      res.status(500).json({ message: 'Failed to delete share link', error });
    }
  });

  // Access a page via public link
  app.get('/api/share/:token', async (req, res) => {
    try {
      const token = req.params.token;
      const password = req.query.password as string | undefined;

      // Verify the link
      const verification = await storage.verifyPublicLink(token, password);

      if (!verification.valid) {
        return res.status(403).json({ message: verification.error });
      }

      const link = verification.link!;

      // Get the page
      const page = await storage.getWikiPage(link.pageId);
      if (!page) {
        return res.status(404).json({ message: 'Page not found' });
      }

      // Return page with permission level
      res.json({
        page,
        permission: link.permission,
        isPublicLink: true,
      });
    } catch (error) {
      res.status(500).json({ message: 'Failed to access shared page', error });
    }
  });

  // Verify public link password (for password-protected links)
  app.post('/api/share/:token/verify', async (req, res) => {
    try {
      const token = req.params.token;
      const password = req.body.password;

      const verification = await storage.verifyPublicLink(token, password);

      if (!verification.valid) {
        return res.status(403).json({ valid: false, message: verification.error });
      }

      res.json({ valid: true, permission: verification.link?.permission });
    } catch (error) {
      res.status(500).json({ valid: false, message: 'Verification failed' });
    }
  });

  // Members API (see unified team-aware routes below)

  // Sub-pages API (nested pages)
  app.get(
    '/api/pages/:id/children',
    optionalAuth,
    requirePagePermission('viewer'),
    async (req, res) => {
      try {
        const parentId = parseInt(req.params.id);
        const allPages = await storage.searchWikiPages({ query: '', limit: 1000, offset: 0 });
        const children = allPages.pages.filter((p: any) => p.parentId === parentId);
        res.json(children);
      } catch (error) {
        console.error('Error fetching sub-pages:', error);
        res.status(500).json({ error: 'Failed to fetch sub-pages' });
      }
    }
  );

  // Get page tree (for sidebar)
  app.get('/api/page-tree', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const teamId = req.query.teamId as string | undefined;

      // If teamId is specified and user is authenticated, verify team membership
      if (teamId && req.user?.id) {
        const resolvedTeamId = !isNaN(parseInt(teamId)) ? parseInt(teamId) : undefined;
        if (resolvedTeamId) {
          const userTeamIds = await storage.getUserTeamIds(req.user.id);
          if (!userTeamIds.includes(resolvedTeamId)) {
            return res.status(403).json({ message: 'You are not a member of this team' });
          }
        }
      } else if (teamId && config.enforceAuthForWrites && !req.user?.id) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      // If no teamId, scope to user's teams + unassigned pages
      if (!teamId && req.user?.id) {
        const userTeamIds = await storage.getUserTeamIds(req.user.id);
        // Fetch pages for each team plus unassigned (global) pages
        const allResults = await Promise.all([
          ...userTeamIds.map((tid) =>
            storage.searchWikiPages({ query: '', teamId: String(tid), limit: 1000, offset: 0 })
          ),
          storage.searchWikiPages({ query: '', teamId: 'null', limit: 1000, offset: 0 }),
        ]);
        const seenIds = new Set<number>();
        const allPagesRaw = allResults
          .flatMap((r) => r.pages)
          .filter((p: any) => {
            if (seenIds.has(p.id)) return false;
            seenIds.add(p.id);
            return true;
          });
        // Build tree with the merged set
        const pages = allPagesRaw.map((p: any) => ({
          id: p.id,
          title: p.title,
          slug: p.slug,
          parentId: p.parentId || null,
          folder: p.folder,
          updatedAt: p.updatedAt,
        }));
        const rootPages = pages.filter((p: any) => !p.parentId);
        const childMap = new Map<number, any[]>();
        pages.forEach((p: any) => {
          if (p.parentId) {
            if (!childMap.has(p.parentId)) childMap.set(p.parentId, []);
            childMap.get(p.parentId)!.push(p);
          }
        });
        const attachChildren = (page: any, depth = 0): any => {
          const children = childMap.get(page.id) || [];
          return {
            ...page,
            children: depth < 3 ? children.map((c: any) => attachChildren(c, depth + 1)) : [],
          };
        };
        return res.json(rootPages.map((p: any) => attachChildren(p)));
      } else if (!teamId && !req.user?.id) {
        // Unauthenticated: in prod reject, in dev return only global pages
        if (config.enforceAuthForWrites) {
          return res.status(401).json({ message: 'Authentication required' });
        }
      }

      // teamId is specified (already membership-checked) OR dev unauthenticated (global only)
      const allPages = await storage.searchWikiPages({
        query: '',
        teamId: teamId || 'null',
        limit: 1000,
        offset: 0,
      });

      // Build tree structure
      const pages = allPages.pages.map((p: any) => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        parentId: p.parentId || null,
        folder: p.folder,
        updatedAt: p.updatedAt,
      }));

      // Separate root pages and children
      const rootPages = pages.filter((p: any) => !p.parentId);
      const childMap = new Map<number, any[]>();
      pages.forEach((p: any) => {
        if (p.parentId) {
          if (!childMap.has(p.parentId)) childMap.set(p.parentId, []);
          childMap.get(p.parentId)!.push(p);
        }
      });

      // Attach children recursively (max 3 levels)
      const attachChildren = (page: any, depth = 0): any => {
        const children = childMap.get(page.id) || [];
        return {
          ...page,
          children: depth < 3 ? children.map((c: any) => attachChildren(c, depth + 1)) : [],
        };
      };

      const tree = rootPages.map((p: any) => attachChildren(p));
      res.json(tree);
    } catch (error) {
      console.error('Error fetching page tree:', error);
      res.status(500).json({ error: 'Failed to fetch page tree' });
    }
  });

  // File Upload API
  app.post(
    '/api/upload',
    rlUpload,
    requireAuthIfEnabled,
    requireTeamMembership,
    upload.array('files', 5),
    async (req: any, res) => {
      try {
        if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
          return res.status(400).json({ message: 'No files uploaded' });
        }

        const teamId = req.body.teamId;
        const uploadedFiles = await Promise.all(
          req.files.map((file: any) => processUploadedFile(file, teamId))
        );

        res.status(201).json({
          message: `${uploadedFiles.length} file(s) uploaded successfully`,
          files: uploadedFiles,
        });
      } catch (error: any) {
        console.error('Upload error:', error);
        res.status(400).json({
          message: 'Upload failed',
          error: error.message,
        });
      }
    }
  );

  // Serve uploaded images
  app.get('/api/uploads/images/:filename', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { filename } = req.params;

      const fileTeamId = await getFileTeamId(filename, true);

      // Fail-secure: sidecar missing or unreadable ? deny rather than silently allow
      if (fileTeamId === undefined) {
        return res.status(403).json({ message: 'File metadata unavailable' });
      }

      // File belongs to a specific team ? verify membership
      if (fileTeamId !== null) {
        if (!req.user?.id) {
          return res.status(401).json({ message: 'Authentication required' });
        }
        const userTeamIds = await storage.getUserTeamIds(req.user.id);
        if (!userTeamIds.map(String).includes(fileTeamId)) {
          return res.status(403).json({ message: 'You are not a member of this team' });
        }
      }
      // fileTeamId === null �� explicitly public file ? proceed

      const fileInfo = await getFileInfo(filename, true);

      if (!fileInfo || !existsSync(fileInfo.path)) {
        return res.status(404).json({ message: 'Image not found' });
      }

      // Set appropriate headers
      res.setHeader('Content-Type', fileInfo.mimetype);
      res.setHeader('Content-Length', fileInfo.size);
      res.setHeader('Cache-Control', 'private, max-age=3600');

      res.sendFile(path.resolve(fileInfo.path));
    } catch (error) {
      res.status(500).json({ message: 'Error serving image' });
    }
  });

  // Serve uploaded files
  app.get('/api/uploads/files/:filename', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { filename } = req.params;

      const fileTeamId = await getFileTeamId(filename, false);

      // Fail-secure: sidecar missing or unreadable ? deny rather than silently allow
      if (fileTeamId === undefined) {
        return res.status(403).json({ message: 'File metadata unavailable' });
      }

      // File belongs to a specific team ? verify membership
      if (fileTeamId !== null) {
        if (!req.user?.id) {
          return res.status(401).json({ message: 'Authentication required' });
        }
        const userTeamIds = await storage.getUserTeamIds(req.user.id);
        if (!userTeamIds.map(String).includes(fileTeamId)) {
          return res.status(403).json({ message: 'You are not a member of this team' });
        }
      }
      // fileTeamId === null �� explicitly public file ? proceed

      const fileInfo = await getFileInfo(filename, false);

      if (!fileInfo || !existsSync(fileInfo.path)) {
        return res.status(404).json({ message: 'File not found' });
      }

      // Set appropriate headers
      res.setHeader('Content-Type', fileInfo.mimetype);
      res.setHeader('Content-Length', fileInfo.size);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      res.sendFile(path.resolve(fileInfo.path));
    } catch (error) {
      res.status(500).json({ message: 'Error serving file' });
    }
  });

  // List uploaded files
  app.get('/api/uploads', optionalAuth, requireTeamMembership, async (req: AuthRequest, res) => {
    try {
      const teamId = req.query.teamId as string | undefined;

      if (!teamId) {
        // No teamId specified ? scope to user's teams to prevent full data leak
        const userTeamIds = (req as any).userTeamIds as number[] | undefined;
        if (userTeamIds && userTeamIds.length > 0) {
          const allLists = await Promise.all(
            userTeamIds.map((tid) => listUploadedFiles(String(tid)))
          );
          return res.json({
            images: allLists.flatMap((l) => l.images),
            files: allLists.flatMap((l) => l.files),
          });
        }
        return res.json({ images: [], files: [] });
      }

      const fileList = await listUploadedFiles(teamId);
      res.json(fileList);
    } catch (error) {
      res.status(500).json({ message: 'Error listing files' });
    }
  });

  // Delete uploaded file
  app.delete(
    '/api/uploads/:type/:filename',
    requireAuthIfEnabled,
    async (req: AuthRequest, res) => {
      try {
        const { type, filename } = req.params;
        const isImg = type === 'images';

        if (type !== 'images' && type !== 'files') {
          return res.status(400).json({ message: 'Invalid file type' });
        }

        // Verify the requester belongs to the team that uploaded this file
        const fileTeamId = await getFileTeamId(filename, isImg);
        if (fileTeamId && req.user?.id) {
          const userTeamIds = await storage.getUserTeamIds(req.user.id);
          if (!userTeamIds.map(String).includes(fileTeamId)) {
            return res.status(403).json({ message: 'You are not a member of this team' });
          }
        } else if (fileTeamId && config.enforceAuthForWrites) {
          return res.status(401).json({ message: 'Authentication required' });
        }

        const deleted = await deleteUploadedFile(filename, isImg);

        if (!deleted) {
          return res.status(404).json({ message: 'File not found' });
        }

        res.json({ message: 'File deleted successfully' });
      } catch (error) {
        res.status(500).json({ message: 'Error deleting file' });
      }
    }
  );

  if (featureFlags.FEATURE_ADMIN) {
    // Admin Authentication
    app.post('/api/admin/auth', rlAdmin, async (req, res) => {
      try {
        const { password } = req.body;
        if (password === config.adminPassword) {
          // Issue a short-lived admin token via httpOnly cookie only
          const token = jwt.sign(
            { role: 'admin', via: 'password' },
            (config as any).jwtSecret || 'your-default-secret',
            {
              expiresIn: '2h',
            }
          );
          res
            .cookie('accessToken', token, {
              httpOnly: true,
              secure: config.isProduction,
              sameSite: 'strict',
              maxAge: 2 * 60 * 60 * 1000,
            })
            .json({ success: true });
        } else {
          res.status(401).json({ message: 'Invalid password' });
        }
      } catch (error) {
        res.status(500).json({ message: 'Server error' });
      }
    });

    // Directory password verification
    app.post('/api/directory/verify', rlAdmin, async (req, res) => {
      try {
        const { directoryName, password } = req.body;
        const isValid = await storage.verifyDirectoryPassword(directoryName, password);
        res.json({ success: isValid });
      } catch (error) {
        res.status(500).json({ message: 'Server error' });
      }
    });

    // Admin Directory Management
    app.get('/api/admin/directories', rlAdmin, requireAdmin, async (req, res) => {
      try {
        const directories = await storage.getDirectories();
        res.json(directories);
      } catch (error) {
        res.status(500).json({ message: 'Server error' });
      }
    });

    app.post('/api/admin/directories', rlAdmin, requireAdmin, async (req, res) => {
      try {
        const { adminPassword, ...directoryData } = req.body; // adminPassword ignored by middleware
        const validatedData = insertDirectorySchema.parse(directoryData);
        const directory = await storage.createDirectory(validatedData);
        res.status(201).json(directory);
      } catch (error) {
        res.status(400).json({ message: 'Invalid directory data' });
      }
    });

    app.patch('/api/admin/directories/:id', rlAdmin, requireAdmin, async (req, res) => {
      try {
        const { adminPassword, ...updateData } = req.body;
        const id = parseInt(req.params.id);
        const validatedData = updateDirectorySchema.parse(updateData);
        const directory = await storage.updateDirectory(id, validatedData);
        if (!directory) {
          return res.status(404).json({ message: 'Directory not found' });
        }
        res.json(directory);
      } catch (error) {
        res.status(400).json({ message: 'Invalid directory data' });
      }
    });

    app.delete('/api/admin/directories/:id', rlAdmin, requireAdmin, async (req, res) => {
      try {
        const id = parseInt(req.params.id);
        const deleted = await storage.deleteDirectory(id);
        if (!deleted) {
          return res.status(404).json({ message: 'Directory not found' });
        }
        res.status(204).send();
      } catch (error) {
        res.status(500).json({ message: 'Server error' });
      }
    });
  }

  // Dashboard API
  app.get(
    '/api/dashboard/overview',
    requireAuthIfEnabled,
    requireTeamMembership,
    async (req: AuthRequest, res) => {
      try {
        const userTeamIds: number[] = (req as any).userTeamIds ?? [];
        const overview = await storage.getDashboardOverview(userTeamIds);
        res.json(overview);
      } catch (error) {
        res.status(500).json({ message: 'Server error' });
      }
    }
  );

  app.get(
    '/api/dashboard/team/:teamId',
    requireAuthIfEnabled,
    requireTeamMembership,
    async (req: AuthRequest, res) => {
      try {
        const teamId = req.params.teamId;
        // Verify requester belongs to the team being queried
        const userTeamIds = (req as any).userTeamIds as number[] | undefined;
        if (userTeamIds && !userTeamIds.map(String).includes(teamId)) {
          return res.status(403).json({ message: 'You are not a member of this team' });
        }
        const stats = await storage.getTeamProgressStats(teamId);
        res.json(stats);
      } catch (error) {
        res.status(500).json({ message: 'Server error' });
      }
    }
  );

  app.get('/api/dashboard/member/:memberId', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const memberId = parseInt(req.params.memberId);
      const member = await storage.getMember(memberId);
      if (!member) {
        return res.status(404).json({ message: 'Member not found' });
      }

      const userTeamIds = req.user?.id ? await storage.getUserTeamIds(req.user.id) : [];
      if (!userTeamIds.includes(Number(member.teamId))) {
        return res.status(403).json({ message: 'You are not a member of this team' });
      }

      const stats = await storage.getMemberProgressStats(memberId);
      if (!stats) {
        return res.status(404).json({ message: 'Member stats not found' });
      }
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  });

  // Tasks API
  app.get('/api/tasks', optionalAuth, requireTeamMembership, async (req: AuthRequest, res) => {
    try {
      const teamId = req.query.teamId as string;
      const status = req.query.status as string;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const cursor = req.query.cursor as string | undefined;

      // If no teamId specified, scope to user's teams to prevent full data leak
      let tasks: Task[];
      if (!teamId) {
        const userTeamIds = (req as any).userTeamIds as number[] | undefined;
        if (userTeamIds && userTeamIds.length > 0) {
          const allTasks = await Promise.all(
            userTeamIds.map((id) => storage.getTasks(String(id), status))
          );
          tasks = allTasks.flat();
        } else {
          tasks = [];
        }
      } else {
        tasks = await storage.getTasks(teamId, status);
      }

      // Apply cursor-based pagination if cursor provided
      let paginatedTasks = tasks;
      if (cursor) {
        const cursorId = parseInt(cursor);
        const cursorIndex = tasks.findIndex((t) => t.id === cursorId);
        if (cursorIndex >= 0) {
          paginatedTasks = tasks.slice(cursorIndex + 1, cursorIndex + 1 + limit);
        }
      } else {
        paginatedTasks = tasks.slice(0, limit);
      }

      const hasMore = cursor
        ? tasks.length > tasks.findIndex((t) => t.id === parseInt(cursor)) + 1 + limit
        : tasks.length > limit;
      const nextCursor =
        hasMore && paginatedTasks.length > 0
          ? paginatedTasks[paginatedTasks.length - 1]?.id.toString()
          : null;

      res.json({
        tasks: paginatedTasks,
        pagination: {
          hasMore,
          nextCursor,
          count: paginatedTasks.length,
          total: tasks.length,
        },
      });
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  });

  app.get('/api/tasks/:id', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const task = await storage.getTask(id);

      if (!task) {
        return res.status(404).json({ message: 'Task not found' });
      }

      // Verify the requester belongs to the task's team
      if (task.teamId && req.user?.id) {
        const userTeamIds = await storage.getUserTeamIds(req.user.id);
        if (!userTeamIds.includes(Number(task.teamId))) {
          return res.status(403).json({ message: 'You are not a member of this team' });
        }
      } else if (task.teamId && config.enforceAuthForWrites) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      res.json(task);
    } catch (error) {
      res.status(400).json({ message: 'Invalid task ID' });
    }
  });

  app.post(
    '/api/tasks',
    requireAuthIfEnabled,
    requireTeamMembership,
    async (req: AuthRequest, res) => {
      try {
        const taskData = insertTaskSchema.parse(req.body);
        const task = await storage.createTask(taskData);

        // Trigger workflows for task_created event
        triggerWorkflows('task_created', {
          id: task.id,
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          assignedTo: task.assignedTo,
          dueDate: task.dueDate,
          teamId: task.teamId,
        }).catch((error) => {
          logger.error('Failed to trigger workflows for task_created:', {
            taskId: task.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        });

        res.status(201).json(task);
      } catch (error) {
        res.status(400).json({ message: 'Invalid task data', error });
      }
    }
  );

  app.put('/api/tasks/:id', requireAuthIfEnabled, async (req: AuthRequest, res) => {
    try {
      const id = parseInt(req.params.id);

      // Get old task data first so auth checks happen before Zod schema parsing
      const oldTask = await storage.getTask(id);

      // Verify team membership before allowing update
      if (req.user?.id) {
        const userTeamIds = await storage.getUserTeamIds(req.user.id);
        // Check membership on the current team (if task has one)
        if (oldTask?.teamId && !userTeamIds.includes(Number(oldTask.teamId))) {
          return res.status(403).json({ message: 'You are not a member of this team' });
        }
        // Prevent cross-team reassignment ? validate new teamId regardless of whether
        // the original task was team-scoped (blocks moving global tasks to unauthorized teams)
        const rawNewTeamId = req.body.teamId;
        if (
          rawNewTeamId !== undefined &&
          rawNewTeamId !== null &&
          String(rawNewTeamId) !== String(oldTask?.teamId)
        ) {
          if (!userTeamIds.map(String).includes(String(rawNewTeamId))) {
            return res.status(403).json({ message: 'You are not a member of the target team' });
          }
        }
      }

      const updateData = updateTaskSchema.parse(req.body);

      const task = await storage.updateTask(id, updateData);

      if (!task) {
        return res.status(404).json({ message: 'Task not found' });
      }

      // Trigger workflows for task_status_changed event
      if (oldTask && updateData.status && oldTask.status !== updateData.status) {
        triggerWorkflows('task_status_changed', {
          id: task.id,
          title: task.title,
          oldStatus: oldTask.status,
          newStatus: task.status,
          priority: task.priority,
          assignedTo: task.assignedTo,
          teamId: task.teamId,
        }).catch((error) => {
          logger.error('Failed to trigger workflows for task_status_changed:', {
            taskId: task.id,
            oldStatus: oldTask.status,
            newStatus: task.status,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        });
      }

      // Trigger workflows for task_assigned event
      if (oldTask && updateData.assignedTo && oldTask.assignedTo !== updateData.assignedTo) {
        triggerWorkflows('task_assigned', {
          id: task.id,
          title: task.title,
          status: task.status,
          priority: task.priority,
          oldAssignee: oldTask.assignedTo,
          newAssignee: task.assignedTo,
          teamId: task.teamId,
        }).catch((error) => {
          logger.error('Failed to trigger workflows for task_assigned:', {
            taskId: task.id,
            oldAssignee: oldTask.assignedTo,
            newAssignee: task.assignedTo,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        });
      }

      res.json(task);
    } catch (error) {
      res.status(400).json({ message: 'Invalid update data', error });
    }
  });

  app.delete('/api/tasks/:id', requireAuthIfEnabled, async (req: AuthRequest, res) => {
    try {
      const id = parseInt(req.params.id);

      // Verify team membership before allowing delete
      const task = await storage.getTask(id);
      if (task?.teamId && req.user?.id) {
        const userTeamIds = await storage.getUserTeamIds(req.user.id);
        if (!userTeamIds.includes(Number(task.teamId))) {
          return res.status(403).json({ message: 'You are not a member of this team' });
        }
      }

      const deleted = await storage.deleteTask(id);

      if (!deleted) {
        return res.status(404).json({ message: 'Task not found' });
      }

      res.json({ message: 'Task deleted successfully' });
    } catch (error) {
      res.status(400).json({ message: 'Invalid task ID' });
    }
  });

  app.patch('/api/tasks/:id/progress', requireAuthIfEnabled, async (req: AuthRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const { progress } = req.body;

      if (typeof progress !== 'number' || progress < 0 || progress > 100) {
        return res.status(400).json({ message: 'Progress must be a number between 0 and 100' });
      }

      // Verify team membership from the resource itself ? never trust request-supplied teamId
      const existingTask = await storage.getTask(id);
      if (!existingTask) {
        return res.status(404).json({ message: 'Task not found' });
      }
      if (existingTask.teamId && req.user?.id) {
        const userTeamIds = await storage.getUserTeamIds(req.user.id);
        if (!userTeamIds.includes(Number(existingTask.teamId))) {
          return res.status(403).json({ message: 'You are not a member of this team' });
        }
      } else if (existingTask.teamId && config.enforceAuthForWrites) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      const task = await storage.updateTaskProgress(id, progress);

      if (!task) {
        return res.status(404).json({ message: 'Task not found' });
      }

      res.json(task);
    } catch (error) {
      res.status(400).json({ message: 'Invalid progress data' });
    }
  });

  if (featureFlags.FEATURE_NOTIFICATIONS) {
    // Notifications API
    app.get('/api/notifications', requireAuthIfEnabled, async (req: AuthRequest, res) => {
      try {
        const recipientId = req.user?.id;
        if (!recipientId) {
          return res.status(401).json({ message: 'Authentication required' });
        }

        const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
        const cursor = req.query.cursor as string | undefined;

        const notifications = await storage.getNotifications(recipientId);

        // Apply cursor-based pagination
        let paginatedNotifications = notifications;
        if (cursor) {
          const cursorId = parseInt(cursor);
          const cursorIndex = notifications.findIndex((n) => n.id === cursorId);
          if (cursorIndex >= 0) {
            paginatedNotifications = notifications.slice(cursorIndex + 1, cursorIndex + 1 + limit);
          }
        } else {
          paginatedNotifications = notifications.slice(0, limit);
        }

        const hasMore = cursor
          ? notifications.length >
            notifications.findIndex((n) => n.id === parseInt(cursor)) + 1 + limit
          : notifications.length > limit;
        const nextCursor =
          hasMore && paginatedNotifications.length > 0
            ? paginatedNotifications[paginatedNotifications.length - 1]?.id.toString()
            : null;

        res.json({
          notifications: paginatedNotifications,
          pagination: {
            hasMore,
            nextCursor,
            count: paginatedNotifications.length,
            total: notifications.length,
          },
        });
      } catch (error) {
        res.status(500).json({ message: 'Server error' });
      }
    });

    app.get(
      '/api/notifications/unread-count',
      requireAuthIfEnabled,
      async (req: AuthRequest, res) => {
        try {
          const recipientId = req.user?.id;
          if (!recipientId) {
            return res.status(401).json({ message: 'Authentication required' });
          }

          const count = await storage.getUnreadNotificationCount(recipientId);
          res.json({ count });
        } catch (error) {
          res.status(500).json({ message: 'Server error' });
        }
      }
    );

    app.get('/api/notifications/:id', authMiddleware, async (req: AuthRequest, res) => {
      try {
        const id = parseInt(req.params.id);
        const notification = await storage.getNotification(id);

        if (!notification) {
          return res.status(404).json({ message: 'Notification not found' });
        }

        // Ownership check: only the recipient may view their notification
        if (req.user?.id && notification.recipientId !== req.user.id) {
          return res.status(403).json({ message: 'Access denied' });
        }

        res.json(notification);
      } catch (error) {
        res.status(400).json({ message: 'Invalid notification ID' });
      }
    });

    app.post('/api/notifications', requireAuthIfEnabled, async (req, res) => {
      try {
        const notificationData = insertNotificationSchema.parse(req.body);
        const notification = await storage.createNotification(notificationData);
        // Realtime: emit to user room and update unread count
        try {
          const ns = io?.of('/collab');
          if (ns) {
            ns.to(`user:${notification.recipientId}`).emit('notification:new', notification);
            const count = await storage.getUnreadNotificationCount(notification.recipientId);
            ns.to(`user:${notification.recipientId}`).emit('notification:unread-count', {
              recipientId: notification.recipientId,
              count,
            });
          }
        } catch (emitErr) {
          console.warn('Socket emit failed for notification:new', emitErr);
        }

        res.status(201).json(notification);
      } catch (error) {
        res.status(400).json({ message: 'Invalid notification data', error });
      }
    });

    app.put('/api/notifications/:id', authMiddleware, async (req: AuthRequest, res) => {
      try {
        const id = parseInt(req.params.id);
        // Ownership check: fetch before updating
        const existing = await storage.getNotification(id);
        if (!existing) {
          return res.status(404).json({ message: 'Notification not found' });
        }
        if (req.user?.id && existing.recipientId !== req.user.id) {
          return res.status(403).json({ message: 'Access denied' });
        }
        const updateData = updateNotificationSchema.parse(req.body);
        const notification = await storage.updateNotification(id, updateData);

        if (!notification) {
          return res.status(404).json({ message: 'Notification not found' });
        }

        // Realtime: emit updated notification and possibly unread count change
        try {
          const ns = io?.of('/collab');
          if (ns) {
            ns.to(`user:${notification.recipientId}`).emit('notification:updated', notification);
            const count = await storage.getUnreadNotificationCount(notification.recipientId);
            ns.to(`user:${notification.recipientId}`).emit('notification:unread-count', {
              recipientId: notification.recipientId,
              count,
            });
          }
        } catch (emitErr) {
          console.warn('Socket emit failed for notification:updated', emitErr);
        }

        res.json(notification);
      } catch (error) {
        res.status(400).json({ message: 'Invalid update data', error });
      }
    });

    app.delete('/api/notifications/:id', authMiddleware, async (req: AuthRequest, res) => {
      try {
        const id = parseInt(req.params.id);
        // Ownership check: fetch before deleting
        const existing = await storage.getNotification(id);
        if (!existing) {
          return res.status(404).json({ message: 'Notification not found' });
        }
        if (req.user?.id && existing.recipientId !== req.user.id) {
          return res.status(403).json({ message: 'Access denied' });
        }
        const deleted = await storage.deleteNotification(id);

        if (!deleted) {
          return res.status(404).json({ message: 'Notification not found' });
        }

        // Realtime: emit deletion and refresh unread count (need recipientId; attempt best-effort)
        try {
          // If storage can fetch notification before deletion, consider enhancing storage API to return deleted entity
          // For now, clients should refetch list on delete event
          const ns = io?.of('/collab');
          if (ns) {
            ns.emit('notification:deleted', { id });
          }
        } catch (emitErr) {
          console.warn('Socket emit failed for notification:deleted', emitErr);
        }

        res.json({ message: 'Notification deleted successfully' });
      } catch (error) {
        res.status(400).json({ message: 'Invalid notification ID' });
      }
    });

    app.patch('/api/notifications/:id/read', authMiddleware, async (req: AuthRequest, res) => {
      try {
        const id = parseInt(req.params.id);
        // Ownership check: fetch before marking as read
        const existing = await storage.getNotification(id);
        if (!existing) {
          return res.status(404).json({ message: 'Notification not found' });
        }
        if (req.user?.id && existing.recipientId !== req.user.id) {
          return res.status(403).json({ message: 'Access denied' });
        }
        const notification = await storage.markNotificationAsRead(id);

        if (!notification) {
          return res.status(404).json({ message: 'Notification not found' });
        }

        // Realtime: emit updated notification and new unread count
        try {
          const ns = io?.of('/collab');
          if (ns) {
            ns.to(`user:${notification.recipientId}`).emit('notification:updated', notification);
            const count = await storage.getUnreadNotificationCount(notification.recipientId);
            ns.to(`user:${notification.recipientId}`).emit('notification:unread-count', {
              recipientId: notification.recipientId,
              count,
            });
          }
        } catch (emitErr) {
          console.warn('Socket emit failed for notification:read', emitErr);
        }

        res.json(notification);
      } catch (error) {
        res.status(400).json({ message: 'Invalid notification ID' });
      }
    });

    app.patch(
      '/api/notifications/read-all',
      requireAuthIfEnabled,
      async (req: AuthRequest, res) => {
        try {
          // Use authenticated user's ID ? do not trust client-supplied recipientId
          const recipientId = req.user?.id;
          if (!recipientId) {
            return res.status(401).json({ message: 'Authentication required' });
          }

          await storage.markAllNotificationsAsRead(recipientId);

          // Realtime: emit unread count reset for recipient
          try {
            const ns = io?.of('/collab');
            if (ns) {
              const count = await storage.getUnreadNotificationCount(recipientId);
              ns.to(`user:${recipientId}`).emit('notification:unread-count', {
                recipientId,
                count,
              });
            }
          } catch (emitErr) {
            console.warn('Socket emit failed for notification:read-all', emitErr);
          }

          res.json({ message: 'All notifications marked as read' });
        } catch (error) {
          res.status(400).json({ message: 'Invalid request data' });
        }
      }
    );
  }

  if (featureFlags.FEATURE_TEMPLATES) {
    // Template Categories API
    app.get('/api/template-categories', async (req, res) => {
      try {
        const categories = await storage.getTemplateCategories();
        res.json(categories);
      } catch (error) {
        console.error('Error fetching template categories:', error);
        res.status(500).json({ error: 'Failed to fetch template categories' });
      }
    });

    app.get('/api/template-categories/:id', async (req, res) => {
      try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
          return res.status(400).json({ error: 'Invalid category ID' });
        }

        const category = await storage.getTemplateCategory(id);
        if (!category) {
          return res.status(404).json({ error: 'Template category not found' });
        }

        res.json(category);
      } catch (error) {
        console.error('Error fetching template category:', error);
        res.status(500).json({ error: 'Failed to fetch template category' });
      }
    });

    app.post('/api/template-categories', requireAuthIfEnabled, async (req, res) => {
      try {
        const validatedData = insertTemplateCategorySchema.parse(req.body);
        const category = await storage.createTemplateCategory(validatedData);
        res.status(201).json(category);
      } catch (error) {
        console.error('Error creating template category:', error);
        res.status(400).json({ error: 'Failed to create template category' });
      }
    });

    app.put('/api/template-categories/:id', requireAuthIfEnabled, async (req, res) => {
      try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
          return res.status(400).json({ error: 'Invalid category ID' });
        }

        const validatedData = updateTemplateCategorySchema.parse(req.body);
        const category = await storage.updateTemplateCategory(id, validatedData);
        if (!category) {
          return res.status(404).json({ error: 'Template category not found' });
        }

        res.json(category);
      } catch (error) {
        console.error('Error updating template category:', error);
        res.status(400).json({ error: 'Failed to update template category' });
      }
    });

    app.delete('/api/template-categories/:id', requireAuthIfEnabled, async (req, res) => {
      try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
          return res.status(400).json({ error: 'Invalid category ID' });
        }

        const success = await storage.deleteTemplateCategory(id);
        if (!success) {
          return res.status(404).json({ error: 'Template category not found' });
        }

        res.status(204).send();
      } catch (error) {
        console.error('Error deleting template category:', error);
        res.status(500).json({ error: 'Failed to delete template category' });
      }
    });

    // Templates API
    app.get('/api/templates', async (req, res) => {
      try {
        const categoryId = req.query.categoryId
          ? parseInt(req.query.categoryId as string)
          : undefined;
        if (req.query.categoryId && isNaN(categoryId!)) {
          return res.status(400).json({ error: 'Invalid category ID' });
        }

        const templates = await storage.getTemplates(categoryId);
        res.json(templates);
      } catch (error) {
        console.error('Error fetching templates:', error);
        res.status(500).json({ error: 'Failed to fetch templates' });
      }
    });

    app.get('/api/templates/:id', async (req, res) => {
      try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
          return res.status(400).json({ error: 'Invalid template ID' });
        }

        const template = await storage.getTemplate(id);
        if (!template) {
          return res.status(404).json({ error: 'Template not found' });
        }

        res.json(template);
      } catch (error) {
        console.error('Error fetching template:', error);
        res.status(500).json({ error: 'Failed to fetch template' });
      }
    });

    app.post('/api/templates', requireAuthIfEnabled, async (req, res) => {
      try {
        const validatedData = insertTemplateSchema.parse(req.body);
        const template = await storage.createTemplate(validatedData);
        res.status(201).json(template);
      } catch (error) {
        console.error('Error creating template:', error);
        res.status(400).json({ error: 'Failed to create template' });
      }
    });

    app.put('/api/templates/:id', requireAuthIfEnabled, async (req, res) => {
      try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
          return res.status(400).json({ error: 'Invalid template ID' });
        }

        const validatedData = updateTemplateSchema.parse(req.body);
        const template = await storage.updateTemplate(id, validatedData);
        if (!template) {
          return res.status(404).json({ error: 'Template not found' });
        }

        res.json(template);
      } catch (error) {
        console.error('Error updating template:', error);
        res.status(400).json({ error: 'Failed to update template' });
      }
    });

    app.delete('/api/templates/:id', requireAuthIfEnabled, async (req, res) => {
      try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
          return res.status(400).json({ error: 'Invalid template ID' });
        }

        const success = await storage.deleteTemplate(id);
        if (!success) {
          return res.status(404).json({ error: 'Template not found' });
        }

        res.status(204).send();
      } catch (error) {
        console.error('Error deleting template:', error);
        res.status(500).json({ error: 'Failed to delete template' });
      }
    });

    app.post('/api/templates/:id/use', requireAuthIfEnabled, async (req, res) => {
      try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
          return res.status(400).json({ error: 'Invalid template ID' });
        }

        const success = await storage.incrementTemplateUsage(id);
        if (!success) {
          return res.status(404).json({ error: 'Template not found' });
        }

        res.json({ success: true });
      } catch (error) {
        console.error('Error incrementing template usage:', error);
        res.status(500).json({ error: 'Failed to increment template usage' });
      }
    });
  }

  if (featureFlags.FEATURE_TEAMS) {
    // Teams API
    app.get('/api/teams', optionalAuth, async (req: AuthRequest, res) => {
      try {
        // If user is authenticated, only return teams they belong to
        if (req.user?.id) {
          const userTeamIds = await storage.getUserTeamIds(req.user.id);
          const allTeams = await storage.getTeams();
          const userTeams = allTeams.filter((t) => userTeamIds.includes(t.id));
          return res.json(userTeams);
        }
        // If auth not enforced (dev mode), return all
        if (!config.enforceAuthForWrites) {
          const teams = await storage.getTeams();
          return res.json(teams);
        }
        return res.status(401).json({ error: 'Authentication required' });
      } catch (error) {
        console.error('Error fetching teams:', error);
        res.status(500).json({ error: 'Failed to fetch teams' });
      }
    });

    app.get('/api/teams/:id', optionalAuth, async (req: AuthRequest, res) => {
      try {
        const id = parseInt(req.params.id);

        // Verify membership for the specific team
        if (req.user?.id) {
          const userTeamIds = await storage.getUserTeamIds(req.user.id);
          if (!userTeamIds.includes(id)) {
            return res.status(403).json({ error: 'You are not a member of this team' });
          }
        } else if (config.enforceAuthForWrites) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const team = await storage.getTeam(id);
        if (!team) {
          return res.status(404).json({ error: 'Team not found' });
        }
        res.json(team);
      } catch (error) {
        console.error('Error fetching team:', error);
        res.status(500).json({ error: 'Failed to fetch team' });
      }
    });

    app.post('/api/teams', requireAuthIfEnabled, async (req, res) => {
      try {
        const validatedData = insertTeamSchema.parse(req.body);
        const team = await storage.createTeam(validatedData);
        res.status(201).json(team);
      } catch (error) {
        console.error('Error creating team:', error);
        res.status(500).json({ error: 'Failed to create team' });
      }
    });

    app.put('/api/teams/:id', optionalAuth, requireAuthIfEnabled, async (req: AuthRequest, res) => {
      try {
        const id = parseInt(req.params.id);

        // Always verify user's team membership and role for team updates
        const userId = req.user?.id;
        if (userId) {
          const userRole = await storage.getUserTeamRole(userId, id);
          if (!userRole) {
            return res.status(403).json({ error: 'You are not a member of this team' });
          }
          if (userRole === 'member') {
            return res.status(403).json({ error: 'Admin or owner role required to update team' });
          }
        } else if (config.enforceAuthForWrites) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const team = await storage.updateTeam(id, req.body);
        if (!team) {
          return res.status(404).json({ error: 'Team not found' });
        }
        res.json(team);
      } catch (error) {
        console.error('Error updating team:', error);
        res.status(500).json({ error: 'Failed to update team' });
      }
    });

    app.delete(
      '/api/teams/:id',
      optionalAuth,
      requireAuthIfEnabled,
      async (req: AuthRequest, res) => {
        try {
          const id = parseInt(req.params.id);

          // Always verify user's team ownership for team deletion
          const userId = req.user?.id;
          if (userId) {
            const userRole = await storage.getUserTeamRole(userId, id);
            if (!userRole) {
              return res.status(403).json({ error: 'You are not a member of this team' });
            }
            if (userRole !== 'owner') {
              return res.status(403).json({ error: 'Owner role required to delete team' });
            }
          } else if (config.enforceAuthForWrites) {
            return res.status(401).json({ error: 'Authentication required' });
          }

          const success = await storage.deleteTeam(id);
          if (!success) {
            return res.status(404).json({ error: 'Team not found' });
          }
          res.status(204).send();
        } catch (error) {
          console.error('Error deleting team:', error);
          res.status(500).json({ error: 'Failed to delete team' });
        }
      }
    );

    app.post('/api/teams/verify', async (req, res) => {
      try {
        const { teamName, password } = req.body;
        const isValid = await storage.verifyTeamPassword(teamName, password);
        res.json({ isValid });
      } catch (error) {
        console.error('Error verifying team password:', error);
        res.status(500).json({ error: 'Failed to verify team password' });
      }
    });
  }

  // Members API (unified, team-aware)
  app.get('/api/members', optionalAuth, requireTeamMembership, async (req: AuthRequest, res) => {
    try {
      let teamId: number | undefined;

      if (req.query.teamId) {
        const teamIdParam = req.query.teamId as string;

        // Check if it's a number (team ID) or string (team name)
        if (!isNaN(parseInt(teamIdParam))) {
          teamId = parseInt(teamIdParam);
        } else {
          // It's a team name, find the team ID
          const team = await storage.getTeamByName(teamIdParam);
          if (team) {
            teamId = team.id;
          } else {
            return res.status(404).json({ error: 'Team not found' });
          }
        }
      }

      // If no teamId specified, scope to user's teams to prevent full data leak
      if (!teamId) {
        const userTeamIds = (req as any).userTeamIds as number[] | undefined;
        if (userTeamIds && userTeamIds.length > 0) {
          // Fetch members for each of user's teams and combine
          const allMembers = await Promise.all(userTeamIds.map((id) => storage.getMembers(id)));
          return res.json(allMembers.flat());
        } else {
          return res.json([]); // No teams = no members
        }
      }

      const members = await storage.getMembers(teamId);
      res.json(members);
    } catch (error) {
      console.error('Error fetching members:', error);
      res.status(500).json({ error: 'Failed to fetch members' });
    }
  });

  app.get('/api/members/:id', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const member = await storage.getMember(id);
      if (!member) {
        return res.status(404).json({ error: 'Member not found' });
      }

      // Verify the requester belongs to the same team as the member
      if (member.teamId && req.user?.id) {
        const userTeamIds = await storage.getUserTeamIds(req.user.id);
        if (!userTeamIds.includes(member.teamId)) {
          return res.status(403).json({ error: 'You are not a member of this team' });
        }
      } else if (member.teamId && config.enforceAuthForWrites) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      res.json(member);
    } catch (error) {
      res.status(400).json({ error: 'Invalid member ID' });
    }
  });

  app.get('/api/members/email/:email', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const email = req.params.email;
      const member = await storage.getMemberByEmail(email);
      if (!member) {
        return res.status(404).json({ error: 'Member not found' });
      }

      // Verify the requester belongs to the same team as the member
      if (member.teamId && req.user?.id) {
        const userTeamIds = await storage.getUserTeamIds(req.user.id);
        if (!userTeamIds.includes(member.teamId)) {
          return res.status(403).json({ error: 'You are not a member of this team' });
        }
      } else if (member.teamId && config.enforceAuthForWrites) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      res.json(member);
    } catch (error) {
      res.status(400).json({ error: 'Invalid email' });
    }
  });

  app.post('/api/members', requireAuthIfEnabled, async (req: AuthRequest, res) => {
    try {
      const memberData = insertMemberSchema.parse(req.body);

      // If teamId is provided as a string (team name), find the actual team ID
      if (memberData.teamId && typeof memberData.teamId === 'string') {
        const team = await storage.getTeamByName(memberData.teamId);
        if (team) {
          memberData.teamId = team.id;
        } else {
          return res.status(400).json({ error: 'Team not found' });
        }
      }

      // Verify team membership with admin+ role (or allow bootstrapping empty teams)
      if (memberData.teamId && req.user?.id) {
        const userRole = await storage.getUserTeamRole(req.user.id, memberData.teamId as number);
        if (!userRole) {
          // Allow bootstrapping: first member can join an empty team
          const existingMembers = await storage.getMembers(memberData.teamId as number);
          if (existingMembers.length > 0) {
            return res.status(403).json({ error: 'You are not a member of this team' });
          }
        } else if (userRole === 'member') {
          return res.status(403).json({ error: 'Admin or owner role required to add members' });
        }
      }

      const member = await storage.createMember(memberData);
      res.status(201).json(member);
    } catch (error) {
      console.error('Error creating member:', error);
      res.status(400).json({ error: 'Failed to create member' });
    }
  });

  app.put('/api/members/:id', requireAuthIfEnabled, async (req: AuthRequest, res) => {
    try {
      const id = parseInt(req.params.id);

      // Verify requester belongs to the same team
      const existing = await storage.getMember(id);
      if (existing?.teamId && req.user?.id) {
        const userRole = await storage.getUserTeamRole(req.user.id, existing.teamId);
        if (!userRole) {
          return res.status(403).json({ error: 'You are not a member of this team' });
        }
        if (userRole === 'member') {
          return res.status(403).json({ error: 'Admin or owner role required to update members' });
        }
      }

      const memberData = updateMemberSchema.parse(req.body);
      // Prevent cross-team reassignment
      if (
        memberData.teamId !== undefined &&
        memberData.teamId !== null &&
        Number(memberData.teamId) !== Number(existing?.teamId)
      ) {
        if (req.user?.id) {
          const userTeamIds = await storage.getUserTeamIds(req.user.id);
          if (!userTeamIds.includes(Number(memberData.teamId))) {
            return res.status(403).json({ error: 'You are not a member of the target team' });
          }
        } else if (config.enforceAuthForWrites) {
          return res.status(401).json({ error: 'Authentication required' });
        }
      }
      const member = await storage.updateMember(id, memberData);
      if (!member) {
        return res.status(404).json({ error: 'Member not found' });
      }
      res.json(member);
    } catch (error) {
      console.error('Error updating member:', error);
      res.status(400).json({ error: 'Failed to update member' });
    }
  });

  app.delete('/api/members/:id', requireAuthIfEnabled, async (req: AuthRequest, res) => {
    try {
      const id = parseInt(req.params.id);

      // Verify requester belongs to the same team with admin+ role
      const existing = await storage.getMember(id);
      if (existing?.teamId && req.user?.id) {
        const userRole = await storage.getUserTeamRole(req.user.id, existing.teamId);
        if (!userRole) {
          return res.status(403).json({ error: 'You are not a member of this team' });
        }
        if (userRole === 'member') {
          return res.status(403).json({ error: 'Admin or owner role required to remove members' });
        }
      }

      const success = await storage.deleteMember(id);
      if (!success) {
        return res.status(404).json({ error: 'Member not found' });
      }
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting member:', error);
      res.status(500).json({ error: 'Failed to delete member' });
    }
  });

  // AI ??��??API
  app.post('/api/ai/generate', rlAI, requireAuthIfEnabled, async (req, res) => {
    try {
      const { prompt, type } = req.body;
      const { generateContent } = await import('./services/ai.js');
      const content = await generateContent(prompt, type);
      res.json({ content });
    } catch (error) {
      res
        .status(500)
        .json({ message: 'Failed to generate content', error: (error as Error).message });
    }
  });

  app.post('/api/ai/improve', rlAI, requireAuthIfEnabled, async (req, res) => {
    try {
      const { content, title } = req.body;
      const { generateContentSuggestions } = await import('./services/ai.js');
      const suggestions = await generateContentSuggestions(content, title);
      res.json({ suggestions });
    } catch (error) {
      res
        .status(500)
        .json({ message: 'Failed to generate suggestions', error: (error as Error).message });
    }
  });

  // AI ��??API
  app.post('/api/ai/search', rlAI, requireAuthIfEnabled, async (req: AuthRequest, res) => {
    try {
      const { query, teamId } = req.body;

      if (!query || query.trim().length === 0) {
        return res.status(400).json({ message: 'Search query is required' });
      }

      // Gather the user's authorized team IDs once to avoid duplicate DB calls
      const userTeamIds = req.user?.id ? await storage.getUserTeamIds(req.user.id) : [];

      // If a specific teamId is requested, verify membership
      if (teamId) {
        if (!userTeamIds.map(String).includes(String(teamId))) {
          return res.status(403).json({ message: 'You are not a member of this team' });
        }
      }

      // Determine the scoped set of team IDs ? never falls through to undefined / full-DB scan
      const effectiveTeamIds: string[] = teamId ? [String(teamId)] : userTeamIds.map(String);

      // If the user belongs to no teams, return empty results immediately
      if (effectiveTeamIds.length === 0) {
        return res.json({ results: [], query, totalResults: 0 });
      }

      // Aggregate results across all authorized teams, always passing an explicit teamId
      const [pagesAgg, tasksAgg] = await Promise.all([
        Promise.all(
          effectiveTeamIds.map((tid) =>
            storage.searchWikiPages({ query: '', teamId: tid, limit: 100, offset: 0 })
          )
        ),
        Promise.all(effectiveTeamIds.map((tid) => storage.getTasks(tid))),
      ]);
      const allPages = pagesAgg.flatMap((r: any) => r.pages);
      const allTasks = tasksAgg.flat();
      // Aggregate files across ALL authorized teams ? never scope to a single team
      const filesPerTeam = await Promise.all(effectiveTeamIds.map((tid) => listUploadedFiles(tid)));
      const allFiles = filesPerTeam.flatMap((r) => r.files);

      const documents = [
        ...allPages.map((page: any) => ({
          id: page.id,
          title: page.title,
          content: page.content,
          type: 'page' as const,
          url: `/page/${page.slug}`,
        })),
        ...allTasks.map((task: any) => ({
          id: task.id,
          title: task.title,
          content: task.description || '',
          type: 'task' as const,
          url: `/tasks`,
        })),
        ...allFiles.map((file: any) => ({
          id: file.id || 0,
          title: file.filename,
          content: file.description || '',
          type: 'file' as const,
          url: `/files`,
        })),
      ];

      const results = await smartSearch(query, documents);

      res.json({
        results,
        query,
        totalResults: results.length,
      });
    } catch (error) {
      console.error('AI search error:', error);
      res
        .status(500)
        .json({ message: 'Failed to perform AI search', error: (error as Error).message });
    }
  });

  app.post('/api/ai/search-suggestions', rlAI, requireAuthIfEnabled, async (req, res) => {
    try {
      const { query } = req.body;

      if (!query || query.trim().length === 0) {
        return res.json({ suggestions: [] });
      }

      const suggestions = await generateSearchSuggestions(query);
      res.json({ suggestions });
    } catch (error) {
      console.error('Search suggestions error:', error);
      res.status(500).json({
        message: 'Failed to generate search suggestions',
        error: (error as Error).message,
      });
    }
  });

  // AI Copilot Chat
  app.post('/api/ai/copilot/chat', rlAI, requireAuthIfEnabled, async (req, res) => {
    try {
      const { messages, context } = req.body;

      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'Messages array is required' });
      }

      const response = await aiService.chatWithCopilot(messages, context || {});
      res.json({ response });
    } catch (error) {
      console.error('Copilot chat error:', error);
      res.status(500).json({
        message: 'Failed to chat with copilot',
        error: (error as Error).message,
      });
    }
  });

  // Extract tasks from content
  app.post('/api/ai/extract-tasks', rlAI, requireAuthIfEnabled, async (req, res) => {
    try {
      const { content } = req.body;

      if (!content) {
        return res.status(400).json({ error: 'Content is required' });
      }

      const tasks = await aiService.extractTasks(content);
      res.json({ tasks });
    } catch (error) {
      console.error('Extract tasks error:', error);
      res.status(500).json({
        message: 'Failed to extract tasks',
        error: (error as Error).message,
      });
    }
  });

  // Find related pages
  app.post('/api/ai/related-pages', rlAI, requireAuthIfEnabled, async (req: AuthRequest, res) => {
    try {
      const { content, title, pageId } = req.body;

      if (!content || !title) {
        return res.status(400).json({ error: 'Content and title are required' });
      }

      // Scope pages to the authenticated user's accessible teams ? never pass undefined
      const userTeamIdsForRelated = req.user?.id ? await storage.getUserTeamIds(req.user.id) : [];
      if (userTeamIdsForRelated.length === 0) {
        return res.json({ relatedPages: [] });
      }
      // Aggregate pages across ALL of the user's teams ? not just the first one
      const relatedPageResults = await Promise.all(
        userTeamIdsForRelated.map((tid) =>
          storage.searchWikiPages({ query: '', teamId: String(tid), limit: 100, offset: 0 })
        )
      );
      const searchResults = { pages: relatedPageResults.flatMap((r: any) => r.pages) };
      const availablePages = searchResults.pages
        .filter((p: any) => p.id !== pageId)
        .map((p: any) => ({
          id: p.id,
          title: p.title,
          content: p.content,
          tags: p.tags || [],
        }));

      const relatedPages = await aiService.findRelatedPages(content, title, availablePages);
      res.json({ relatedPages });
    } catch (error) {
      console.error('Find related pages error:', error);
      res.status(500).json({
        message: 'Failed to find related pages',
        error: (error as Error).message,
      });
    }
  });

  // Knowledge Graph API
  app.get(
    '/api/knowledge-graph',
    requireAuthIfEnabled,
    requireTeamMembership,
    async (req: AuthRequest, res) => {
      try {
        const teamId = req.query.teamId as string | undefined;
        const includeAILinks = req.query.includeAI === 'true';

        // Use team IDs already resolved by requireTeamMembership middleware
        const userTeamIds: number[] = (req as any).userTeamIds ?? [];

        // If a specific teamId is requested, verify the user is a member
        if (teamId && !userTeamIds.map(String).includes(teamId)) {
          return res.status(403).json({ message: 'You are not a member of this team' });
        }

        // Build the set of team IDs to query ? never falls through to undefined / full-DB scan
        const effectiveTeamIds: string[] = teamId ? [teamId] : userTeamIds.map(String);

        // If user belongs to no teams, return an empty graph immediately
        if (effectiveTeamIds.length === 0) {
          return res.json({ nodes: [], links: [] });
        }

        // Aggregate pages across all authorized teams, always passing an explicit teamId
        const pageResults = await Promise.all(
          effectiveTeamIds.map((tid) =>
            storage.searchWikiPages({ query: '', limit: 1000, offset: 0, teamId: tid })
          )
        );
        const pages = pageResults.flatMap((r: any) => r.pages);

        // Build nodes and links
        const nodes: any[] = [];
        const links: any[] = [];
        const tagMap = new Map<string, Set<number>>();

        // Create nodes for pages
        pages.forEach((page: any) => {
          const connections = 0; // Will be calculated later
          const isOrphan = connections === 0;

          nodes.push({
            id: `page-${page.id}`,
            name: page.title,
            type: isOrphan ? 'orphan' : 'page',
            val: 10, // Base size
            color: isOrphan ? '#EF4444' : '#3B82F6',
            pageId: page.id,
            slug: page.slug,
            connections: 0,
            tags: page.tags,
            content: page.content,
          });

          // Track tags
          page.tags?.forEach((tag: string) => {
            if (!tagMap.has(tag)) {
              tagMap.set(tag, new Set());
            }
            tagMap.get(tag)!.add(page.id);
          });

          // Find content links (simple [[link]] detection)
          const linkRegex = /\[\[([^\]]+)\]\]/g;
          const matches = page.content.matchAll(linkRegex);
          for (const match of matches) {
            const linkedTitle = match[1];
            const linkedPage = pages.find(
              (p: any) => p.title.toLowerCase() === linkedTitle.toLowerCase()
            );
            if (linkedPage && linkedPage.id !== page.id) {
              links.push({
                source: `page-${page.id}`,
                target: `page-${linkedPage.id}`,
                type: 'content',
                strength: 2,
              });
            }
          }
        });

        // Create tag nodes and links
        tagMap.forEach((pageIds, tag) => {
          if (pageIds.size > 1) {
            nodes.push({
              id: `tag-${tag}`,
              name: `#${tag}`,
              type: 'tag',
              val: pageIds.size * 5,
              color: '#F59E0B',
              connections: pageIds.size,
            });

            // Link pages with same tag
            const pageIdArray = Array.from(pageIds);
            pageIdArray.forEach((pageId) => {
              links.push({
                source: `page-${pageId}`,
                target: `tag-${tag}`,
                type: 'tag',
                strength: 1,
              });
            });
          }
        });

        // Add AI-recommended links if requested
        if (includeAILinks && pages.length > 0) {
          try {
            // Get AI service
            const aiModule = await import('./services/ai.js');

            // Analyze a sample of pages (max 20 to avoid rate limits)
            const samplePages = pages
              .filter((p: any) => p.content && p.content.length > 100)
              .sort(() => Math.random() - 0.5)
              .slice(0, 20);

            for (const page of samplePages) {
              try {
                const relatedPages = await aiModule.findRelatedPages(
                  page.content,
                  page.title,
                  pages.filter((p: any) => p.id !== page.id) // Exclude current page
                );

                if (relatedPages && relatedPages.length > 0) {
                  relatedPages.slice(0, 3).forEach((related: any) => {
                    // Only add if not already connected
                    const existingLink = links.find(
                      (l) =>
                        (l.source === `page-${page.id}` && l.target === `page-${related.pageId}`) ||
                        (l.target === `page-${page.id}` && l.source === `page-${related.pageId}`)
                    );

                    if (!existingLink && related.relevance > 0.5) {
                      links.push({
                        source: `page-${page.id}`,
                        target: `page-${related.pageId}`,
                        type: 'ai-recommended',
                        strength: 1,
                        relevance: related.relevance,
                        reason: related.reason,
                      });
                    }
                  });
                }
              } catch (aiError) {
                console.error(`AI link generation failed for page ${page.id}:`, aiError);
              }
            }
          } catch (aiError) {
            console.error('AI link generation failed:', aiError);
          }
        }

        // Calculate connections for each node
        nodes.forEach((node) => {
          const nodeLinks = links.filter(
            (link) => link.source === node.id || link.target === node.id
          );
          node.connections = nodeLinks.length;
          node.val = 10 + node.connections * 3;

          // Update orphan status
          if (node.type === 'page' && node.connections === 0) {
            node.type = 'orphan';
            node.color = '#EF4444';
          } else if (node.type === 'orphan' && node.connections > 0) {
            node.type = 'page';
            node.color = '#3B82F6';
          }
        });

        // Remove content field from nodes to reduce response size
        nodes.forEach((node) => {
          delete node.content;
        });

        res.json({ nodes, links });
      } catch (error) {
        console.error('Knowledge graph error:', error);
        res.status(500).json({
          message: 'Failed to generate knowledge graph',
          error: (error as Error).message,
        });
      }
    }
  );

  if (featureFlags.FEATURE_AUTOMATION) {
    // ==================== Workflows API ====================

    const validateWorkflowActions = (actions: unknown) => {
      if (!Array.isArray(actions)) return null;

      for (const action of actions) {
        if (
          (action.type === 'webhook' || action.type === 'slack_webhook') &&
          (!action.config?.url || !String(action.config.url).trim())
        ) {
          return 'Webhook actions require a URL in config';
        }

        if (
          action.type === 'send_notification' &&
          (!action.config?.message || !String(action.config.message).trim())
        ) {
          return 'Notification actions require a message in config';
        }

        if (action.type === 'send_email') {
          const hasRecipients = !!(action.config?.to || action.config?.recipients);
          const hasSubject = !!String(action.config?.subject || '').trim();
          const hasBody = !!(action.config?.message || action.config?.body);
          if (!hasRecipients || !hasSubject || !hasBody) {
            return 'Email actions require recipients (to or recipients), subject, and message (or body) in config';
          }
        }
      }

      return null;
    };

    app.get(
      '/api/workflows',
      optionalAuth,
      requireTeamMembership,
      requireAuthIfEnabled,
      async (req, res) => {
        try {
          const teamIdParam = req.query.teamId as string | undefined;
          let teamId: number | undefined;
          if (teamIdParam) {
            if (!isNaN(parseInt(teamIdParam))) {
              teamId = parseInt(teamIdParam);
            } else {
              const team = await storage.getTeamByName(teamIdParam);
              if (team) {
                teamId = team.id;
              }
            }
          }

          // If no teamId specified, scope to user's teams to prevent full data leak
          if (!teamId) {
            const userTeamIds = (req as any).userTeamIds as number[] | undefined;
            if (userTeamIds && userTeamIds.length > 0) {
              const allWorkflows = await Promise.all(
                userTeamIds.map((tid) => storage.getWorkflows(tid))
              );
              return res.json(allWorkflows.flat());
            }
            return res.json([]);
          }

          const workflows = await storage.getWorkflows(teamId);
          res.json(workflows);
        } catch (error) {
          console.error('Error fetching workflows:', error);
          res.status(500).json({ error: 'Failed to fetch workflows' });
        }
      }
    );

    app.get('/api/workflows/:id', requireAuthIfEnabled, async (req: AuthRequest, res) => {
      try {
        const id = parseInt(req.params.id);
        const workflow = await storage.getWorkflow(id);
        if (!workflow) {
          return res.status(404).json({ error: 'Workflow not found' });
        }
        if (workflow.teamId && req.user?.id) {
          const userTeamIds = await storage.getUserTeamIds(req.user.id);
          if (!userTeamIds.includes(Number(workflow.teamId))) {
            return res.status(403).json({ message: 'You are not a member of this team' });
          }
        } else if (workflow.teamId && config.enforceAuthForWrites) {
          return res.status(401).json({ message: 'Authentication required' });
        }
        res.json(workflow);
      } catch (error) {
        console.error('Error fetching workflow:', error);
        res.status(500).json({ error: 'Failed to fetch workflow' });
      }
    });

    app.post('/api/workflows', requireAuthIfEnabled, requireTeamMembership, async (req, res) => {
      try {
        const workflowData = { ...req.body };
        // Resolve string teamId (teamName) to numeric ID
        if (
          workflowData.teamId &&
          typeof workflowData.teamId === 'string' &&
          isNaN(parseInt(workflowData.teamId))
        ) {
          const team = await storage.getTeamByName(workflowData.teamId);
          if (team) {
            workflowData.teamId = team.id;
          } else {
            return res.status(400).json({ error: 'Team not found' });
          }
        }
        // Validate action configs
        const actionValidationError = validateWorkflowActions(workflowData.actions);
        if (actionValidationError) {
          return res.status(400).json({ error: actionValidationError });
        }
        const workflow = await storage.createWorkflow(workflowData);
        res.status(201).json(workflow);
      } catch (error) {
        console.error('Error creating workflow:', error);
        res.status(400).json({ error: 'Failed to create workflow' });
      }
    });

    app.put(
      '/api/workflows/:id',
      requireAuthIfEnabled,
      requireTeamMembership,
      async (req: AuthRequest, res) => {
        try {
          const id = parseInt(req.params.id);
          // Verify the existing workflow belongs to a team the requester is a member of
          const existingWorkflow = await storage.getWorkflow(id);
          if (!existingWorkflow) {
            return res.status(404).json({ error: 'Workflow not found' });
          }
          if (existingWorkflow.teamId && req.user?.id) {
            const userTeamIds = await storage.getUserTeamIds(req.user.id);
            if (!userTeamIds.includes(Number(existingWorkflow.teamId))) {
              return res.status(403).json({ message: 'You are not a member of this team' });
            }
          } else if (existingWorkflow.teamId && config.enforceAuthForWrites) {
            return res.status(401).json({ message: 'Authentication required' });
          }
          const workflowData = { ...req.body };
          // Resolve string teamId (teamName) to numeric ID
          if (
            workflowData.teamId &&
            typeof workflowData.teamId === 'string' &&
            isNaN(parseInt(workflowData.teamId))
          ) {
            const team = await storage.getTeamByName(workflowData.teamId);
            if (team) {
              workflowData.teamId = team.id;
            } else {
              return res.status(400).json({ error: 'Team not found' });
            }
          }
          // Prevent cross-team reassignment: if new teamId differs, verify membership
          if (
            workflowData.teamId !== undefined &&
            workflowData.teamId !== null &&
            Number(workflowData.teamId) !== Number(existingWorkflow.teamId)
          ) {
            if (req.user?.id) {
              const userTeamIds = await storage.getUserTeamIds(req.user.id);
              if (!userTeamIds.includes(Number(workflowData.teamId))) {
                return res.status(403).json({ message: 'You are not a member of the target team' });
              }
            } else if (config.enforceAuthForWrites) {
              return res.status(401).json({ message: 'Authentication required' });
            }
          }
          const actionValidationError = validateWorkflowActions(workflowData.actions);
          if (actionValidationError) {
            return res.status(400).json({ error: actionValidationError });
          }
          const workflow = await storage.updateWorkflow(id, workflowData);
          if (!workflow) {
            return res.status(404).json({ error: 'Workflow not found' });
          }
          res.json(workflow);
        } catch (error) {
          console.error('Error updating workflow:', error);
          res.status(400).json({ error: 'Failed to update workflow' });
        }
      }
    );

    app.delete('/api/workflows/:id', requireAuthIfEnabled, async (req: AuthRequest, res) => {
      try {
        const id = parseInt(req.params.id);
        const existingWorkflow = await storage.getWorkflow(id);
        if (!existingWorkflow) {
          return res.status(404).json({ error: 'Workflow not found' });
        }
        if (existingWorkflow.teamId && req.user?.id) {
          const userTeamIds = await storage.getUserTeamIds(req.user.id);
          if (!userTeamIds.includes(Number(existingWorkflow.teamId))) {
            return res.status(403).json({ message: 'You are not a member of this team' });
          }
        } else if (existingWorkflow.teamId && config.enforceAuthForWrites) {
          return res.status(401).json({ message: 'Authentication required' });
        }
        const success = await storage.deleteWorkflow(id);
        if (!success) {
          return res.status(404).json({ error: 'Workflow not found' });
        }
        res.status(204).send();
      } catch (error) {
        console.error('Error deleting workflow:', error);
        res.status(500).json({ error: 'Failed to delete workflow' });
      }
    });

    app.post('/api/workflows/:id/toggle', requireAuthIfEnabled, async (req: AuthRequest, res) => {
      try {
        const id = parseInt(req.params.id);
        const existingWorkflow = await storage.getWorkflow(id);
        if (!existingWorkflow) {
          return res.status(404).json({ error: 'Workflow not found' });
        }
        if (existingWorkflow.teamId && req.user?.id) {
          const userTeamIds = await storage.getUserTeamIds(req.user.id);
          if (!userTeamIds.includes(Number(existingWorkflow.teamId))) {
            return res.status(403).json({ message: 'You are not a member of this team' });
          }
        } else if (existingWorkflow.teamId && config.enforceAuthForWrites) {
          return res.status(401).json({ message: 'Authentication required' });
        }
        const { isActive } = req.body;
        const workflow = await storage.toggleWorkflow(id, isActive);
        if (!workflow) {
          return res.status(404).json({ error: 'Workflow not found' });
        }
        res.json(workflow);
      } catch (error) {
        console.error('Error toggling workflow:', error);
        res.status(500).json({ error: 'Failed to toggle workflow' });
      }
    });

    // Dry-run / test a workflow without persisting side-effects
    app.post('/api/workflows/:id/test', requireAuthIfEnabled, async (req: AuthRequest, res) => {
      try {
        const id = parseInt(req.params.id);
        const workflow = await storage.getWorkflow(id);
        if (!workflow) {
          return res.status(404).json({ error: 'Workflow not found' });
        }
        if (workflow.teamId && req.user?.id) {
          const userTeamIds = await storage.getUserTeamIds(req.user.id);
          if (!userTeamIds.includes(Number(workflow.teamId))) {
            return res.status(403).json({ message: 'You are not a member of this team' });
          }
        } else if (workflow.teamId && config.enforceAuthForWrites) {
          return res.status(401).json({ message: 'Authentication required' });
        }
        const triggerData = req.body.triggerData || {};
        const run = await executeWorkflow(workflow, triggerData);
        res.json({ dryRun: true, run });
      } catch (error) {
        console.error('Error testing workflow:', error);
        res.status(500).json({ error: 'Failed to test workflow' });
      }
    });

    app.get('/api/workflows/:id/runs', requireAuthIfEnabled, async (req: AuthRequest, res) => {
      try {
        const id = parseInt(req.params.id);
        const existingWorkflow = await storage.getWorkflow(id);
        if (!existingWorkflow) {
          return res.status(404).json({ error: 'Workflow not found' });
        }
        if (existingWorkflow.teamId && req.user?.id) {
          const userTeamIds = await storage.getUserTeamIds(req.user.id);
          if (!userTeamIds.includes(Number(existingWorkflow.teamId))) {
            return res.status(403).json({ message: 'You are not a member of this team' });
          }
        } else if (existingWorkflow.teamId && config.enforceAuthForWrites) {
          return res.status(401).json({ message: 'Authentication required' });
        }
        const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
        const runs = await storage.getWorkflowRuns(id, limit);
        res.json(runs);
      } catch (error) {
        console.error('Error fetching workflow runs:', error);
        res.status(500).json({ error: 'Failed to fetch workflow runs' });
      }
    });
  }

  // ==================== Saved Views API ====================

  app.get(
    '/api/saved-views',
    optionalAuth,
    requireTeamMembership,
    async (req: AuthRequest, res) => {
      try {
        let teamId: number | undefined;
        if (req.query.teamId) {
          const teamIdParam = req.query.teamId as string;
          if (!isNaN(parseInt(teamIdParam))) {
            teamId = parseInt(teamIdParam);
          } else {
            const team = await storage.getTeamByName(teamIdParam);
            if (team) {
              teamId = team.id;
            }
          }
        }
        const createdBy = req.query.createdBy ? parseInt(req.query.createdBy as string) : undefined;
        const entityType = req.query.entityType as string | undefined;
        const isPublic =
          req.query.isPublic === 'true' ? true : req.query.isPublic === 'false' ? false : undefined;

        // If no teamId specified, scope to user's teams to prevent full data leak
        if (!teamId) {
          const userTeamIds = (req as any).userTeamIds as number[] | undefined;
          if (userTeamIds && userTeamIds.length > 0) {
            const allViews = await Promise.all(
              userTeamIds.map((tid) =>
                storage.getSavedViews({ teamId: tid, createdBy, entityType, isPublic })
              )
            );
            return res.json(allViews.flat());
          }
          return res.json([]);
        }

        const views = await storage.getSavedViews({
          teamId,
          createdBy,
          entityType,
          isPublic,
        });

        res.json(views);
      } catch (error) {
        console.error('Error fetching saved views:', error);
        res.status(500).json({ error: 'Failed to fetch saved views' });
      }
    }
  );

  app.get('/api/saved-views/:id', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid view ID' });
      }

      const view = await storage.getSavedView(id);
      if (!view) {
        return res.status(404).json({ error: 'View not found' });
      }

      if (view.teamId && req.user?.id) {
        const userTeamIds = await storage.getUserTeamIds(req.user.id);
        if (!userTeamIds.includes(Number(view.teamId))) {
          return res.status(403).json({ message: 'You are not a member of this team' });
        }
      } else if (view.teamId && config.enforceAuthForWrites) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      res.json(view);
    } catch (error) {
      console.error('Error fetching saved view:', error);
      res.status(500).json({ error: 'Failed to fetch saved view' });
    }
  });

  app.post('/api/saved-views', requireAuthIfEnabled, requireTeamMembership, async (req, res) => {
    try {
      const validatedData = insertSavedViewSchema.parse(req.body);
      const view = await storage.createSavedView(validatedData);
      res.status(201).json(view);
    } catch (error) {
      console.error('Error creating saved view:', error);
      res.status(400).json({ error: 'Failed to create saved view' });
    }
  });

  app.put(
    '/api/saved-views/:id',
    requireAuthIfEnabled,
    requireTeamMembership,
    async (req: AuthRequest, res) => {
      try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
          return res.status(400).json({ error: 'Invalid view ID' });
        }

        // Verify ownership based on the existing resource's teamId, not request body
        const existingView = await storage.getSavedView(id);
        if (!existingView) {
          return res.status(404).json({ error: 'View not found' });
        }
        if (existingView.teamId && req.user?.id) {
          const userTeamIds = await storage.getUserTeamIds(req.user.id);
          if (!userTeamIds.includes(Number(existingView.teamId))) {
            return res.status(403).json({ message: 'You are not a member of this team' });
          }
        } else if (existingView.teamId && config.enforceAuthForWrites) {
          return res.status(401).json({ message: 'Authentication required' });
        }

        const validatedData = updateSavedViewSchema.parse(req.body);
        // Prevent cross-team reassignment
        if (
          validatedData.teamId !== undefined &&
          validatedData.teamId !== null &&
          Number(validatedData.teamId) !== Number(existingView.teamId)
        ) {
          if (req.user?.id) {
            const userTeamIds = await storage.getUserTeamIds(req.user.id);
            if (!userTeamIds.includes(Number(validatedData.teamId))) {
              return res.status(403).json({ message: 'You are not a member of the target team' });
            }
          } else if (config.enforceAuthForWrites) {
            return res.status(401).json({ message: 'Authentication required' });
          }
        }
        const view = await storage.updateSavedView(id, validatedData);
        if (!view) {
          return res.status(404).json({ error: 'View not found' });
        }

        res.json(view);
      } catch (error) {
        console.error('Error updating saved view:', error);
        res.status(400).json({ error: 'Failed to update saved view' });
      }
    }
  );

  app.delete('/api/saved-views/:id', requireAuthIfEnabled, async (req: AuthRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid view ID' });
      }

      const existingView = await storage.getSavedView(id);
      if (!existingView) {
        return res.status(404).json({ error: 'View not found' });
      }
      if (existingView.teamId && req.user?.id) {
        const userTeamIds = await storage.getUserTeamIds(req.user.id);
        if (!userTeamIds.includes(Number(existingView.teamId))) {
          return res.status(403).json({ message: 'You are not a member of this team' });
        }
      } else if (existingView.teamId && config.enforceAuthForWrites) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      const success = await storage.deleteSavedView(id);
      if (!success) {
        return res.status(404).json({ error: 'View not found' });
      }

      res.status(204).send();
    } catch (error) {
      console.error('Error deleting saved view:', error);
      res.status(500).json({ error: 'Failed to delete saved view' });
    }
  });

  app.post(
    '/api/saved-views/:id/set-default',
    requireAuthIfEnabled,
    requireTeamMembership,
    async (req: AuthRequest, res) => {
      try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
          return res.status(400).json({ error: 'Invalid view ID' });
        }

        // Use the existing resource's values ? never trust request body for teamId/entityType
        const existingView = await storage.getSavedView(id);
        if (!existingView) {
          return res.status(404).json({ error: 'View not found' });
        }
        if (existingView.teamId && req.user?.id) {
          const userTeamIds = await storage.getUserTeamIds(req.user.id);
          if (!userTeamIds.includes(Number(existingView.teamId))) {
            return res.status(403).json({ message: 'You are not a member of this team' });
          }
        } else if (existingView.teamId && config.enforceAuthForWrites) {
          return res.status(401).json({ message: 'Authentication required' });
        }

        if (!existingView.teamId || !existingView.entityType) {
          return res.status(400).json({ error: 'View is missing teamId or entityType' });
        }
        await storage.setDefaultView(id, existingView.teamId, existingView.entityType);
        res.json({ success: true });
      } catch (error) {
        console.error('Error setting default view:', error);
        res.status(500).json({ error: 'Failed to set default view' });
      }
    }
  );

  // ==================== Database Schema Routes ====================

  // Create database schema
  app.post('/api/database/schemas', requireAuthIfEnabled, async (req: AuthRequest, res) => {
    try {
      const { pageId, name, fields, primaryDisplay } = req.body;

      if (!pageId || !name || !fields) {
        return res.status(400).json({ error: 'pageId, name, and fields are required' });
      }

      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const schema = await storage.createDatabaseSchema(pageId, userId, {
        name,
        fields,
        primaryDisplay,
      });

      res.status(201).json(schema);
    } catch (error) {
      console.error('Error creating database schema:', error);
      res.status(500).json({ error: 'Failed to create database schema' });
    }
  });

  // Get database schema
  app.get('/api/database/schemas/:id', requireAuthIfEnabled, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid schema ID' });
      }

      const schema = await storage.getDatabaseSchema(id);
      if (!schema) {
        return res.status(404).json({ error: 'Schema not found' });
      }

      res.json(schema);
    } catch (error) {
      console.error('Error fetching database schema:', error);
      res.status(500).json({ error: 'Failed to fetch database schema' });
    }
  });

  // Update database schema
  app.patch('/api/database/schemas/:id', requireAuthIfEnabled, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid schema ID' });
      }

      const { name, fields, primaryDisplay } = req.body;
      const schema = await storage.updateDatabaseSchema(id, {
        name,
        fields,
        primaryDisplay,
      });

      res.json(schema);
    } catch (error) {
      console.error('Error updating database schema:', error);
      res.status(500).json({ error: 'Failed to update database schema' });
    }
  });

  // Delete database schema
  app.delete('/api/database/schemas/:id', requireAuthIfEnabled, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid schema ID' });
      }

      await storage.deleteDatabaseSchema(id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting database schema:', error);
      res.status(500).json({ error: 'Failed to delete database schema' });
    }
  });

  // ==================== Database Row Routes ====================

  // Create database row
  app.post('/api/database/rows', requireAuthIfEnabled, async (req: AuthRequest, res) => {
    try {
      const { schemaId, data } = req.body;

      if (!schemaId || !data) {
        return res.status(400).json({ error: 'schemaId and data are required' });
      }

      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const row = await storage.createDatabaseRow(schemaId, userId, data);
      res.status(201).json(row);
    } catch (error) {
      console.error('Error creating database row:', error);
      res.status(500).json({ error: 'Failed to create database row' });
    }
  });

  // Get database row
  app.get('/api/database/rows/:id', requireAuthIfEnabled, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid row ID' });
      }

      const row = await storage.getDatabaseRow(id);
      if (!row) {
        return res.status(404).json({ error: 'Row not found' });
      }

      res.json(row);
    } catch (error) {
      console.error('Error fetching database row:', error);
      res.status(500).json({ error: 'Failed to fetch database row' });
    }
  });

  // Get all rows for a schema
  app.get('/api/database/schemas/:schemaId/rows', requireAuthIfEnabled, async (req, res) => {
    try {
      const schemaId = parseInt(req.params.schemaId);
      if (isNaN(schemaId)) {
        return res.status(400).json({ error: 'Invalid schema ID' });
      }

      const rows = await storage.getDatabaseRows(schemaId);
      res.json(rows);
    } catch (error) {
      console.error('Error fetching database rows:', error);
      res.status(500).json({ error: 'Failed to fetch database rows' });
    }
  });

  // Update database row
  app.patch('/api/database/rows/:id', requireAuthIfEnabled, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid row ID' });
      }

      const { data } = req.body;
      if (!data) {
        return res.status(400).json({ error: 'data is required' });
      }

      const row = await storage.updateDatabaseRow(id, data);
      res.json(row);
    } catch (error) {
      console.error('Error updating database row:', error);
      res.status(500).json({ error: 'Failed to update database row' });
    }
  });

  // Delete database row
  app.delete('/api/database/rows/:id', requireAuthIfEnabled, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid row ID' });
      }

      await storage.deleteDatabaseRow(id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting database row:', error);
      res.status(500).json({ error: 'Failed to delete database row' });
    }
  });

  // ==================== Database Relations Routes ====================

  // Add relation
  app.post('/api/database/relations', requireAuthIfEnabled, async (req, res) => {
    try {
      const { fromSchemaId, fromRowId, propertyName, toSchemaId, toRowId } = req.body;

      if (!fromSchemaId || !fromRowId || !propertyName || !toSchemaId || !toRowId) {
        return res.status(400).json({
          error: 'fromSchemaId, fromRowId, propertyName, toSchemaId, and toRowId are required',
        });
      }

      const relation = await storage.addRelation(
        fromSchemaId,
        fromRowId,
        propertyName,
        toSchemaId,
        toRowId
      );

      res.status(201).json(relation);
    } catch (error) {
      console.error('Error adding relation:', error);
      res.status(500).json({ error: 'Failed to add relation' });
    }
  });

  // Get relations for a row
  app.get('/api/database/rows/:rowId/relations', requireAuthIfEnabled, async (req, res) => {
    try {
      const rowId = parseInt(req.params.rowId);
      if (isNaN(rowId)) {
        return res.status(400).json({ error: 'Invalid row ID' });
      }

      const propertyName = req.query.propertyName as string | undefined;
      const relations = await storage.getRelations(rowId, propertyName);

      res.json(relations);
    } catch (error) {
      console.error('Error fetching relations:', error);
      res.status(500).json({ error: 'Failed to fetch relations' });
    }
  });

  // Delete relation
  app.delete('/api/database/relations/:id', requireAuthIfEnabled, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid relation ID' });
      }

      await storage.deleteRelation(id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting relation:', error);
      res.status(500).json({ error: 'Failed to delete relation' });
    }
  });

  // Calculate rollup
  app.post('/api/database/rows/:rowId/rollup', requireAuthIfEnabled, async (req, res) => {
    try {
      const rowId = parseInt(req.params.rowId);
      if (isNaN(rowId)) {
        return res.status(400).json({ error: 'Invalid row ID' });
      }

      const { fieldName, relationField, targetField, aggregation } = req.body;

      if (!fieldName || !relationField || !targetField || !aggregation) {
        return res.status(400).json({
          error: 'fieldName, relationField, targetField, and aggregation are required',
        });
      }

      const value = await storage.calculateRollup(rowId, fieldName, {
        relationField,
        targetField,
        aggregation,
      });

      res.json({ value });
    } catch (error) {
      console.error('Error calculating rollup:', error);
      res.status(500).json({ error: 'Failed to calculate rollup' });
    }
  });

  // ==================== Synced Block Routes ====================

  // Create synced block
  app.post('/api/synced-blocks', requireAuthIfEnabled, async (req: AuthRequest, res) => {
    try {
      const { originalBlockId, content } = req.body;

      if (!originalBlockId || !content) {
        return res.status(400).json({ error: 'originalBlockId and content are required' });
      }

      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const syncedBlock = await storage.createSyncedBlock(originalBlockId, userId, content);
      res.status(201).json(syncedBlock);
    } catch (error) {
      console.error('Error creating synced block:', error);
      res.status(500).json({ error: 'Failed to create synced block' });
    }
  });

  // Get synced block
  app.get('/api/synced-blocks/:originalBlockId', requireAuthIfEnabled, async (req, res) => {
    try {
      const { originalBlockId } = req.params;

      const syncedBlock = await storage.getSyncedBlock(originalBlockId);
      if (!syncedBlock) {
        return res.status(404).json({ error: 'Synced block not found' });
      }

      res.json(syncedBlock);
    } catch (error) {
      console.error('Error fetching synced block:', error);
      res.status(500).json({ error: 'Failed to fetch synced block' });
    }
  });

  // List all synced blocks (for picker)
  app.get('/api/synced-blocks', requireAuthIfEnabled, async (req: AuthRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.json([]);
      }
      const blocks = await storage.getUserSyncedBlocks(userId);
      res.json(blocks);
    } catch (error) {
      console.error('Error listing synced blocks:', error);
      res.json([]);
    }
  });

  // Update synced block content
  app.patch('/api/synced-blocks/:originalBlockId', requireAuthIfEnabled, async (req, res) => {
    try {
      const { originalBlockId } = req.params;
      const { content } = req.body;

      if (!content) {
        return res.status(400).json({ error: 'content is required' });
      }

      const syncedBlock = await storage.updateSyncedBlockContent(originalBlockId, content);
      res.json(syncedBlock);
    } catch (error) {
      console.error('Error updating synced block:', error);
      res.status(500).json({ error: 'Failed to update synced block' });
    }
  });

  // Delete synced block
  app.delete('/api/synced-blocks/:originalBlockId', requireAuthIfEnabled, async (req, res) => {
    try {
      const { originalBlockId } = req.params;

      await storage.deleteSyncedBlock(originalBlockId);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting synced block:', error);
      res.status(500).json({ error: 'Failed to delete synced block' });
    }
  });

  // ==================== AI Assistant Routes ====================

  // Check AI availability
  app.get('/api/ai/status', (req, res) => {
    res.json({
      available: aiAssistant.isAvailable(),
      message: aiAssistant.isAvailable()
        ? 'AI assistant is ready'
        : 'AI assistant requires OPENAI_API_KEY configuration',
    });
  });

  // AI text assistance
  app.post('/api/ai/assist', rlAI, requireAuthIfEnabled, async (req, res) => {
    try {
      const { command, text, language, targetCase } = req.body;

      if (!command || !text) {
        return res.status(400).json({ error: 'command and text are required' });
      }

      const result = await aiAssistant.assist({
        command,
        text,
        language,
        targetCase,
      });

      res.json(result);
    } catch (error) {
      logger.error('[Route] /api/ai/assist ? upstream failure', {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(502).json({ error: 'Upstream AI failure' });
    }
  });

  // AI block generation
  app.post('/api/ai/generate-block', rlAI, requireAuthIfEnabled, async (req, res) => {
    try {
      const { prompt, blockType } = req.body;

      if (!prompt || !blockType) {
        return res.status(400).json({ error: 'prompt and blockType are required' });
      }

      if (!['table', 'list', 'code'].includes(blockType)) {
        return res.status(400).json({ error: 'Invalid blockType. Must be: table, list, or code' });
      }

      const result = await aiAssistant.generateBlock(prompt, blockType);
      res.json(result);
    } catch (error) {
      logger.error('[Route] /api/ai/generate-block ? upstream failure', {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(502).json({ error: 'Upstream AI failure' });
    }
  });

  // AI smart suggestions
  app.post('/api/ai/suggestions', rlAI, requireAuthIfEnabled, async (req, res) => {
    try {
      const { text, cursorPosition } = req.body;

      if (text === undefined || cursorPosition === undefined) {
        return res.status(400).json({ error: 'text and cursorPosition are required' });
      }

      const suggestions = await aiAssistant.getSuggestions(text, cursorPosition);
      res.json({ suggestions });
    } catch (error) {
      logger.error('[Route] /api/ai/suggestions ? upstream failure', {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(502).json({ error: 'Upstream AI failure' });
    }
  });

  // AI auto-format
  app.post('/api/ai/auto-format', rlAI, requireAuthIfEnabled, async (req, res) => {
    try {
      const { text } = req.body;

      if (!text) {
        return res.status(400).json({ error: 'text is required' });
      }

      const result = await aiAssistant.autoFormat(text);
      res.json(result);
    } catch (error) {
      logger.error('[Route] /api/ai/auto-format ? upstream failure', {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(502).json({ error: 'Upstream AI failure' });
    }
  });

  // Inline AI action on selected text (summarize | rewrite | taskify)
  app.post('/api/ai/inline', rlAI, requireAuthIfEnabled, async (req, res) => {
    try {
      const { action, text } = req.body;

      if (!action || !text) {
        return res.status(400).json({ error: 'action and text are required' });
      }

      if (!['summarize', 'rewrite', 'taskify'].includes(action)) {
        return res
          .status(400)
          .json({ error: 'Invalid action. Must be: summarize, rewrite, or taskify' });
      }

      const result = await inlineAIAction(action, text);
      res.json(result);
    } catch (error) {
      logger.error('[Route] /api/ai/inline ? upstream failure', {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(502).json({ error: 'Upstream AI failure' });
    }
  });

  // ==================== Page Favorites / Bookmarks API ====================

  // Get user's favorite pages
  app.get('/api/favorites', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const { eq, desc } = await import('drizzle-orm');
      const db = (storage as any).db;

      const favorites = await db
        .select({
          id: pageFavorites.id,
          pageId: pageFavorites.pageId,
          createdAt: pageFavorites.createdAt,
          pageTitle: wikiPages.title,
          pageSlug: wikiPages.slug,
          pageFolder: wikiPages.folder,
          pageUpdatedAt: wikiPages.updatedAt,
        })
        .from(pageFavorites)
        .innerJoin(wikiPages, eq(pageFavorites.pageId, wikiPages.id))
        .where(eq(pageFavorites.userId, userId))
        .orderBy(desc(pageFavorites.createdAt));

      res.json(favorites);
    } catch (error) {
      logger.error('Error fetching favorites:', { error });
      res.status(500).json({ error: 'Failed to fetch favorites' });
    }
  });

  // Add a page to favorites
  app.post('/api/favorites/:pageId', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const pageId = parseInt(req.params.pageId);
      if (isNaN(pageId)) return res.status(400).json({ error: 'Invalid page ID' });

      const page = await storage.getWikiPage(pageId);
      if (!page) return res.status(404).json({ error: 'Page not found' });

      const { eq, and } = await import('drizzle-orm');
      const db = (storage as any).db;

      // Check if already favorited
      const existing = await db
        .select()
        .from(pageFavorites)
        .where(and(eq(pageFavorites.userId, userId), eq(pageFavorites.pageId, pageId)));

      if (existing.length > 0) {
        return res.status(409).json({ error: 'Page already in favorites' });
      }

      const [favorite] = await db.insert(pageFavorites).values({ userId, pageId }).returning();

      res.status(201).json(favorite);
    } catch (error) {
      logger.error('Error adding favorite:', { error });
      res.status(500).json({ error: 'Failed to add favorite' });
    }
  });

  // Remove a page from favorites
  app.delete('/api/favorites/:pageId', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const pageId = parseInt(req.params.pageId);
      if (isNaN(pageId)) return res.status(400).json({ error: 'Invalid page ID' });

      const { eq, and } = await import('drizzle-orm');
      const db = (storage as any).db;

      const result = await db
        .delete(pageFavorites)
        .where(and(eq(pageFavorites.userId, userId), eq(pageFavorites.pageId, pageId)))
        .returning();

      if (result.length === 0) {
        return res.status(404).json({ error: 'Favorite not found' });
      }

      res.status(204).send();
    } catch (error) {
      logger.error('Error removing favorite:', { error });
      res.status(500).json({ error: 'Failed to remove favorite' });
    }
  });

  // Check if a page is favorited
  app.get('/api/favorites/check/:pageId', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const pageId = parseInt(req.params.pageId);
      if (isNaN(pageId)) return res.status(400).json({ error: 'Invalid page ID' });

      const { eq, and } = await import('drizzle-orm');
      const db = (storage as any).db;

      const existing = await db
        .select()
        .from(pageFavorites)
        .where(and(eq(pageFavorites.userId, userId), eq(pageFavorites.pageId, pageId)));

      res.json({ isFavorited: existing.length > 0 });
    } catch (error) {
      res.status(500).json({ error: 'Failed to check favorite status' });
    }
  });

  // ==================== Page Analytics API ====================

  // Record a page view
  app.post('/api/pages/:id/view', rlAnalytics, optionalAuth, async (req: AuthRequest, res) => {
    try {
      const pageId = parseInt(req.params.id);
      if (isNaN(pageId)) return res.status(400).json({ error: 'Invalid page ID' });

      const db = (storage as any).db;
      await db.insert(pageViews).values({
        pageId,
        userId: req.user?.id || null,
      });

      res.status(201).json({ recorded: true });
    } catch (error) {
      // Don't fail the request if analytics recording fails
      res.status(201).json({ recorded: false });
    }
  });

  // Get page view stats
  app.get('/api/pages/:id/analytics', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const pageId = parseInt(req.params.id);
      if (isNaN(pageId)) return res.status(400).json({ error: 'Invalid page ID' });

      const { eq, sql, desc } = await import('drizzle-orm');
      const db = (storage as any).db;

      // Total views
      const [totalResult] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(pageViews)
        .where(eq(pageViews.pageId, pageId));

      // Unique viewers
      const [uniqueResult] = await db
        .select({ count: sql<number>`COUNT(DISTINCT ${pageViews.userId})` })
        .from(pageViews)
        .where(eq(pageViews.pageId, pageId));

      // Views in last 7 days
      const [weekResult] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(pageViews)
        .where(
          sql`${pageViews.pageId} = ${pageId} AND ${pageViews.viewedAt} > NOW() - INTERVAL '7 days'`
        );

      // Daily views for last 30 days
      const dailyViews = await db
        .select({
          date: sql<string>`DATE(${pageViews.viewedAt})`,
          count: sql<number>`COUNT(*)`,
        })
        .from(pageViews)
        .where(
          sql`${pageViews.pageId} = ${pageId} AND ${pageViews.viewedAt} > NOW() - INTERVAL '30 days'`
        )
        .groupBy(sql`DATE(${pageViews.viewedAt})`)
        .orderBy(sql`DATE(${pageViews.viewedAt})`);

      res.json({
        totalViews: Number(totalResult?.count || 0),
        uniqueViewers: Number(uniqueResult?.count || 0),
        viewsLast7Days: Number(weekResult?.count || 0),
        dailyViews,
      });
    } catch (error) {
      logger.error('Error fetching page analytics:', { error });
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  });

  // Get popular pages (top viewed)
  app.get(
    '/api/analytics/popular',
    optionalAuth,
    requireTeamMembership,
    async (req: AuthRequest, res) => {
      try {
        const { sql, desc, eq } = await import('drizzle-orm');
        const db = (storage as any).db;
        const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
        const days = Math.min(parseInt(req.query.days as string) || 30, 365);

        const popular = await db
          .select({
            pageId: pageViews.pageId,
            pageTitle: wikiPages.title,
            pageSlug: wikiPages.slug,
            viewCount: sql<number>`COUNT(*)`,
            uniqueViewers: sql<number>`COUNT(DISTINCT ${pageViews.userId})`,
          })
          .from(pageViews)
          .innerJoin(wikiPages, eq(pageViews.pageId, wikiPages.id))
          .where(sql`${pageViews.viewedAt} > NOW() - MAKE_INTERVAL(days => ${days})`)
          .groupBy(pageViews.pageId, wikiPages.title, wikiPages.slug)
          .orderBy(sql`COUNT(*) DESC`)
          .limit(limit);

        res.json(popular);
      } catch (error) {
        logger.error('Error fetching popular pages:', { error });
        res.status(500).json({ error: 'Failed to fetch popular pages' });
      }
    }
  );

  // ==================== Activity Feed API ====================

  // Get activity feed
  app.get('/api/activity', optionalAuth, requireTeamMembership, async (req: AuthRequest, res) => {
    try {
      const { desc, eq, sql, inArray, and } = await import('drizzle-orm');
      const db = (storage as any).db;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = parseInt(req.query.offset as string) || 0;
      const action = req.query.action as string | undefined;
      const targetType = req.query.targetType as string | undefined;

      const userTeamIds: number[] = (req as any).userTeamIds ?? [];

      const conditions: any[] = [];

      // Filter by user's teams
      if (userTeamIds.length > 0) {
        conditions.push(
          sql`(${activityFeed.teamId} IN (${sql.join(
            userTeamIds.map((id) => sql`${id}`),
            sql`, `
          )}) OR ${activityFeed.teamId} IS NULL)`
        );
      }

      // Filter by action type
      if (action) {
        conditions.push(eq(activityFeed.action, action));
      }

      // Filter by target type
      if (targetType) {
        conditions.push(eq(activityFeed.targetType, targetType));
      }

      let query = db
        .select()
        .from(activityFeed)
        .orderBy(desc(activityFeed.createdAt))
        .limit(limit)
        .offset(offset);

      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }

      const activities = await query;

      res.json({
        activities,
        pagination: { limit, offset, count: activities.length },
      });
    } catch (error) {
      logger.error('Error fetching activity feed:', { error });
      res.status(500).json({ error: 'Failed to fetch activity feed' });
    }
  });

  // ==================== Page Export API ====================

  // Export a page in various formats
  app.get(
    '/api/pages/:id/export',
    optionalAuth,
    requirePagePermission('viewer'),
    async (req: AuthRequest, res) => {
      try {
        const pageId = parseInt(req.params.id);
        const format = (req.query.format as string) || 'markdown';
        const page = await storage.getWikiPage(pageId);

        if (!page) return res.status(404).json({ error: 'Page not found' });

        switch (format) {
          case 'markdown':
          case 'md': {
            const frontmatter = [
              '---',
              `title: "${page.title.replace(/"/g, '\\"')}"`,
              `slug: "${page.slug}"`,
              `author: "${page.author}"`,
              `folder: "${page.folder}"`,
              `tags: [${page.tags.map((t) => `"${t}"`).join(', ')}]`,
              `created: "${page.createdAt}"`,
              `updated: "${page.updatedAt}"`,
              '---',
              '',
            ].join('\n');

            const markdown = frontmatter + (page.content || '');
            res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${page.slug}.md"`);
            return res.send(markdown);
          }

          case 'html': {
            const { remark } = await import('remark');
            const remarkGfm = (await import('remark-gfm')).default;
            const remarkRehype = (await import('remark-rehype')).default;
            const rehypeStringify = (await import('rehype-stringify')).default;

            const processor = remark().use(remarkGfm).use(remarkRehype).use(rehypeStringify);
            const result = await processor.process(page.content || '');

            const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${page.title.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; line-height: 1.6; color: #1a1a1a; }
    h1, h2, h3 { margin-top: 1.5em; }
    code { background: #f4f4f4; padding: 0.2em 0.4em; border-radius: 3px; font-size: 0.9em; }
    pre code { display: block; padding: 1em; overflow-x: auto; }
    blockquote { border-left: 3px solid #ddd; margin: 0; padding-left: 1em; color: #555; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    img { max-width: 100%; }
  </style>
</head>
<body>
  <h1>${page.title.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</h1>
  <p><em>Author: ${page.author} | Updated: ${new Date(page.updatedAt).toLocaleDateString()}</em></p>
  <hr>
  ${String(result)}
</body>
</html>`;

            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${page.slug}.html"`);
            return res.send(html);
          }

          case 'json': {
            const exportData = {
              title: page.title,
              slug: page.slug,
              content: page.content,
              blocks: page.blocks,
              folder: page.folder,
              tags: page.tags,
              author: page.author,
              metadata: page.metadata,
              createdAt: page.createdAt,
              updatedAt: page.updatedAt,
            };

            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${page.slug}.json"`);
            return res.json(exportData);
          }

          default:
            return res
              .status(400)
              .json({ error: 'Invalid format. Supported: markdown, html, json' });
        }
      } catch (error) {
        logger.error('Error exporting page:', { error });
        res.status(500).json({ error: 'Failed to export page' });
      }
    }
  );

  // ==================== User Profile API ====================

  // Update user profile
  app.put('/api/auth/profile', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const { name } = req.body;

      if (!name || typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 100) {
        return res.status(400).json({ error: 'Name must be between 1 and 100 characters' });
      }

      const { eq } = await import('drizzle-orm');
      const db = (storage as any).db;

      const [updated] = await db
        .update(users)
        .set({ name: name.trim(), updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning({ id: users.id, name: users.name, email: users.email });

      if (!updated) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json(updated);
    } catch (error) {
      logger.error('Error updating profile:', { error });
      res.status(500).json({ error: 'Failed to update profile' });
    }
  });

  // Change password
  app.post('/api/auth/change-password', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current password and new password are required' });
      }

      // Validate new password strength
      if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128) {
        return res.status(400).json({ error: 'New password must be between 8 and 128 characters' });
      }
      if (
        !/[a-zA-Z]/.test(newPassword) ||
        !/[0-9]/.test(newPassword) ||
        !/[!@#$%^&*(),.?":{}|<>]/.test(newPassword)
      ) {
        return res.status(400).json({
          error:
            'New password must contain at least one letter, one number, and one special character',
        });
      }

      const { eq } = await import('drizzle-orm');
      const db = (storage as any).db;

      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user || !user.hashedPassword) {
        return res.status(400).json({ error: 'Password change not available for OAuth accounts' });
      }

      const isValid = await bcrypt.compare(currentPassword, user.hashedPassword);
      if (!isValid) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 12);
      await db
        .update(users)
        .set({ hashedPassword, updatedAt: new Date() })
        .where(eq(users.id, userId));

      res.json({ message: 'Password changed successfully' });
    } catch (error) {
      logger.error('Error changing password:', { error });
      res.status(500).json({ error: 'Failed to change password' });
    }
  });

  // ==================== System Stats API (Dashboard) ====================

  app.get('/api/stats/overview', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { sql } = await import('drizzle-orm');
      const db = (storage as any).db;

      const [pageCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(wikiPages);
      const [userCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(users);
      const [taskCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(tasks);
      const [commentCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(comments);

      // Pages created this week
      const [weeklyPages] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(wikiPages)
        .where(sql`${wikiPages.createdAt} > NOW() - INTERVAL '7 days'`);

      // Tasks by status
      const tasksByStatus = await db
        .select({
          status: tasks.status,
          count: sql<number>`COUNT(*)`,
        })
        .from(tasks)
        .groupBy(tasks.status);

      res.json({
        totalPages: Number(pageCount?.count || 0),
        totalUsers: Number(userCount?.count || 0),
        totalTasks: Number(taskCount?.count || 0),
        totalComments: Number(commentCount?.count || 0),
        pagesThisWeek: Number(weeklyPages?.count || 0),
        tasksByStatus: tasksByStatus.reduce(
          (acc: Record<string, number>, row: { status: string; count: unknown }) => {
            acc[row.status] = Number(row.count);
            return acc;
          },
          {}
        ),
      });
    } catch (error) {
      logger.error('Error fetching stats:', { error });
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  });

  return { httpServer, io };
}
