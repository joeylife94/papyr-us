/**
 * Sentry Error Tracking & Performance Monitoring Service
 * 
 * Integrates Sentry SDK v10+ for:
 * - Error tracking with context
 * - Performance monitoring
 * - Profiling
 * 
 * @see https://docs.sentry.io/platforms/javascript/guides/node/
 */

import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { config } from '../config.js';
import logger from './logger.js';

// Track initialization status
let isInitialized = false;

/**
 * Initialize Sentry SDK
 * Must be called before any other Sentry functions
 */
export function initSentry(): void {
  const dsn = config.sentryDsn;

  if (!dsn) {
    logger.info('Sentry DSN not configured - error tracking disabled');
    return;
  }

  if (isInitialized) {
    logger.warn('Sentry already initialized');
    return;
  }

  try {
    Sentry.init({
      dsn,
      environment: config.sentryEnvironment,
      release: process.env.npm_package_version || '1.0.0',

      // Performance monitoring
      tracesSampleRate: config.sentryTracesSampleRate,

      // Profiling
      profilesSampleRate: config.isProduction ? 0.1 : 1.0,

      integrations: [
        nodeProfilingIntegration(),
      ],

      // Filter out sensitive data
      beforeSend(event) {
        // Remove sensitive headers
        if (event.request?.headers) {
          delete event.request.headers['authorization'];
          delete event.request.headers['cookie'];
          delete event.request.headers['x-admin-password'];
        }

        // Remove sensitive data from request body
        if (event.request?.data) {
          try {
            const data =
              typeof event.request.data === 'string'
                ? JSON.parse(event.request.data)
                : event.request.data;

            if (data && typeof data === 'object') {
              const sensitiveKeys = ['password', 'token', 'secret', 'apiKey', 'authorization'];
              for (const key of sensitiveKeys) {
                if (key in data) {
                  data[key] = '[REDACTED]';
                }
              }
              event.request.data = JSON.stringify(data);
            }
          } catch {
            // If parsing fails, leave data as is
          }
        }

        return event;
      },

      // Ignore common non-errors
      ignoreErrors: [
        'ResizeObserver loop limit exceeded',
        'Network request failed',
        'Load failed',
        'cancelled',
      ],
    });

    isInitialized = true;
    logger.info('Sentry error tracking initialized', {
      environment: config.sentryEnvironment,
      tracesSampleRate: config.sentryTracesSampleRate,
    });
  } catch (error) {
    logger.error('Failed to initialize Sentry', { error });
  }
}

/**
 * Sentry request handler middleware (v10+ compatible)
 * Sets up request isolation and adds request context to errors
 */
export function sentryRequestHandler() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!isInitialized) {
      return next();
    }

    // Add request context using isolation scope
    Sentry.withIsolationScope((scope) => {
      scope.setExtra('url', req.url);
      scope.setExtra('method', req.method);
      scope.setExtra('query', req.query);

      // Add user context if authenticated
      const user = (req as any).user;
      if (user) {
        scope.setUser({
          id: user.id?.toString(),
          email: user.email,
        });
      }

      next();
    });
  };
}

/**
 * Sentry tracing handler middleware (v10+ compatible)
 * Creates spans for request timing
 */
export function sentryTracingHandler() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!isInitialized) {
      return next();
    }

    // Create a span for this request
    Sentry.startSpan(
      {
        name: `${req.method} ${req.path}`,
        op: 'http.server',
        attributes: {
          'http.method': req.method,
          'http.url': req.url,
        },
      },
      () => {
        next();
      }
    );
  };
}

/**
 * Sentry error handler middleware (v10+ compatible)
 * Must be before any other error handlers
 */
export function sentryErrorHandler(): ErrorRequestHandler {
  return (err: Error, req: Request, res: Response, next: NextFunction): void => {
    if (!isInitialized) {
      return next(err);
    }

    // Determine severity
    const status = (err as any).status || (err as any).statusCode || 500;
    const shouldReport = status >= 500;

    if (shouldReport) {
      Sentry.captureException(err, {
        extra: {
          url: req.url,
          method: req.method,
          statusCode: status,
        },
      });
    }

    next(err);
  };
}

// ==================== Utility Functions ====================

/**
 * Manually capture an exception
 */
export function captureException(error: Error, context?: Record<string, any>): void {
  if (!isInitialized) {
    logger.error('Error (Sentry disabled):', { error: error.message, ...context });
    return;
  }

  Sentry.withScope((scope) => {
    if (context) {
      scope.setExtras(context);
    }
    Sentry.captureException(error);
  });
}

/**
 * Manually capture a message
 */
export function captureMessage(
  message: string,
  level: 'fatal' | 'error' | 'warning' | 'info' | 'debug' = 'info'
): void {
  if (!isInitialized) {
    logger.info('Message (Sentry disabled):', { message, level });
    return;
  }

  Sentry.captureMessage(message, level);
}

/**
 * Set user context for error tracking
 */
export function setUser(user: { id: string | number; email?: string; username?: string }): void {
  if (!isInitialized) return;
  Sentry.setUser({
    id: user.id?.toString(),
    email: user.email,
    username: user.username,
  });
}

/**
 * Clear user context
 */
export function clearUser(): void {
  if (!isInitialized) return;
  Sentry.setUser(null);
}

/**
 * Add breadcrumb for debugging
 */
export function addBreadcrumb(breadcrumb: {
  category?: string;
  message: string;
  level?: 'debug' | 'info' | 'warning' | 'error';
  data?: Record<string, any>;
}): void {
  if (!isInitialized) return;
  Sentry.addBreadcrumb(breadcrumb);
}

/**
 * Create a span for performance tracking
 */
export async function withSpan<T>(
  name: string,
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  if (!isInitialized) {
    return fn();
  }

  return Sentry.startSpan(
    { name, op: operation },
    async () => {
      return fn();
    }
  );
}

export { Sentry };
