import express, { type Express, type Request, Response, NextFunction } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import helmet from 'helmet';

const SENSITIVE_KEYS = new Set([
  'token',
  'accessToken',
  'refreshToken',
  'password',
  'hashedPassword',
  'secret',
  'authorization',
]);

function maskSensitiveData(obj: Record<string, any>): Record<string, any> {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const masked: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key)) {
      masked[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      masked[key] = maskSensitiveData(value);
    } else {
      masked[key] = value;
    }
  }
  return masked;
}

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
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(cookieParser());
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
          logLine += ` :: ${JSON.stringify(maskSensitiveData(capturedJsonResponse))}`;
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

function extractBearerToken(authorizationHeader: string | undefined): string | undefined {
  if (!authorizationHeader?.startsWith('Bearer ')) return undefined;
  return authorizationHeader.slice('Bearer '.length).trim() || undefined;
}

/**
 * Extract the JWT access token from the incoming request.
 *
 * Priority order (cookie-first):
 *  1. HttpOnly `accessToken` cookie — set by the SSO callback and the
 *     local login route.  Preferred: never visible to JavaScript or URL logs.
 *  2. `Authorization: Bearer <token>` header — retained for programmatic
 *     API clients (CI scripts, integrations) that cannot use cookies.
 *
 * Tokens must NEVER travel via URL query parameters; this function
 * intentionally does not read from `req.query`.
 */
function getRequestToken(req: AuthRequest): string | undefined {
  return (req as any).cookies?.accessToken || extractBearerToken(req.headers.authorization);
}

function verifyRequestToken(req: AuthRequest): any {
  const token = getRequestToken(req);
  if (!token) return null;
  return jwt.verify(token, config.jwtSecret);
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const token = getRequestToken(req);

  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const payload = verifyRequestToken(req);
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

// Optional auth: extracts user from JWT if present, but doesn't require it
export function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  const token = getRequestToken(req);
  if (token) {
    try {
      const payload = verifyRequestToken(req);
      req.user = payload;
    } catch {
      // Invalid token — proceed without user
    }
  }
  next();
}

/**
 * Verify user belongs to the team referenced in the request.
 * Extracts teamId from params.teamId, query.teamId, or body.teamId.
 *
 * Behaviour matrix:
 * ┌──────────────┬──────────┬──────────────────────────────────────────────┐
 * │ enforceAuth  │ user     │ teamId in request                           │
 * ├──────────────┼──────────┼──────────────────────────────────────────────┤
 * │ true         │ absent   │ any        → 401                            │
 * │ true         │ present  │ present    → verify membership              │
 * │ true         │ present  │ absent     → attach userTeamIds, next()     │
 * │ false (dev)  │ absent   │ any        → next()                         │
 * │ false (dev)  │ present  │ present    → verify membership              │
 * │ false (dev)  │ present  │ absent     → attach userTeamIds, next()     │
 * └──────────────┴──────────┴──────────────────────────────────────────────┘
 *
 * When teamId is absent and user is authenticated, `req.userTeamIds` is
 * attached so that downstream handlers can scope queries to the user's teams.
 */
export function requireTeamMembership(req: AuthRequest, res: Response, next: NextFunction) {
  // Dev mode without user — attach empty teamIds and continue
  if (!config.enforceAuthForWrites && (!req.user || !req.user.id)) {
    (req as any).userTeamIds = [];
    return next();
  }

  // Auth enforced but no user — reject
  if (!req.user || !req.user.id) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  const teamIdRaw = req.params.teamId || (req.query.teamId as string) || req.body?.teamId;

  (async () => {
    try {
      const storage = req.app.locals.storage || (await import('./storage.js')).getStorage();
      const userTeamIds = await storage.getUserTeamIds(req.user!.id);

      // Attach for downstream handlers to use for scoping
      (req as any).userTeamIds = userTeamIds;

      if (!teamIdRaw) {
        // No specific team requested — handler must scope using req.userTeamIds
        return next();
      }

      let teamId: number;
      if (!isNaN(parseInt(String(teamIdRaw)))) {
        teamId = parseInt(String(teamIdRaw));
      } else {
        const team = await storage.getTeamByName(String(teamIdRaw));
        if (!team) {
          return res.status(404).json({ message: 'Team not found' });
        }
        teamId = team.id;
      }

      if (!userTeamIds.includes(teamId)) {
        return res.status(403).json({ message: 'You are not a member of this team' });
      }

      next();
    } catch (error) {
      return res.status(500).json({ message: 'Team membership check failed' });
    }
  })();
}

// RBAC: Require admin access middleware
export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  // Try to decode JWT directly if provided (so this middleware can be used standalone)
  try {
    const payload = verifyRequestToken(req) as {
      id?: number;
      email?: string;
      role?: string;
    } | null;
    if (payload) {
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

  // 2) Backward compatibility (optional): allow if adminPassword provided
  if (config.allowAdminPassword) {
    const pwdFromHeader = req.header('x-admin-password');
    const pwdFromQuery = (req.query?.adminPassword as string) || undefined;
    const pwdFromBody = (req.body?.adminPassword as string) || (req.body?.password as string);
    const provided = pwdFromHeader || pwdFromQuery || pwdFromBody;
    if (provided && provided === config.adminPassword) return next();
  }

  log(`Denied admin access: method=${req.method} path=${req.path} ip=${req.ip}`, 'rbac');
  return res.status(403).json({ message: 'Forbidden: admin required' });
}

export type { AuthRequest };

// Optional global write guard: when enabled via ENFORCE_AUTH_WRITES, require JWT for write methods
export function writeAuthGate(req: AuthRequest, res: Response, next: NextFunction) {
  if (!config.enforceAuthForWrites) return next();
  const isWrite =
    req.method === 'POST' ||
    req.method === 'PUT' ||
    req.method === 'PATCH' ||
    req.method === 'DELETE';
  if (!isWrite) return next();
  const path = req.path || '';
  // Allow auth endpoints and leave admin endpoints to requireAdmin
  if (path.startsWith('/api/auth') || path.startsWith('/api/admin')) return next();

  return authMiddleware(req, res, next);
}

export function buildRateLimiter(opts?: { windowMs?: number; max?: number }) {
  return rateLimit({
    windowMs: opts?.windowMs ?? config.rateLimitWindowMs,
    max: opts?.max ?? config.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      if (!config.rateLimitEnabled) return true;
      // Admin IP whitelist skip
      const ip = req.ip || '';
      if (config.adminIpWhitelist.some((w) => ip.includes(w))) return true;
      return false;
    },
    keyGenerator: (req) => {
      // Prefer user id/email from JWT, fallback to IP
      try {
        const token = getRequestToken(req as AuthRequest);
        if (token) {
          const payload: any = jwt.decode(token);
          if (payload?.id || payload?.email) {
            return `${payload.id || ''}|${payload.email || ''}`;
          }
        }
      } catch {}
      return req.ip || 'unknown';
    },
  });
}

export function setupSecurity(app: Express) {
  // Apply basic security synchronously first, so requests are always protected
  setupBasicSecurity(app);

  // Then try to upgrade to enhanced security (non-blocking)
  import('./services/security.js')
    .then(({ setupSecurityHeaders, setupEnhancedCors, sanitizeRequest }) => {
      app.use(sanitizeRequest);
      setupSecurityHeaders(app);
      setupEnhancedCors(app);
    })
    .catch(() => {
      // Enhanced security not available — basic already applied above
    });
}

function setupBasicSecurity(app: Express) {
  // Helmet-like secure headers via small set
  app.use(
    helmet({
      contentSecurityPolicy: false, // keep simple for now
      crossOriginEmbedderPolicy: false,
    })
  );

  const allowed = config.corsAllowedOrigins;
  if (allowed.length > 0) {
    app.use(
      cors({
        origin: allowed,
        credentials: config.corsAllowCredentials,
      })
    );
  } else {
    // Default: allow same-origin fetches; for dev, most tooling uses same origin
    app.use(
      cors({
        origin: false,
      })
    );
  }
}

// Per-endpoint helper: require JWT only when ENFORCE_AUTH_WRITES is enabled
export function requireAuthIfEnabled(req: AuthRequest, res: Response, next: NextFunction) {
  if (!config.enforceAuthForWrites) return next();
  return authMiddleware(req, res, next);
}

// Team role-based authorization middleware
// Verifies user has one of the required roles (owner/admin/member) in the team.
// Role hierarchy: owner > admin > member
export function requireTeamRole(requiredRoles: Array<'owner' | 'admin' | 'member'>) {
  const roleHierarchy: Record<string, number> = { member: 1, admin: 2, owner: 3 };

  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      // In dev mode without auth enforcement, skip
      if (!config.enforceAuthForWrites && (!req.user || !req.user.id)) {
        return next();
      }

      // Ensure user is authenticated
      if (!req.user || !req.user.id) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      // Get teamId from params, query, or body
      const teamIdRaw = req.params.teamId || req.query.teamId || req.body?.teamId;
      if (!teamIdRaw) {
        // No teamId in request — skip team check (non-team resource)
        return next();
      }

      const storage = req.app.locals.storage || (await import('./storage.js')).getStorage();

      // Resolve teamId (could be a name or numeric ID)
      let teamId: number;
      if (!isNaN(parseInt(String(teamIdRaw)))) {
        teamId = parseInt(String(teamIdRaw));
      } else {
        const team = await storage.getTeamByName(String(teamIdRaw));
        if (!team) {
          return res.status(404).json({ message: 'Team not found' });
        }
        teamId = team.id;
      }

      // Get user's actual role in this team
      const userRole = await storage.getUserTeamRole(req.user.id, teamId);
      if (!userRole) {
        return res.status(403).json({ message: 'You are not a member of this team' });
      }

      // Check if user's role satisfies any of the required roles
      const userLevel = roleHierarchy[userRole] || 0;
      const minRequired = Math.min(...requiredRoles.map((r) => roleHierarchy[r] || 0));
      if (userLevel < minRequired) {
        return res
          .status(403)
          .json({ message: `Insufficient role: requires ${requiredRoles.join(' or ')}` });
      }

      // Attach team role to request for downstream handlers
      req.user.teamRole = userRole;
      next();
    } catch (error) {
      return res.status(500).json({ message: 'Authorization check failed' });
    }
  };
}

// Page permission middleware - requires specific permission level for a page
// Supports both ID-based (:id, :pageId) and slug-based (:slug) routes
export function requirePagePermission(
  requiredPermission: 'owner' | 'editor' | 'viewer' | 'commenter'
) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const storage = req.app.locals.storage || (await import('./storage.js')).getStorage();

      // Resolve page ID — from params (:id/:pageId) or by looking up :slug
      let pageId = parseInt(req.params.id || req.params.pageId);
      if (!pageId || isNaN(pageId)) {
        // Try slug-based lookup
        const slug = req.params.slug;
        if (slug) {
          const page = await storage.getWikiPageBySlug(slug);
          if (!page) {
            return res.status(404).json({ message: 'Page not found' });
          }
          pageId = page.id;
          // Store resolved page on request so handler can reuse it
          (req as any)._resolvedPage = page;
        } else {
          return res.status(400).json({ message: 'Invalid page ID' });
        }
      }

      // Get user ID from JWT (if authenticated)
      const userId = req.user?.id;

      // Check permission
      const hasPermission = await storage.checkPagePermission(userId, pageId, requiredPermission);

      if (!hasPermission) {
        if (!userId) {
          return res.status(401).json({ message: 'Authentication required to access this page' });
        }
        return res
          .status(403)
          .json({ message: `Insufficient permissions: ${requiredPermission} required` });
      }

      // Store permission in request for later use
      req.user = {
        ...req.user,
        pagePermission: requiredPermission,
      };

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({ message: 'Permission check failed' });
    }
  };
}

// Optional page permission check - continues even if user doesn't have permission
// Useful for pages that can be public but need to check permission level
export function checkPagePermission() {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const storage = req.app.locals.storage || (await import('./storage.js')).getStorage();

      const pageId = parseInt(req.params.id || req.params.pageId);
      if (!pageId || isNaN(pageId)) {
        return next();
      }

      const userId = req.user?.id;

      // Get user's permission level (if any)
      const userPermission = await storage.getUserPagePermission(userId, pageId);

      // Store permission in request
      req.user = {
        ...req.user,
        pagePermission: userPermission,
      };

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      next(); // Continue anyway for optional checks
    }
  };
}
