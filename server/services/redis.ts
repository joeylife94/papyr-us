/**
 * Redis Client Service
 * 
 * Provides Redis connectivity for:
 * - Session storage (horizontal scaling)
 * - Socket.IO adapter (multi-server sync)
 * - Caching (optional)
 * 
 * @see https://redis.io/
 */

import Redis from 'ioredis';
import { config } from '../config.js';
import logger from './logger.js';

// Redis connection singleton
let redisClient: Redis | null = null;
let subscriberClient: Redis | null = null;

/**
 * Get Redis configuration from environment
 */
function getRedisConfig() {
  const redisUrl = process.env.REDIS_URL;
  
  if (redisUrl) {
    return { url: redisUrl };
  }

  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0'),
    keyPrefix: process.env.REDIS_PREFIX || 'papyrus:',
  };
}

/**
 * Create Redis client with connection handling
 */
function createRedisClient(name: string = 'main'): Redis {
  const redisConfig = getRedisConfig();
  
  const client = redisConfig.url 
    ? new Redis(redisConfig.url)
    : new Redis({
        host: redisConfig.host,
        port: redisConfig.port,
        password: redisConfig.password,
        db: redisConfig.db,
        keyPrefix: redisConfig.keyPrefix,
        retryStrategy: (times) => {
          // Exponential backoff: 100ms, 200ms, 400ms... max 30s
          const delay = Math.min(times * 100, 30000);
          logger.warn(`Redis reconnecting (attempt ${times})...`, { delay });
          return delay;
        },
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: true,
      });

  // Connection event handlers
  client.on('connect', () => {
    logger.info(`Redis [${name}] connecting...`);
  });

  client.on('ready', () => {
    logger.info(`Redis [${name}] connected and ready`);
  });

  client.on('error', (err) => {
    logger.error(`Redis [${name}] error`, { error: err.message });
  });

  client.on('close', () => {
    logger.warn(`Redis [${name}] connection closed`);
  });

  client.on('reconnecting', () => {
    logger.info(`Redis [${name}] reconnecting...`);
  });

  return client;
}

/**
 * Check if Redis is configured/enabled
 */
export function isRedisEnabled(): boolean {
  const enabled = process.env.REDIS_ENABLED?.toLowerCase();
  if (enabled === 'false' || enabled === '0') return false;
  
  // Auto-enable if REDIS_URL is set
  return !!(process.env.REDIS_URL || process.env.REDIS_HOST);
}

/**
 * Get main Redis client (lazy initialization)
 */
export async function getRedisClient(): Promise<Redis | null> {
  if (!isRedisEnabled()) {
    return null;
  }

  if (!redisClient) {
    redisClient = createRedisClient('main');
    await redisClient.connect().catch((err) => {
      logger.error('Failed to connect to Redis', { error: err.message });
      redisClient = null;
      throw err;
    });
  }

  return redisClient;
}

/**
 * Get subscriber client for Pub/Sub (Socket.IO adapter needs separate client)
 */
export async function getSubscriberClient(): Promise<Redis | null> {
  if (!isRedisEnabled()) {
    return null;
  }

  if (!subscriberClient) {
    subscriberClient = createRedisClient('subscriber');
    await subscriberClient.connect().catch((err) => {
      logger.error('Failed to connect Redis subscriber', { error: err.message });
      subscriberClient = null;
      throw err;
    });
  }

  return subscriberClient;
}

/**
 * Close all Redis connections
 */
export async function closeRedisConnections(): Promise<void> {
  const closePromises: Promise<void>[] = [];

  if (redisClient) {
    closePromises.push(
      redisClient.quit().then(() => {
        logger.info('Redis main client disconnected');
        redisClient = null;
      })
    );
  }

  if (subscriberClient) {
    closePromises.push(
      subscriberClient.quit().then(() => {
        logger.info('Redis subscriber client disconnected');
        subscriberClient = null;
      })
    );
  }

  await Promise.all(closePromises);
}

/**
 * Simple cache helpers (optional usage)
 */
export const cache = {
  async get<T>(key: string): Promise<T | null> {
    const client = await getRedisClient();
    if (!client) return null;

    const value = await client.get(key);
    if (!value) return null;

    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  },

  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    const client = await getRedisClient();
    if (!client) return;

    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    
    if (ttlSeconds) {
      await client.setex(key, ttlSeconds, serialized);
    } else {
      await client.set(key, serialized);
    }
  },

  async del(key: string): Promise<void> {
    const client = await getRedisClient();
    if (!client) return;

    await client.del(key);
  },

  async exists(key: string): Promise<boolean> {
    const client = await getRedisClient();
    if (!client) return false;

    return (await client.exists(key)) === 1;
  },
};

export { Redis };
