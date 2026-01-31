import winston from 'winston';
import path from 'path';
import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';

// ==================== Request Context Storage ====================
// AsyncLocalStorage for request-scoped context (request ID, user info)
interface RequestContext {
  requestId: string;
  userId?: string | number;
  userEmail?: string;
  method?: string;
  path?: string;
}

const requestContext = new AsyncLocalStorage<RequestContext>();

/**
 * Get current request context (if any)
 */
export function getRequestContext(): RequestContext | undefined {
  return requestContext.getStore();
}

/**
 * Middleware to inject request ID and context
 */
export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Use existing request ID from header or generate new one
  const requestId = (req.headers['x-request-id'] as string) || randomUUID();
  
  // Set response header so client can correlate
  res.setHeader('X-Request-ID', requestId);

  // Extract user info if available
  const user = (req as any).user;

  const context: RequestContext = {
    requestId,
    userId: user?.id,
    userEmail: user?.email,
    method: req.method,
    path: req.path,
  };

  // Run remaining middleware within this context
  requestContext.run(context, () => {
    next();
  });
}

// ==================== Log Levels & Colors ====================
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

winston.addColors(colors);

// ==================== Log Level Configuration ====================
const level = () => {
  const env = process.env.NODE_ENV || 'development';
  // Allow explicit override via LOG_LEVEL env var
  if (process.env.LOG_LEVEL) {
    return process.env.LOG_LEVEL;
  }
  return env === 'development' ? 'debug' : 'info';
};

// ==================== Log Formats ====================

/**
 * Custom format that injects request context
 */
const injectContext = winston.format((info) => {
  const ctx = getRequestContext();
  if (ctx) {
    info.requestId = ctx.requestId;
    if (ctx.userId) info.userId = ctx.userId;
    if (ctx.userEmail) info.userEmail = ctx.userEmail;
  }
  return info;
});

/**
 * JSON format for production (Loki/CloudWatch/ELK compatible)
 * Follows structured logging best practices
 */
const jsonFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.sssZ' }), // ISO 8601
  winston.format.errors({ stack: true }),
  injectContext(),
  winston.format.json()
);

/**
 * Human-readable format for development console
 */
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  injectContext(),
  winston.format.printf((info) => {
    const { timestamp, level, message, requestId, userId, ...meta } = info;
    
    // Build prefix with request/user context
    let prefix = '';
    if (requestId) prefix += `[${(requestId as string).slice(0, 8)}]`;
    if (userId) prefix += `[u:${userId}]`;
    
    // Format meta data
    const metaStr = Object.keys(meta).length 
      ? ` ${JSON.stringify(meta)}` 
      : '';
    
    return `${timestamp} ${prefix} ${level}: ${message}${metaStr}`;
  })
);

// ==================== Transports ====================
const isProduction = process.env.NODE_ENV === 'production';
const logsDir = process.env.LOG_DIR || 'logs';

const transports: winston.transport[] = [
  // Console transport - always enabled
  new winston.transports.Console({
    format: isProduction ? jsonFormat : consoleFormat,
  }),
];

// File transports - only in non-test environments
if (process.env.NODE_ENV !== 'test') {
  transports.push(
    // Error log file
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: jsonFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 10,
      tailable: true,
    }),
    // Combined log file
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      format: jsonFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 10,
      tailable: true,
    }),
    // HTTP access log file
    new winston.transports.File({
      filename: path.join(logsDir, 'access.log'),
      level: 'http',
      format: jsonFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true,
    })
  );
}

// ==================== Create Logger ====================
const logger = winston.createLogger({
  level: level(),
  levels,
  defaultMeta: {
    service: 'papyrus',
    version: process.env.npm_package_version || '1.0.0',
  },
  transports,
  exitOnError: false,
});

// ==================== Morgan Stream ====================
export const stream = {
  write: (message: string) => {
    logger.http(message.trim());
  },
};

// ==================== Helper Functions ====================

/**
 * Log with additional structured context
 */
export function logWithContext(
  level: 'error' | 'warn' | 'info' | 'http' | 'debug',
  message: string,
  context: Record<string, any> = {}
): void {
  logger.log(level, message, context);
}

/**
 * Timed operation logger - logs duration automatically
 */
export function timedLog(operation: string, level: 'info' | 'debug' = 'info') {
  const start = Date.now();
  return (result?: string, extra?: Record<string, any>) => {
    const duration = Date.now() - start;
    logger.log(level, `${operation} ${result || 'completed'}`, {
      operation,
      durationMs: duration,
      ...extra,
    });
  };
}

/**
 * Create a child logger with preset context
 */
export function createChildLogger(context: Record<string, any>): winston.Logger {
  return logger.child(context);
}

export default logger;
