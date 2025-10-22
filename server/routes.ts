import type { Express } from 'express';
import { createServer, type Server as HttpServer } from 'http';
import { Server as SocketIoServer } from 'socket.io';
import {
  authMiddleware,
  requireAdmin,
  writeAuthGate,
  buildRateLimiter,
  requireAuthIfEnabled,
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
  users,
} from '../shared/schema.js';
import {
  upload,
  processUploadedFile,
  deleteUploadedFile,
  listUploadedFiles,
  getFileInfo,
} from './services/upload.js';
import { smartSearch, generateSearchSuggestions } from './services/ai.js';
import * as aiService from './services/ai.js';
import path from 'path';
import { existsSync, appendFileSync } from 'fs';
import type { Request } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import passport from 'passport';
import { eq } from 'drizzle-orm';
import { DBStorage } from './storage.js';

interface MulterRequest extends Request {
  files?: any[];
}

export async function registerRoutes(
  app: Express,
  storage: DBStorage
): Promise<{ httpServer: HttpServer; io?: SocketIoServer }> {
  const httpServer = createServer(app);
  let io: SocketIoServer | undefined;

  // app.use(passport.initialize());
  // await import('./services/passport');

  // Setup Socket.IO for real-time collaboration
  try {
    const { setupSocketIO } = await import('./services/socket.js');
    io = setupSocketIO(httpServer, storage);
  } catch (error) {
    console.warn('Socket.IO setup failed:', error);
  }

  // --- Authentication Routes ---

  // Optional global write guard (no-op unless ENFORCE_AUTH_WRITES=true)
  app.use(writeAuthGate);

  // --- Health Check ---
  app.get('/health', (req, res) => {
    const uptime = process.uptime();
    const now = new Date();
    const version = process.env.npm_package_version || '0.0.0';
    res.json({
      status: 'ok',
      time: now.toISOString(),
      uptimeSeconds: Math.round(uptime),
      version,
    });
  });

  // Rate limiters (enabled by config)
  const rlAuth = buildRateLimiter({ windowMs: 60_000, max: 20 }); // tighter for auth endpoints
  const rlAdmin = buildRateLimiter({ windowMs: 60_000, max: 30 });
  const rlUpload = buildRateLimiter({ windowMs: 60_000, max: 30 });

  // User Registration
  app.post('/api/auth/register', rlAuth, async (req, res) => {
    console.log('--- [REGISTER] Received request ---');
    try {
      if (process.env.E2E_DEBUG_AUTH === '1' || process.env.NODE_ENV !== 'production') {
        // avoid logging sensitive fields like full password in logs
        console.log('[E2E DEBUG] /api/auth/register body:', {
          name: req.body?.name,
          email: req.body?.email,
        });
      }
      const { name, email, password } = req.body;
      console.log(`[REGISTER] Data: email=${email}, name=${name}`);
      if (!name || !email || !password) {
        console.log('[REGISTER] Validation failed: Missing fields');
        return res.status(400).json({ message: 'Name, email, and password are required' });
      }

      console.log('[REGISTER] Checking for existing user...');
      const existingUser = await storage.db.select().from(users).where(eq(users.email, email));
      if (existingUser.length > 0) {
        console.log('[REGISTER] User already exists');
        return res.status(409).json({ message: 'User with this email already exists' });
      }

      console.log('[REGISTER] Hashing password...');
      const hashedPassword = await bcrypt.hash(password, 10);

      console.log('[REGISTER] Inserting new user into DB...');
      const newUserResult = await storage.db
        .insert(users)
        .values({ name, email, hashedPassword, provider: 'local' })
        .returning();
      const newUser = newUserResult[0];
      console.log(`[REGISTER] User created successfully with ID: ${newUser.id}`);
      if (process.env.E2E_DEBUG_AUTH === '1' || process.env.NODE_ENV !== 'production') {
        console.log('[E2E DEBUG] /api/auth/register response user:', {
          id: newUser.id,
          email: newUser.email,
        });
      }

      res.status(201).json({
        message: 'User registered successfully',
        user: { id: newUser.id, name: newUser.name, email: newUser.email },
      });
      console.log('--- [REGISTER] Response sent ---');
    } catch (error: any) {
      console.error('--- [REGISTER] Critical error ---', error);
      // Handle unique constraint violation for PostgreSQL (code 23505)
      if (error.code === '23505') {
        return res.status(409).json({ message: 'User with this email already exists' });
      }
      res.status(500).json({ message: 'Server error during registration', error });
    }
  });

  // User Login
  app.post('/api/auth/login', rlAuth, async (req, res) => {
    try {
      if (process.env.E2E_DEBUG_AUTH === '1' || process.env.NODE_ENV !== 'production') {
        // Log email but not password
        console.log('[E2E DEBUG] POST /api/auth/login body:', { email: req.body?.email });
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
      const token = jwt.sign({ id: user.id, email: user.email, role }, config.jwtSecret, {
        expiresIn: '1d',
      });

      if (process.env.E2E_DEBUG_AUTH === '1' || process.env.NODE_ENV !== 'production') {
        console.log('[E2E DEBUG] login success:', {
          id: user.id,
          email: user.email,
          role,
          tokenPresent: !!token,
        });
      }

      res.json({ token, user: { id: user.id, name: user.name, email: user.email, role } });
    } catch (error) {
      res.status(500).json({ message: 'Server error during login', error });
    }
  });

  // Get current user info (Protected Route)
  app.get('/api/auth/me', authMiddleware, async (req: any, res) => {
    try {
      if (process.env.E2E_DEBUG_AUTH === '1' || process.env.NODE_ENV !== 'production') {
        console.log('[E2E DEBUG] GET /api/auth/me headers:', {
          authorization: !!req.headers.authorization,
        });
        console.log('[E2E DEBUG] GET /api/auth/me decodedUser:', req.user);
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

  // --- Social Auth Routes ---

  /*
  // Google Auth
  app.get('/api/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
  app.get('/api/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/login', session: false }),
    (req: any, res) => {
      const token = jwt.sign({ id: req.user.id, email: req.user.email }, config.jwtSecret, { expiresIn: '1d' });
      res.send(`<script>window.localStorage.setItem('token', '${token}');window.location.href='/';</script>`);
    }
  );

  // GitHub Auth
  app.get('/api/auth/github', passport.authenticate('github', { scope: ['user:email'] }));
  app.get('/api/auth/github/callback',
    passport.authenticate('github', { failureRedirect: '/login', session: false }),
    (req: any, res) => {
      const token = jwt.sign({ id: req.user.id, email: req.user.email }, config.jwtSecret, { expiresIn: '1d' });
      res.send(`<script>window.localStorage.setItem('token', '${token}');window.location.href='/';</script>`);
    }
  );
  */

  // Wiki Pages API
  app.get('/api/pages', async (req, res) => {
    try {
      const teamId = req.query.teamId as string;
      const searchParams = searchSchema.parse({
        query: req.query.q as string,
        folder: req.query.folder as string,
        sort: req.query.sort as string as any,
        tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
        teamId: teamId,
      });

      const result = await storage.searchWikiPages(searchParams);
      res.json(result);
    } catch (error) {
      res.status(400).json({ message: 'Invalid search parameters' });
    }
  });

  app.get('/api/pages/:id', async (req, res) => {
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

  app.get('/api/pages/slug/:slug', async (req, res) => {
    try {
      const slug = req.params.slug;
      const page = await storage.getWikiPageBySlug(slug);

      if (!page) {
        return res.status(404).json({ message: 'Page not found' });
      }

      res.json(page);
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  });

  app.post('/api/pages', requireAuthIfEnabled, async (req, res) => {
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

      const page = await storage.createWikiPage(pageData);
      res.status(201).json(page);
    } catch (error) {
      res.status(400).json({ message: 'Invalid page data', error });
    }
  });

  app.put('/api/pages/:id', requireAuthIfEnabled, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updateData = updateWikiPageSchema.parse(req.body);
      const page = await storage.updateWikiPage(id, updateData);

      if (!page) {
        return res.status(404).json({ message: 'Page not found' });
      }

      res.json(page);
    } catch (error) {
      res.status(400).json({ message: 'Invalid update data', error });
    }
  });

  app.delete('/api/pages/:id', requireAuthIfEnabled, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteWikiPage(id);

      if (!deleted) {
        return res.status(404).json({ message: 'Page not found' });
      }

      res.json({ message: 'Page deleted successfully' });
    } catch (error) {
      res.status(400).json({ message: 'Invalid page ID' });
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

  // Calendar Events API
  app.get('/api/calendar', async (req, res) => {
    try {
      const teamId = req.query.teamId as string | undefined;
      const events = await storage.getCalendarEvents(teamId ? Number(teamId) : undefined);

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

  app.get('/api/calendar/:teamId', async (req, res) => {
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
  });

  app.get('/api/calendar/event/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const event = await storage.getCalendarEvent(id);
      if (!event) {
        return res.status(404).json({ message: 'Event not found' });
      }
      res.json(event);
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  });

  app.post('/api/calendar', requireAuthIfEnabled, async (req, res) => {
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
  });

  app.patch('/api/calendar/event/:id', requireAuthIfEnabled, async (req, res) => {
    try {
      const id = parseInt(req.params.id);

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

  app.delete('/api/calendar/event/:id', requireAuthIfEnabled, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteCalendarEvent(id);
      if (!deleted) {
        return res.status(404).json({ message: 'Event not found' });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  });

  // Comments API
  app.get('/api/pages/:pageId/comments', async (req, res) => {
    try {
      const pageId = parseInt(req.params.pageId);
      const comments = await storage.getCommentsByPageId(pageId);
      res.json(comments);
    } catch (error) {
      res.status(400).json({ message: 'Invalid page ID' });
    }
  });

  app.post('/api/pages/:pageId/comments', requireAuthIfEnabled, async (req, res) => {
    try {
      const pageId = parseInt(req.params.pageId);
      const commentData = insertCommentSchema.parse({
        ...req.body,
        pageId,
      });
      const comment = await storage.createComment(commentData);
      res.status(201).json(comment);
    } catch (error) {
      res.status(400).json({ message: 'Invalid comment data', error });
    }
  });

  app.put('/api/comments/:id', requireAuthIfEnabled, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
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

  app.delete('/api/comments/:id', requireAuthIfEnabled, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteComment(id);

      if (!deleted) {
        return res.status(404).json({ message: 'Comment not found' });
      }

      res.json({ message: 'Comment deleted successfully' });
    } catch (error) {
      res.status(400).json({ message: 'Invalid comment ID' });
    }
  });

  // Members API

  app.get('/api/members/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const member = await storage.getMember(id);

      if (!member) {
        return res.status(404).json({ message: 'Member not found' });
      }

      res.json(member);
    } catch (error) {
      res.status(400).json({ message: 'Invalid member ID' });
    }
  });

  app.get('/api/members/email/:email', async (req, res) => {
    try {
      const email = req.params.email;
      const member = await storage.getMemberByEmail(email);

      if (!member) {
        return res.status(404).json({ message: 'Member not found' });
      }

      res.json(member);
    } catch (error) {
      res.status(400).json({ message: 'Invalid email' });
    }
  });

  app.post('/api/members', async (req, res) => {
    try {
      const memberData = insertMemberSchema.parse(req.body);
      const member = await storage.createMember(memberData);
      res.status(201).json(member);
    } catch (error) {
      res.status(400).json({ message: 'Invalid member data', error });
    }
  });

  app.put('/api/members/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updateData = updateMemberSchema.parse(req.body);
      const member = await storage.updateMember(id, updateData);

      if (!member) {
        return res.status(404).json({ message: 'Member not found' });
      }

      res.json(member);
    } catch (error) {
      res.status(400).json({ message: 'Invalid update data', error });
    }
  });

  app.delete('/api/members/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
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

  // File Upload API
  app.post(
    '/api/upload',
    rlUpload,
    requireAuthIfEnabled,
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
  app.get('/api/uploads/images/:filename', async (req, res) => {
    try {
      const { filename } = req.params;
      const fileInfo = await getFileInfo(filename, true);

      if (!fileInfo || !existsSync(fileInfo.path)) {
        return res.status(404).json({ message: 'Image not found' });
      }

      // Set appropriate headers
      res.setHeader('Content-Type', fileInfo.mimetype);
      res.setHeader('Content-Length', fileInfo.size);
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year

      res.sendFile(path.resolve(fileInfo.path));
    } catch (error) {
      res.status(500).json({ message: 'Error serving image' });
    }
  });

  // Serve uploaded files
  app.get('/api/uploads/files/:filename', async (req, res) => {
    try {
      const { filename } = req.params;
      const fileInfo = await getFileInfo(filename, false);

      if (!fileInfo || !existsSync(fileInfo.path)) {
        return res.status(404).json({ message: 'File not found' });
      }

      // Set appropriate headers
      res.setHeader('Content-Type', fileInfo.mimetype);
      res.setHeader('Content-Length', fileInfo.size);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      res.sendFile(path.resolve(fileInfo.path));
    } catch (error) {
      res.status(500).json({ message: 'Error serving file' });
    }
  });

  // List uploaded files
  app.get('/api/uploads', async (req, res) => {
    try {
      const teamId = req.query.teamId as string;
      const fileList = await listUploadedFiles(teamId);
      res.json(fileList);
    } catch (error) {
      res.status(500).json({ message: 'Error listing files' });
    }
  });

  // Delete uploaded file
  app.delete('/api/uploads/:type/:filename', requireAuthIfEnabled, async (req, res) => {
    try {
      const { type, filename } = req.params;
      const isImage = type === 'images';

      if (type !== 'images' && type !== 'files') {
        return res.status(400).json({ message: 'Invalid file type' });
      }

      const deleted = await deleteUploadedFile(filename, isImage);

      if (!deleted) {
        return res.status(404).json({ message: 'File not found' });
      }

      res.json({ message: 'File deleted successfully' });
    } catch (error) {
      res.status(500).json({ message: 'Error deleting file' });
    }
  });

  // Admin Authentication
  app.post('/api/admin/auth', rlAdmin, async (req, res) => {
    try {
      const { password } = req.body;
      if (password === config.adminPassword) {
        // Optional: issue a short-lived admin token for convenience
        const token = jwt.sign(
          { role: 'admin', via: 'password' },
          (config as any).jwtSecret || 'your-default-secret',
          {
            expiresIn: '2h',
          }
        );
        res.json({ success: true, token });
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

  // Dashboard API
  app.get('/api/dashboard/overview', async (req, res) => {
    try {
      const overview = await storage.getDashboardOverview();
      res.json(overview);
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  });

  app.get('/api/dashboard/team/:teamId', async (req, res) => {
    try {
      const teamId = req.params.teamId;
      const stats = await storage.getTeamProgressStats(teamId);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  });

  app.get('/api/dashboard/member/:memberId', async (req, res) => {
    try {
      const memberId = parseInt(req.params.memberId);
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
  app.get('/api/tasks', async (req, res) => {
    try {
      const teamId = req.query.teamId as string;
      const status = req.query.status as string;
      const tasks = await storage.getTasks(teamId, status);
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  });

  app.get('/api/tasks/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const task = await storage.getTask(id);

      if (!task) {
        return res.status(404).json({ message: 'Task not found' });
      }

      res.json(task);
    } catch (error) {
      res.status(400).json({ message: 'Invalid task ID' });
    }
  });

  app.post('/api/tasks', requireAuthIfEnabled, async (req, res) => {
    try {
      const taskData = insertTaskSchema.parse(req.body);
      const task = await storage.createTask(taskData);
      res.status(201).json(task);
    } catch (error) {
      res.status(400).json({ message: 'Invalid task data', error });
    }
  });

  app.put('/api/tasks/:id', requireAuthIfEnabled, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updateData = updateTaskSchema.parse(req.body);
      const task = await storage.updateTask(id, updateData);

      if (!task) {
        return res.status(404).json({ message: 'Task not found' });
      }

      res.json(task);
    } catch (error) {
      res.status(400).json({ message: 'Invalid update data', error });
    }
  });

  app.delete('/api/tasks/:id', requireAuthIfEnabled, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteTask(id);

      if (!deleted) {
        return res.status(404).json({ message: 'Task not found' });
      }

      res.json({ message: 'Task deleted successfully' });
    } catch (error) {
      res.status(400).json({ message: 'Invalid task ID' });
    }
  });

  app.patch('/api/tasks/:id/progress', requireAuthIfEnabled, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { progress } = req.body;

      if (typeof progress !== 'number' || progress < 0 || progress > 100) {
        return res.status(400).json({ message: 'Progress must be a number between 0 and 100' });
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

  // Notifications API
  app.get('/api/notifications', async (req, res) => {
    try {
      const recipientId = parseInt(req.query.recipientId as string);
      if (!recipientId) {
        return res.status(400).json({ message: 'recipientId is required' });
      }

      const notifications = await storage.getNotifications(recipientId);
      res.json(notifications);
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  });

  app.get('/api/notifications/unread-count', async (req, res) => {
    try {
      const recipientId = parseInt(req.query.recipientId as string);
      if (!recipientId) {
        return res.status(400).json({ message: 'recipientId is required' });
      }

      const count = await storage.getUnreadNotificationCount(recipientId);
      res.json({ count });
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  });

  app.get('/api/notifications/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const notification = await storage.getNotification(id);

      if (!notification) {
        return res.status(404).json({ message: 'Notification not found' });
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

  app.put('/api/notifications/:id', requireAuthIfEnabled, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
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

  app.delete('/api/notifications/:id', requireAuthIfEnabled, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
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

  app.patch('/api/notifications/:id/read', requireAuthIfEnabled, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
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

  app.patch('/api/notifications/read-all', requireAuthIfEnabled, async (req, res) => {
    try {
      const { recipientId } = req.body;
      if (!recipientId) {
        return res.status(400).json({ message: 'recipientId is required' });
      }

      await storage.markAllNotificationsAsRead(recipientId);

      // Realtime: emit unread count reset for recipient
      try {
        const ns = io?.of('/collab');
        if (ns) {
          const count = await storage.getUnreadNotificationCount(recipientId);
          ns.to(`user:${recipientId}`).emit('notification:unread-count', { recipientId, count });
        }
      } catch (emitErr) {
        console.warn('Socket emit failed for notification:read-all', emitErr);
      }

      res.json({ message: 'All notifications marked as read' });
    } catch (error) {
      res.status(400).json({ message: 'Invalid request data' });
    }
  });

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

  // Teams API
  app.get('/api/teams', async (req, res) => {
    try {
      const teams = await storage.getTeams();
      res.json(teams);
    } catch (error) {
      console.error('Error fetching teams:', error);
      res.status(500).json({ error: 'Failed to fetch teams' });
    }
  });

  app.get('/api/teams/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
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

  app.put('/api/teams/:id', requireAuthIfEnabled, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
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

  app.delete('/api/teams/:id', requireAuthIfEnabled, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const success = await storage.deleteTeam(id);
      if (!success) {
        return res.status(404).json({ error: 'Team not found' });
      }
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting team:', error);
      res.status(500).json({ error: 'Failed to delete team' });
    }
  });

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

  // Members API with team support
  app.get('/api/members', async (req, res) => {
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

      const members = await storage.getMembers(teamId);
      res.json(members);
    } catch (error) {
      console.error('Error fetching members:', error);
      res.status(500).json({ error: 'Failed to fetch members' });
    }
  });

  app.post('/api/members', requireAuthIfEnabled, async (req, res) => {
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

      const member = await storage.createMember(memberData);
      res.status(201).json(member);
    } catch (error) {
      console.error('Error creating member:', error);
      res.status(400).json({ error: 'Failed to create member' });
    }
  });

  app.put('/api/members/:id', requireAuthIfEnabled, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const memberData = updateMemberSchema.parse(req.body);
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

  app.delete('/api/members/:id', requireAuthIfEnabled, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
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

  // AI 서비스 API
  app.post('/api/ai/generate', requireAuthIfEnabled, async (req, res) => {
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

  app.post('/api/ai/improve', requireAuthIfEnabled, async (req, res) => {
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

  // AI 검색 API
  app.post('/api/ai/search', requireAuthIfEnabled, async (req, res) => {
    try {
      const { query, teamId } = req.body;

      if (!query || query.trim().length === 0) {
        return res.status(400).json({ message: 'Search query is required' });
      }

      // 모든 관련 데이터 수집
      const pagesResult = await storage.searchWikiPages({
        query: '',
        teamId,
        limit: 100,
        offset: 0,
      });
      const tasks = await storage.getTasks(teamId);
      const filesResult = await listUploadedFiles();

      // 문서 배열 생성
      const documents = [
        ...pagesResult.pages.map((page: any) => ({
          id: page.id,
          title: page.title,
          content: page.content,
          type: 'page' as const,
          url: `/page/${page.slug}`,
        })),
        ...tasks.map((task: any) => ({
          id: task.id,
          title: task.title,
          content: task.description || '',
          type: 'task' as const,
          url: `/tasks`,
        })),
        ...filesResult.files.map((file: any) => ({
          id: file.id || 0,
          title: file.filename,
          content: file.description || '',
          type: 'file' as const,
          url: `/files`,
        })),
      ];

      // AI 검색 수행
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

  app.post('/api/ai/search-suggestions', requireAuthIfEnabled, async (req, res) => {
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
  app.post('/api/ai/copilot/chat', requireAuthIfEnabled, async (req, res) => {
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
  app.post('/api/ai/extract-tasks', requireAuthIfEnabled, async (req, res) => {
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
  app.post('/api/ai/related-pages', requireAuthIfEnabled, async (req, res) => {
    try {
      const { content, title, pageId } = req.body;

      if (!content || !title) {
        return res.status(400).json({ error: 'Content and title are required' });
      }

      // Get all pages except current one using search
      const searchResults = await storage.searchWikiPages({ query: '', limit: 100, offset: 0 });
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
  app.get('/api/knowledge-graph', requireAuthIfEnabled, async (req, res) => {
    try {
      const teamId = req.query.teamId as string | undefined;
      const includeAILinks = req.query.includeAI === 'true';

      // Get all pages
      const searchResults = await storage.searchWikiPages({
        query: '',
        limit: 1000,
        offset: 0,
        teamId: teamId,
      });

      const pages = searchResults.pages;

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
  });

  // ==================== Saved Views API ====================

  app.get('/api/saved-views', async (req, res) => {
    try {
      const teamId = req.query.teamId ? parseInt(req.query.teamId as string) : undefined;
      const createdBy = req.query.createdBy ? parseInt(req.query.createdBy as string) : undefined;
      const entityType = req.query.entityType as string | undefined;
      const isPublic =
        req.query.isPublic === 'true' ? true : req.query.isPublic === 'false' ? false : undefined;

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
  });

  app.get('/api/saved-views/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid view ID' });
      }

      const view = await storage.getSavedView(id);
      if (!view) {
        return res.status(404).json({ error: 'View not found' });
      }

      res.json(view);
    } catch (error) {
      console.error('Error fetching saved view:', error);
      res.status(500).json({ error: 'Failed to fetch saved view' });
    }
  });

  app.post('/api/saved-views', requireAuthIfEnabled, async (req, res) => {
    try {
      const validatedData = insertSavedViewSchema.parse(req.body);
      const view = await storage.createSavedView(validatedData);
      res.status(201).json(view);
    } catch (error) {
      console.error('Error creating saved view:', error);
      res.status(400).json({ error: 'Failed to create saved view' });
    }
  });

  app.put('/api/saved-views/:id', requireAuthIfEnabled, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid view ID' });
      }

      const validatedData = updateSavedViewSchema.parse(req.body);
      const view = await storage.updateSavedView(id, validatedData);
      if (!view) {
        return res.status(404).json({ error: 'View not found' });
      }

      res.json(view);
    } catch (error) {
      console.error('Error updating saved view:', error);
      res.status(400).json({ error: 'Failed to update saved view' });
    }
  });

  app.delete('/api/saved-views/:id', requireAuthIfEnabled, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid view ID' });
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

  app.post('/api/saved-views/:id/set-default', requireAuthIfEnabled, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid view ID' });
      }

      const { teamId, entityType } = req.body;
      if (!teamId || !entityType) {
        return res.status(400).json({ error: 'teamId and entityType are required' });
      }

      await storage.setDefaultView(id, teamId, entityType);
      res.json({ success: true });
    } catch (error) {
      console.error('Error setting default view:', error);
      res.status(500).json({ error: 'Failed to set default view' });
    }
  });

  return { httpServer, io };
}
