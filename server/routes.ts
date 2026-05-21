import type { Express } from 'express';
import { createServer, type Server as HttpServer } from 'http';
import { Server as SocketIoServer } from 'socket.io';
import { writeAuthGate } from './middleware.js';
import { initWorkflowService } from './services/workflow.js';
import logger from './services/logger.js';
import passport from 'passport';
import { DBStorage } from './storage.js';
import { featureFlags } from './features.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerPagesRoutes } from './routes/pages.js';
import { registerCalendarRoutes } from './routes/calendar.js';
import { registerCommentsRoutes } from './routes/comments.js';
import { registerPermissionsRoutes } from './routes/permissions.js';
import { registerUploadsRoutes } from './routes/uploads.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerDashboardRoutes } from './routes/dashboard.js';
import { registerTasksRoutes } from './routes/tasks.js';
import { registerTeamNotificationsRoutes } from './routes/team-notifications.js';
import { registerTemplatesRoutes } from './routes/templates.js';
import { registerTeamsRoutes } from './routes/teams.js';
import { registerMembersRoutes } from './routes/members.js';
import { registerAIRoutes } from './routes/ai.js';
import { registerWorkflowsRoutes } from './routes/workflows.js';
import { registerSavedViewsRoutes } from './routes/saved-views.js';
import { registerDatabaseRoutes } from './routes/database.js';
import { registerAnalyticsRoutes } from './routes/analytics.js';

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

  // Register domain-specific route handlers
  registerAuthRoutes(app, storage);
  registerPagesRoutes(app, storage);
  registerCalendarRoutes(app, storage);
  registerCommentsRoutes(app, storage);
  registerPermissionsRoutes(app, storage);
  registerUploadsRoutes(app, storage);
  registerAdminRoutes(app, storage);
  registerDashboardRoutes(app, storage);
  registerTasksRoutes(app, storage);
  registerTeamNotificationsRoutes(app, storage, io);
  registerTemplatesRoutes(app, storage);
  registerTeamsRoutes(app, storage);
  registerMembersRoutes(app, storage);
  registerAIRoutes(app, storage);
  registerWorkflowsRoutes(app, storage);
  registerSavedViewsRoutes(app, storage);
  registerDatabaseRoutes(app, storage);
  registerAnalyticsRoutes(app, storage);

  return { httpServer, io };
}
