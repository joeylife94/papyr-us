import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
const envPath = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
dotenv.config({ path: path.resolve(process.cwd(), envPath) });

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

const app = express();
const storage = new DBStorage(); // Create a single storage instance

// Setup basic middleware
setupBasicMiddleware(app);
setupLoggingMiddleware(app);
setupSecurity(app);

(async () => {
  serveStaticAssets(app);
  const { httpServer } = await registerRoutes(app, storage);

  // Setup error handler after routes
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
  httpServer.listen(port, host, () => {
    log(`Server listening on ${host}:${port}`);
  });

  // Graceful shutdown logic
  const shutdown = (signal: string) => {
    log(`[SHUTDOWN] Received ${signal}. Shutting down gracefully...`);
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

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
})();
