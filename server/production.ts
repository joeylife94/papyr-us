import express from "express";
import { validateEnv } from "./env";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { 
  log, 
  setupBasicMiddleware, 
  setupLoggingMiddleware, 
  setupErrorHandler, 
  getServerConfig,
  storage
} from "./middleware";

const app = express();

// Validate environment before starting
validateEnv();

// Setup basic middleware
setupBasicMiddleware(app);
setupLoggingMiddleware(app);

(async () => {
  const { httpServer } = await registerRoutes(app, storage);

  // Setup error handler after routes
  setupErrorHandler(app);

  // Production mode: only serve static files
  serveStatic(app);

  // Start server
  const { port } = getServerConfig();
  httpServer.listen(port, () => {
    log(`serving on port ${port}`);
  });
})(); 