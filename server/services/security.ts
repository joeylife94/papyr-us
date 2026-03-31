/**
 * Security Headers Service
 *
 * Enhanced security headers configuration:
 * - Content Security Policy (CSP)
 * - CORS configuration
 * - Additional security headers
 */

import type { Request, Response, NextFunction, Express } from 'express';
import helmet from 'helmet';
import { config } from '../config.js';
import logger from './logger.js';

// CSP Directives configuration
const cspDirectives = {
  defaultSrc: ["'self'"],

  scriptSrc: [
    "'self'",
    "'unsafe-inline'", // Required for some React features - consider removing in strict mode
    ...(config.isProduction ? [] : ["'unsafe-eval'"]), // Only for dev tools - never in production
    'https://cdn.jsdelivr.net', // For external libraries if needed
  ],

  styleSrc: [
    "'self'",
    "'unsafe-inline'", // Required for styled-components/emotion/inline styles
    'https://fonts.googleapis.com',
  ],

  fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],

  imgSrc: [
    "'self'",
    'data:',
    'blob:',
    'https:', // Allow images from HTTPS sources
  ],

  connectSrc: [
    "'self'",
    'wss:', // WebSocket connections
    'ws:', // WebSocket connections (dev)
    // Add Sentry DSN domain if configured
    ...(process.env.SENTRY_DSN ? [new URL(process.env.SENTRY_DSN).origin] : []),
  ],

  frameSrc: ["'none'"], // Disallow embedding in iframes by default

  objectSrc: ["'none'"], // Disallow plugins

  baseUri: ["'self'"],

  formAction: ["'self'"],

  frameAncestors: ["'none'"], // Prevent clickjacking

  upgradeInsecureRequests: config.isProduction ? [] : null, // Only in production
};

// Production-specific stricter CSP
const productionCspDirectives = {
  ...cspDirectives,
  scriptSrc: [
    "'self'",
    // Remove unsafe-inline and unsafe-eval in production
    // Use nonces or hashes instead
  ],
};

/**
 * Get CSP directives based on environment
 */
function getCspDirectives(): typeof cspDirectives {
  if (config.isProduction) {
    // In production, use stricter CSP but keep unsafe-inline for now
    // TODO: Implement nonce-based CSP for scripts
    return {
      ...cspDirectives,
      scriptSrc: [
        "'self'",
        "'unsafe-inline'", // Keep for now, plan to remove
      ],
    };
  }
  return cspDirectives;
}

/**
 * Setup comprehensive security headers
 */
export function setupSecurityHeaders(app: Express): void {
  // Use Helmet with custom configuration
  app.use(
    helmet({
      // Content Security Policy
      contentSecurityPolicy: {
        directives: getCspDirectives(),
        reportOnly: !config.isProduction, // Report-only in development
      },

      // Cross-Origin policies
      crossOriginEmbedderPolicy: false, // Can break external resources
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
      crossOriginResourcePolicy: { policy: 'cross-origin' },

      // DNS Prefetch Control
      dnsPrefetchControl: { allow: true },

      // Expect-CT (Certificate Transparency)
      // expectCt removed in newer Helmet versions

      // Frameguard (X-Frame-Options)
      frameguard: { action: 'deny' },

      // Hide X-Powered-By
      hidePoweredBy: true,

      // HSTS (HTTP Strict Transport Security)
      hsts: config.isProduction
        ? {
            maxAge: 31536000, // 1 year
            includeSubDomains: true,
            preload: true,
          }
        : false,

      // IE No Open
      ieNoOpen: true,

      // No Sniff (X-Content-Type-Options)
      noSniff: true,

      // Origin Agent Cluster
      originAgentCluster: true,

      // Permitted Cross-Domain Policies
      permittedCrossDomainPolicies: { permittedPolicies: 'none' },

      // Referrer Policy
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },

      // X-XSS-Protection (legacy, but still useful)
      xssFilter: true,
    })
  );

  // Additional custom headers
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Permissions Policy (formerly Feature Policy)
    res.setHeader(
      'Permissions-Policy',
      [
        'accelerometer=()',
        'camera=()',
        'geolocation=()',
        'gyroscope=()',
        'magnetometer=()',
        'microphone=()',
        'payment=()',
        'usb=()',
      ].join(', ')
    );

    // Cache-Control for HTML
    if (req.path === '/' || req.path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }

    next();
  });

  logger.info('Security headers configured', {
    cspMode: config.isProduction ? 'enforce' : 'report-only',
    hstsEnabled: config.isProduction,
  });
}

/**
 * Enhanced CORS configuration
 *
 * Security policy:
 *   Production:     only explicitly listed origins (CORS_ALLOWED_ORIGINS) are allowed.
 *                   When the list is empty ALL cross-origin requests are blocked (fail-closed).
 *   Non-production: only explicitly listed origins unless LOCAL_DEV_UNSAFE_CORS=true is set.
 *                   LOCAL_DEV_UNSAFE_CORS=true is an explicit, narrow escape hatch for local
 *                   development tooling (e.g. Vite HMR on a different port). It MUST NOT be
 *                   set in staging or CI environments.
 */
export function setupEnhancedCors(app: Express): void {
  const allowedOrigins = config.corsAllowedOrigins;
  // Dangerous relaxation flag — only meaningful (and only logged as a warning) outside production.
  const localDevUnsafeCors = !config.isProduction && process.env.LOCAL_DEV_UNSAFE_CORS === 'true';

  if (localDevUnsafeCors) {
    logger.warn(
      '[Security] LOCAL_DEV_UNSAFE_CORS=true: permissive CORS active. ' +
        'Do NOT set this in staging or CI.'
    );
  }

  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;

    if (!config.isProduction) {
      if (localDevUnsafeCors) {
        // Explicit local-dev opt-in: echo request origin (or fall back to no ACAO header)
        if (origin) {
          res.setHeader('Access-Control-Allow-Origin', origin);
          res.setHeader('Access-Control-Allow-Credentials', 'true');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
          res.setHeader(
            'Access-Control-Allow-Headers',
            'Content-Type, Authorization, X-Request-ID, X-Admin-Password'
          );
          res.setHeader('Access-Control-Max-Age', '86400');
        }
      } else if (origin && allowedOrigins.length > 0 && allowedOrigins.includes(origin)) {
        // Non-prod with explicit allowlist
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', String(config.corsAllowCredentials));
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        res.setHeader(
          'Access-Control-Allow-Headers',
          'Content-Type, Authorization, X-Request-ID, X-Admin-Password'
        );
        res.setHeader('Access-Control-Max-Age', '86400');
      }
      // Otherwise: no CORS headers → browser blocks cross-origin requests (safe default)

      if (req.method === 'OPTIONS') {
        return res.status(204).end();
      }
      return next();
    }

    // Production: ONLY explicitly listed origins. Empty list = deny all cross-origin.
    if (origin && allowedOrigins.length > 0 && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', String(config.corsAllowCredentials));
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-ID');
      res.setHeader('Access-Control-Max-Age', '86400');
    }
    // No else: unrecognised origins get no CORS headers → browser blocks the request.

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    next();
  });

  logger.info('Enhanced CORS configured', {
    mode: config.isProduction ? 'production' : localDevUnsafeCors ? 'local-dev-unsafe' : 'strict',
    allowedOrigins: allowedOrigins.length > 0 ? allowedOrigins : '(none — same-origin only)',
    credentials: config.corsAllowCredentials,
  });
}

/**
 * Request sanitization middleware
 */
export function sanitizeRequest(req: Request, res: Response, next: NextFunction): void {
  // Remove potentially dangerous headers
  delete req.headers['x-forwarded-host'];

  // Limit request body size is already handled by express.json()

  // Validate content type for POST/PUT/PATCH
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const contentType = req.headers['content-type'];
    if (
      contentType &&
      !contentType.includes('application/json') &&
      !contentType.includes('multipart/form-data') &&
      !contentType.includes('application/x-www-form-urlencoded')
    ) {
      // Allow but log unusual content types
      logger.warn('Unusual content type', {
        contentType,
        path: req.path,
        method: req.method,
      });
    }
  }

  next();
}

/**
 * Security event logging
 */
export function logSecurityEvent(event: {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: Record<string, any>;
  req?: Request;
}): void {
  const logData = {
    securityEvent: event.type,
    severity: event.severity,
    ...event.details,
    ip: event.req?.ip,
    path: event.req?.path,
    userAgent: event.req?.get('User-Agent'),
  };

  if (event.severity === 'critical' || event.severity === 'high') {
    logger.error('Security event', logData);
  } else if (event.severity === 'medium') {
    logger.warn('Security event', logData);
  } else {
    logger.info('Security event', logData);
  }
}
