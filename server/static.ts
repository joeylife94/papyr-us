import express, { Express } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { log } from './middleware.js';

// ES Module-safe way to get __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// This function should be called BEFORE API routes
export function serveStaticAssets(app: Express) {
  const publicDir = path.join(__dirname, '..', 'public');
  log(`Serving static assets from ${publicDir}`);
  app.use(express.static(publicDir));
}

// This function should be called AFTER API routes
export function serveIndex(app: Express) {
  const publicDir = path.join(__dirname, '..', 'public');
  app.get('*', (req, res, next) => {
    // If the request is not for an API route, serve the index.html
    if (!req.path.startsWith('/api/')) {
      log(`Serving index.html for non-API route: ${req.path}`);
      res.sendFile(path.join(publicDir, 'index.html'));
    } else {
      // Let the next middleware (e.g., 404 handler) take care of it
      next();
    }
  });
}
