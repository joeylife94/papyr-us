import express, { type Express, type Request, Response, NextFunction } from "express";

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

export function setupBasicMiddleware(app: Express) {
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
}

export function setupLoggingMiddleware(app: Express) {
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
      if (path.startsWith("/papyr-us/api")) {
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
}

interface ErrorWithStatus extends Error {
  status?: number;
  statusCode?: number;
}

export function setupErrorHandler(app: Express) {
  app.use((err: ErrorWithStatus, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
  });
}

import { config } from "./config.ts";

export function getServerConfig() {
  const port = config.port;
  const isReplit = config.isReplit;
  const isProduction = config.isProduction;
  const host = config.host;
  
  return { port, host, isProduction, isReplit };
} 