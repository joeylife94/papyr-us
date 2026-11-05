/**
 * The PostgreSQL error behind `error`, if any: its SQLSTATE `code` and the `constraint` it names.
 * drizzle-orm wraps every driver error in a DrizzleQueryError whose `cause` is the pg error, so
 * these fields are on the cause, not on the error a query throws. A bare pg error (from the pool
 * directly) is read as it is.
 */
export function postgresErrorOf(error: unknown): { code: string; constraint?: string } | null {
  let current: unknown = error;
  for (let depth = 0; depth < 3 && current && typeof current === 'object'; depth += 1) {
    const candidate = current as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (typeof candidate.code === 'string' && /^[0-9A-Z]{5}$/.test(candidate.code)) {
      return {
        code: candidate.code,
        constraint: typeof candidate.constraint === 'string' ? candidate.constraint : undefined,
      };
    }
    current = candidate.cause;
  }
  return null;
}
