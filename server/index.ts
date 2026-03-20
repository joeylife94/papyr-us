import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
const envPath = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
dotenv.config({ path: path.resolve(process.cwd(), envPath) });

// Initialize Sentry BEFORE other imports (captures errors during initialization)
import {
  initSentry,
  sentryRequestHandler,
  sentryTracingHandler,
  sentryErrorHandler,
} from './services/sentry.js';
initSentry();

import express from 'express';
import { registerRoutes } from './routes.js';
import { serveStaticAssets, serveIndex } from './static.js';
import {
  log,
  setupBasicMiddleware,
  setupLoggingMiddleware,
  setupErrorHandler,
  getServerConfig,
  setupSecurity,
} from './middleware.js';
import { DBStorage } from './storage.js';
import { metricsMiddleware, setupMetrics } from './services/metrics.js';
import { requestContextMiddleware } from './services/logger.js';

const app = express();

let storage: DBStorage;
try {
  storage = new DBStorage();
} catch (err) {
  const msg = (err as Error).message;
  console.error('[FATAL] Failed to initialise DBStorage:', msg);
  if (msg.includes('DATABASE_URL')) {
    console.error('');
    console.error('  Hint: Copy .env.example to .env and configure DATABASE_URL.');
    console.error('  See docs/development-setup.md or README.md for setup instructions.');
  }
  process.exit(1);
}

// Sentry request handlers MUST come first (before other middleware)
app.use(sentryRequestHandler());
app.use(sentryTracingHandler());

// Request context (request ID) middleware - enables request tracing
app.use(requestContextMiddleware);

// Prometheus metrics middleware
app.use(metricsMiddleware);

// Setup metrics endpoint (/metrics)
setupMetrics(app);

// Setup basic middleware
setupBasicMiddleware(app);
setupLoggingMiddleware(app);
setupSecurity(app);

(async () => {
  serveStaticAssets(app);
  const { httpServer } = await registerRoutes(app, storage);

  // Sentry error handler MUST come after routes and before any other error handler
  app.use(sentryErrorHandler());

  // Setup custom error handler after Sentry error handler
  setupErrorHandler(app);

  const { isProduction } = getServerConfig();
  if (isProduction) {
    serveIndex(app);
  } else {
    try {
      const { setupVite } = await import('./vite.js');
      await setupVite(app, httpServer);
    } catch (error) {
      console.warn('Vite setup failed, falling back to static files:', error);
      serveIndex(app);
    }
  }

  const { port, host } = getServerConfig();

  // Handle common server errors (e.g. EADDRINUSE) with a clear message
  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      log(
        `[FATAL] Port ${port} is already in use. Stop the other process or change PORT.`,
        'error'
      );
    } else {
      log(`[FATAL] Server error: ${err.message}`, 'error');
    }
    process.exit(1);
  });

  httpServer.listen(port, host, () => {
    log(`Server listening on ${host}:${port}`);
  });

  // Graceful shutdown logic
  const shutdown = (signal: string) => {
    log(`[SHUTDOWN] Received ${signal}. Shutting down gracefully...`);
    // Force exit after 10 seconds if graceful close hangs (e.g. WebSocket connections)
    const forceTimer = setTimeout(() => {
      log('[SHUTDOWN] Forced exit after timeout.', 'error');
      process.exit(1);
    }, 10_000);
    forceTimer.unref(); // Don't keep process alive just for this timer

    httpServer.close(async () => {
      log('[SHUTDOWN] HTTP server closed.');
      try {
        await storage.pool.end();
        log('[SHUTDOWN] Database pool closed.');
        process.exit(0);
      } catch (err) {
        log(`[SHUTDOWN] Error closing database pool: ${(err as Error).message}`, 'error');
        process.exit(1);
      }
    });
  };

  // Allow disabling SIGINT handling in dev/smoke to avoid shared-terminal Ctrl+C side effects
  const ignoreSigint =
    (process.env.IGNORE_SIGINT || '').toLowerCase() === '1' ||
    (process.env.IGNORE_SIGINT || '').toLowerCase() === 'true';
  // In test/dev smokes, prevent CTRL+C or child process exits from taking down the server
  if (!ignoreSigint) {
    process.on('SIGINT', () => shutdown('SIGINT'));
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
})().catch((err) => {
  console.error('[FATAL] Server startup failed:', err);
  process.exit(1);
});

// Global safety nets — prevent the process from crashing on stray errors
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  // In production we should exit; in dev log and keep running for convenience
  if (process.env.NODE_ENV === 'production') process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
  if (process.env.NODE_ENV === 'production') process.exit(1);
});
