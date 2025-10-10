import express, { type Express, type Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config.js';

export function log(message: string, source = 'express') {
  const formattedTime = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
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

    res.on('finish', () => {
      const duration = Date.now() - start;
      if (path.startsWith('/api')) {
        let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
        if (capturedJsonResponse) {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        }

        if (logLine.length > 80) {
          logLine = logLine.slice(0, 79) + '…';
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
    const message = err.message || 'Internal Server Error';

    // Log detailed error server-side for debugging
    console.error('[ERROR HANDLER]', {
      status,
      message: err.message,
      stack: err.stack,
    });

    // In production, do not leak internal error details to clients
    if (process.env.NODE_ENV === 'production') {
      res.status(status).json({ message });
    } else {
      // In non-production environments include basic error info for easier debugging
      res.status(status).json({ message, stack: err.stack });
    }
  });
}

export function getServerConfig() {
  const port = config.port;
  const isReplit = config.isReplit;
  const isProduction = config.isProduction;
  const host = config.host;

  return { port, host, isProduction, isReplit };
}

interface AuthRequest extends Request {
  user?: any;
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

// RBAC: Require admin access middleware
export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  // Try to decode JWT directly if provided (so this middleware can be used standalone)
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const payload = jwt.verify(token, config.jwtSecret) as {
        id?: number;
        email?: string;
        role?: string;
      };
      req.user = payload;
    }
  } catch (_) {
    // ignore token errors here; we'll fall back to password check
  }

  // 1) If authenticated via JWT and role/email matches admin, allow
  const user = req.user as { id?: number; email?: string; role?: string } | undefined;
  if (user) {
    const isRoleAdmin = user.role === 'admin';
    const isEmailAdmin = user.email && config.adminEmails.includes(user.email.toLowerCase());
    if (isRoleAdmin || isEmailAdmin) return next();
  }

  // 2) Backward compatibility: allow if adminPassword provided in header/query/body
  const pwdFromHeader = req.header('x-admin-password');
  const pwdFromQuery = (req.query?.adminPassword as string) || undefined;
  const pwdFromBody = (req.body?.adminPassword as string) || (req.body?.password as string);
  const provided = pwdFromHeader || pwdFromQuery || pwdFromBody;
  if (provided && provided === config.adminPassword) return next();

  return res.status(403).json({ message: 'Forbidden: admin required' });
}

export type { AuthRequest };
