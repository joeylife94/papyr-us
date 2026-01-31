/**
 * Distributed Rate Limiter Service
 * 
 * Redis-backed rate limiting for horizontal scaling:
 * - Sliding window algorithm
 * - Multiple rate limit tiers (API, Auth, Admin)
 * - IP and user-based limiting
 * - Graceful fallback to in-memory when Redis unavailable
 */

import type { Request, Response, NextFunction } from 'express';
import { isRedisEnabled, getRedisClient } from './redis.js';
import { config } from '../config.js';
import logger from './logger.js';

// Rate limit configuration
interface RateLimitConfig {
  windowMs: number;      // Time window in milliseconds
  maxRequests: number;   // Max requests per window
  keyPrefix: string;     // Redis key prefix
  skipFailedRequests?: boolean;
  skipSuccessfulRequests?: boolean;
}

// Predefined rate limit tiers
export const rateLimitTiers = {
  // Standard API rate limit
  api: {
    windowMs: 60 * 1000,      // 1 minute
    maxRequests: 100,
    keyPrefix: 'rl:api:',
  },
  
  // Strict limit for auth endpoints (prevent brute force)
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 10,
    keyPrefix: 'rl:auth:',
  },
  
  // Very strict for password reset
  passwordReset: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 3,
    keyPrefix: 'rl:pwreset:',
  },
  
  // Admin endpoints
  admin: {
    windowMs: 60 * 1000,      // 1 minute
    maxRequests: 30,
    keyPrefix: 'rl:admin:',
  },
  
  // AI/expensive operations
  ai: {
    windowMs: 60 * 1000,      // 1 minute
    maxRequests: 10,
    keyPrefix: 'rl:ai:',
  },
  
  // Upload endpoints
  upload: {
    windowMs: 60 * 1000,      // 1 minute
    maxRequests: 20,
    keyPrefix: 'rl:upload:',
  },
  
  // Search (can be expensive)
  search: {
    windowMs: 60 * 1000,      // 1 minute
    maxRequests: 30,
    keyPrefix: 'rl:search:',
  },
};

// In-memory fallback store
const memoryStore = new Map<string, { count: number; resetAt: number }>();

/**
 * Clean up expired entries from memory store
 */
function cleanupMemoryStore(): void {
  const now = Date.now();
  const entries = Array.from(memoryStore.entries());
  for (const [key, value] of entries) {
    if (value.resetAt < now) {
      memoryStore.delete(key);
    }
  }
}

// Periodic cleanup
setInterval(cleanupMemoryStore, 60 * 1000);

/**
 * Get rate limit key for request
 */
function getRateLimitKey(req: Request, prefix: string): string {
  // Prefer user ID if authenticated
  const userId = (req as any).user?.id;
  if (userId) {
    return `${prefix}user:${userId}`;
  }
  
  // Fall back to IP
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  return `${prefix}ip:${ip}`;
}

/**
 * Check rate limit using Redis (sliding window)
 */
async function checkRedisRateLimit(
  key: string,
  config: RateLimitConfig
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const client = await getRedisClient();
  if (!client) {
    throw new Error('Redis not available');
  }

  const now = Date.now();
  const windowStart = now - config.windowMs;

  // Use Redis sorted set for sliding window
  const multi = client.multi();
  
  // Remove old entries outside window
  multi.zremrangebyscore(key, 0, windowStart);
  
  // Count current entries
  multi.zcard(key);
  
  // Add current request
  multi.zadd(key, now, `${now}-${Math.random()}`);
  
  // Set expiry
  multi.pexpire(key, config.windowMs);
  
  const results = await multi.exec();
  
  // Get count from results (second command)
  const currentCount = (results?.[1]?.[1] as number) || 0;
  
  const allowed = currentCount < config.maxRequests;
  const remaining = Math.max(0, config.maxRequests - currentCount - 1);
  const resetAt = now + config.windowMs;

  return { allowed, remaining, resetAt };
}

/**
 * Check rate limit using in-memory store (fallback)
 */
function checkMemoryRateLimit(
  key: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = memoryStore.get(key);

  if (!entry || entry.resetAt < now) {
    // New window
    memoryStore.set(key, { count: 1, resetAt: now + config.windowMs });
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt: now + config.windowMs,
    };
  }

  // Existing window
  entry.count++;
  const allowed = entry.count <= config.maxRequests;
  const remaining = Math.max(0, config.maxRequests - entry.count);

  return { allowed, remaining, resetAt: entry.resetAt };
}

/**
 * Create rate limiter middleware for specific tier
 */
export function createRateLimiter(tierOrConfig: keyof typeof rateLimitTiers | RateLimitConfig) {
  const limitConfig = typeof tierOrConfig === 'string' 
    ? rateLimitTiers[tierOrConfig] 
    : tierOrConfig;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Skip if rate limiting is disabled
    if (!config.rateLimitEnabled) {
      return next();
    }

    // Skip for whitelisted IPs
    const ip = req.ip || '';
    if (config.adminIpWhitelist.some(w => ip.includes(w))) {
      return next();
    }

    const key = getRateLimitKey(req, limitConfig.keyPrefix);

    try {
      let result: { allowed: boolean; remaining: number; resetAt: number };

      if (isRedisEnabled()) {
        result = await checkRedisRateLimit(key, limitConfig);
      } else {
        result = checkMemoryRateLimit(key, limitConfig);
      }

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', limitConfig.maxRequests);
      res.setHeader('X-RateLimit-Remaining', result.remaining);
      res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));

      if (!result.allowed) {
        res.setHeader('Retry-After', Math.ceil((result.resetAt - Date.now()) / 1000));
        
        logger.warn('Rate limit exceeded', {
          key,
          ip: req.ip,
          path: req.path,
          userId: (req as any).user?.id,
        });

        res.status(429).json({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000),
        });
        return;
      }

      next();
    } catch (error) {
      // On error, fall back to memory store
      logger.error('Rate limiter error, falling back to memory', { error });
      
      const result = checkMemoryRateLimit(key, limitConfig);
      
      if (!result.allowed) {
        res.status(429).json({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded.',
        });
        return;
      }
      
      next();
    }
  };
}

/**
 * Apply rate limiters to specific route patterns
 */
export function applyRateLimiters(app: any): void {
  // Auth endpoints - strict limiting
  app.use('/api/auth/login', createRateLimiter('auth'));
  app.use('/api/auth/register', createRateLimiter('auth'));
  app.use('/api/auth/reset-password', createRateLimiter('passwordReset'));
  
  // Admin endpoints
  app.use('/api/admin', createRateLimiter('admin'));
  
  // AI endpoints - expensive operations
  app.use('/api/ai', createRateLimiter('ai'));
  
  // Search - can be expensive
  app.use('/api/search', createRateLimiter('search'));
  
  // Upload - resource intensive
  app.use('/api/upload', createRateLimiter('upload'));
  
  // General API - default rate limit
  app.use('/api', createRateLimiter('api'));
  
  logger.info('Distributed rate limiters applied');
}

export { RateLimitConfig };
