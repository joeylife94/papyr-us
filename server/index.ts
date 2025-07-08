import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes.ts";
import { serveStatic } from "./static.ts";

async function setupDevelopmentServer(app: any, server: any) {
  try {
    const { setupVite } = await import("./vite-replit.js");
    await setupVite(app, server);
  } catch (error) {
    console.warn("Vite setup failed, falling back to static files:", error);
    serveStatic(app);
  }
}

function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  // Error handler should be after routes
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // Importantly, only set up Vite in development and after all other routes
  // so the catch-all doesn't interfere.
  // Static file serving should also come after API routes.
  if (process.env.NODE_ENV === "development") {
    await setupDevelopmentServer(app, server);
  } else {
    serveStatic(app);
  }

  // Use PORT from environment variable or default to 5001
  const port = parseInt(process.env.PORT || '5001');
  
  // Determine host binding based on environment
  const isReplit = process.env.REPL_ID !== undefined;
  const isProduction = process.env.NODE_ENV === 'production';
  const host = (isProduction || isReplit) ? '0.0.0.0' : 'localhost';
  
  server.listen(port, host, () => {
    log(`serving on ${host}:${port}`);
    if (!isProduction && !isReplit) {
      log(`Local development server: http://localhost:${port}`);
    }
  });
})();
