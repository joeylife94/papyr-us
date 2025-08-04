import express from "express";
import { registerRoutes } from "./routes.ts";
import { serveStatic } from "./static.ts";
import { 
  log, 
  setupBasicMiddleware, 
  setupLoggingMiddleware, 
  setupErrorHandler, 
  getServerConfig 
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

  const server = await registerRoutes(app);

  // Setup error handler after routes
  setupErrorHandler(app);

  // Setup development or production serving
  const { isProduction } = getServerConfig();
  if (isProduction) {
    serveStatic(app);
  } else {
    await setupDevelopmentServer(app, server);
  }

  // Start server
  const { port, host, isReplit } = getServerConfig();
  server.listen(port, host, () => {
    log(`serving on ${host}:${port}`);
    if (!isProduction && !isReplit) {
      log(`Local development server: http://localhost:${port}`);
    }
  });
})();
