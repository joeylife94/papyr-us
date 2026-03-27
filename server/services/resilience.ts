/**
 * Resilience Utilities
 *
 * Provides production-grade HTTP request wrappers with:
 *  - Strict timeouts (via AbortController)
 *  - Exponential backoff retry for transient errors (HTTP 429/500/502/503/504)
 *  - Fail-Fast on retry exhaustion — throws ExternalIntegrationError, never returns degraded data
 */

import logger from './logger.js';

// ---------------------------------------------------------------------------
// Domain-specific error class
// ---------------------------------------------------------------------------

export class ExternalIntegrationError extends Error {
  /** The name of the upstream service that failed (e.g. 'openai', 'slack', 'webhook') */
  public readonly serviceName: string;
  /** The HTTP status code from the last attempt, if available */
  public readonly statusCode: number | undefined;
  /** Total number of attempts made before giving up */
  public readonly attempts: number;

  constructor(
    serviceName: string,
    opts: {
      message?: string;
      statusCode?: number;
      attempts?: number;
      cause?: Error;
    } = {}
  ) {
    const msg =
      opts.message ||
      `External integration '${serviceName}' failed` +
        (opts.attempts ? ` after ${opts.attempts} attempt(s)` : '') +
        (opts.statusCode ? ` (HTTP ${opts.statusCode})` : '');
    super(msg);
    this.name = 'ExternalIntegrationError';
    this.serviceName = serviceName;
    this.statusCode = opts.statusCode;
    this.attempts = opts.attempts ?? 1;
    if (opts.cause) {
      (this as any).cause = opts.cause;
    }
  }
}

// ---------------------------------------------------------------------------
// Retry configuration
// ---------------------------------------------------------------------------

export interface FetchWithRetryOptions {
  /** Maximum number of total attempts (default: 3) */
  maxRetries?: number;
  /** HTTP request timeout in milliseconds (default: 10_000 ms) */
  timeoutMs?: number;
  /** Base delay for exponential backoff in milliseconds (default: 500 ms) */
  baseDelayMs?: number;
  /** Maximum backoff cap in milliseconds (default: 5_000 ms) */
  maxDelayMs?: number;
  /**
   * Human-readable name of the upstream service — used in logs and the
   * ExternalIntegrationError message (e.g. 'slack', 'webhook', 'openai').
   */
  serviceName?: string;
}

/** HTTP status codes that are considered transient and are eligible for retry. */
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

// ---------------------------------------------------------------------------
// fetchWithRetry
// ---------------------------------------------------------------------------

/**
 * Drop-in replacement for `fetch()` with configurable timeout, exponential backoff,
 * and Fail-Fast error propagation.
 *
 * @throws {ExternalIntegrationError} when all retry attempts are exhausted.
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  opts: FetchWithRetryOptions = {}
): Promise<Response> {
  const {
    maxRetries = 3,
    timeoutMs = 10_000,
    baseDelayMs = 500,
    maxDelayMs = 5_000,
    serviceName = url,
  } = opts;

  let lastError: Error | undefined;
  let lastStatusCode: number | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

      clearTimeout(timer);

      // Success — return immediately
      if (response.ok || !RETRYABLE_STATUS_CODES.has(response.status)) {
        return response;
      }

      // Retryable HTTP error
      lastStatusCode = response.status;
      lastError = new Error(`HTTP ${response.status}`);

      logger.warn('[Resilience] Retryable HTTP error from external service', {
        serviceName,
        status: response.status,
        attempt,
        maxRetries,
        url,
      });
    } catch (err) {
      clearTimeout(timer);

      const isTimeout = (err as any)?.name === 'AbortError';
      lastError = err instanceof Error ? err : new Error(String(err));

      logger.warn('[Resilience] Network/timeout error calling external service', {
        serviceName,
        error: lastError.message,
        isTimeout,
        attempt,
        maxRetries,
        url,
      });
    }

    // Don't sleep after the last attempt
    if (attempt < maxRetries) {
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // All retries exhausted — Fail-Fast
  logger.error('[Resilience] All retry attempts exhausted for external service', {
    serviceName,
    attempts: maxRetries,
    lastError: lastError?.message,
    lastStatusCode,
    url,
  });

  throw new ExternalIntegrationError(serviceName, {
    statusCode: lastStatusCode,
    attempts: maxRetries,
    cause: lastError,
  });
}
