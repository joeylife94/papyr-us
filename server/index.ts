import dotenv from 'dotenv';
import path from 'path';

// Load environment variables based on NODE_ENV
const envPath = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
dotenv.config({ path: path.resolve(process.cwd(), envPath) });

import express from "express";
import { registerRoutes } from "./routes.ts";
import { serveStatic } from "./static.ts";
import { 
  log, 
  setupBasicMiddleware, 
  setupLoggingMiddleware, 
  setupErrorHandler, 
  getServerConfig,
  storage
} from "./middleware.ts";

async function setupDevelopmentServer(app: any, server: any) {
  try {
    const { setupVite } = await import("./vite.ts");
    await setupVite(app, server);
  } catch (error) {
    console.warn("Vite setup failed, falling back to static files:", error);
    serveStatic(app);
  }
}

const app = express();

// Setup basic middleware
(async () => {
  // Setup basic middleware
  setupBasicMiddleware(app);
  setupLoggingMiddleware(app);

  const { httpServer, io } = await registerRoutes(app, storage);

  // Setup error handler after routes
  setupErrorHandler(app);

  // Setup development or production serving
  const { isProduction } = getServerConfig();
  if (isProduction) {
    serveStatic(app);
  } else {
    await setupDevelopmentServer(app, httpServer);
  }

  // Start server
  const { port, host, isReplit } = getServerConfig();
  httpServer.listen(port, host, () => {
    log(`serving on ${host}:${port}`);
    if (!isProduction && !isReplit) {
      log(`Local development server: http://localhost:${port}`);
    }
  });

  // Graceful shutdown
  const connections = new Set<import('net').Socket>();
  httpServer.on('connection', (connection) => {
    connections.add(connection);
    connection.on('close', () => {
      connections.delete(connection);
    });
  });

  const shutdown = (signal: string) => {
    log(`[SHUTDOWN] Received ${signal}. Shutting down...`);

    // Force exit after a timeout
    const timeout = setTimeout(() => {
      log('[SHUTDOWN] Shutdown timed out. Forcing exit.', 'error');
      process.exit(1);
    }, 5000);

    // Close the HTTP server, which stops accepting new connections
    httpServer.close(async (err) => {
      clearTimeout(timeout);
      if (err) {
        log(`[SHUTDOWN] Error closing HTTP server: ${err.message}`, 'error');
        process.exit(1);
        return;
      }
      log('[SHUTDOWN] HTTP server closed.');

      // Close the database pool
      try {
        if (storage && 'pool' in storage && (storage as any).pool) {
          await (storage as any).pool.end();
          log('[SHUTDOWN] Database pool closed.');
        }
      } catch (dbError) {
        log(`[SHUTDOWN] Error closing database pool: ${(dbError as Error).message}`, 'error');
      }

      log('[SHUTDOWN] Shutdown complete. Exiting.');
      process.exit(0);
    });

    // Forcibly close any open connections
    log(`[SHUTDOWN] Destroying ${connections.size} open connections...`);
    for (const connection of connections) {
      connection.destroy();
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
})();
