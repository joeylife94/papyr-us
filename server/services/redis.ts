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

import Redis, { type RedisOptions } from 'ioredis';
import logger from './logger.js';

// Redis connection singletons. Connection promises prevent concurrent callers
// (health checks, cache access, and Socket.IO setup) from calling connect() on
// the same ioredis instance while it is already connecting.
let redisClient: Redis | null = null;
let redisConnectionPromise: Promise<Redis> | null = null;
let subscriberClient: Redis | null = null;
let subscriberConnectionPromise: Promise<Redis> | null = null;

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

function getRedisOptions(): RedisOptions {
  return {
    retryStrategy: (times) => {
      // Exponential backoff: 100ms, 200ms, 400ms... max 30s
      const delay = Math.min(times * 100, 30000);
      logger.warn(`Redis reconnecting (attempt ${times})...`, { delay });
      return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    // All clients use explicit lazy connection. Without this option the URL
    // constructor connects immediately and a later connect() throws
    // "Redis is already connecting/connected".
    lazyConnect: true,
  };
}

/**
 * Create Redis client with connection handling
 */
function createRedisClient(name: string = 'main'): Redis {
  const redisConfig = getRedisConfig();
  const options = getRedisOptions();

  const client = redisConfig.url
    ? new Redis(redisConfig.url, options)
    : new Redis({
        ...options,
        host: redisConfig.host,
        port: redisConfig.port,
        password: redisConfig.password,
        db: redisConfig.db,
        keyPrefix: redisConfig.keyPrefix,
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

async function connectClient(client: Redis, name: string): Promise<Redis> {
  // A ready or reconnecting client can accept commands; ioredis queues them
  // while reconnecting. Explicit connect() is only valid in the wait state.
  if (client.status !== 'wait') {
    return client;
  }

  try {
    await client.connect();
    return client;
  } catch (err) {
    logger.error(`Failed to connect Redis ${name}`, {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
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

  if (redisClient?.status === 'end') {
    redisClient = null;
  }

  if (!redisClient) {
    redisClient = createRedisClient('main');
  }

  if (!redisConnectionPromise) {
    const client = redisClient;
    redisConnectionPromise = connectClient(client, 'main')
      .catch((err) => {
        if (redisClient === client) {
          redisClient = null;
        }
        throw err;
      })
      .finally(() => {
        redisConnectionPromise = null;
      });
  }

  return redisConnectionPromise;
}

/**
 * Get subscriber client for Pub/Sub (Socket.IO adapter needs separate client)
 */
export async function getSubscriberClient(): Promise<Redis | null> {
  if (!isRedisEnabled()) {
    return null;
  }

  if (subscriberClient?.status === 'end') {
    subscriberClient = null;
  }

  if (!subscriberClient) {
    subscriberClient = createRedisClient('subscriber');
  }

  if (!subscriberConnectionPromise) {
    const client = subscriberClient;
    subscriberConnectionPromise = connectClient(client, 'subscriber')
      .catch((err) => {
        if (subscriberClient === client) {
          subscriberClient = null;
        }
        throw err;
      })
      .finally(() => {
        subscriberConnectionPromise = null;
      });
  }

  return subscriberConnectionPromise;
}

/**
 * Close all Redis connections
 */
export async function closeRedisConnections(): Promise<void> {
  // Wait for in-flight connections before closing so shutdown cannot race with
  // application startup or a health probe.
  await Promise.allSettled(
    [redisConnectionPromise, subscriberConnectionPromise].filter(
      (promise): promise is Promise<Redis> => promise !== null
    )
  );

  const closePromises: Promise<unknown>[] = [];
  const main = redisClient;
  const subscriber = subscriberClient;

  redisClient = null;
  subscriberClient = null;
  redisConnectionPromise = null;
  subscriberConnectionPromise = null;

  if (main && main.status !== 'end') {
    closePromises.push(
      main.quit().then(() => {
        logger.info('Redis main client disconnected');
      })
    );
  }

  if (subscriber && subscriber.status !== 'end') {
    closePromises.push(
      subscriber.quit().then(() => {
        logger.info('Redis subscriber client disconnected');
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
