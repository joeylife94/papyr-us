import { describe, expect, it } from 'vitest';
import { DrizzleQueryError } from 'drizzle-orm';
import { postgresErrorOf } from '../../server/db-errors';

// drizzle-orm wraps pg errors; the SQLSTATE code and constraint are on the cause.

const pgError = (code: string, constraint?: string) =>
  Object.assign(new Error('pg error'), { code, constraint });

describe('postgresErrorOf', () => {
  it('reads a bare pg error and one wrapped by drizzle-orm', () => {
    expect(postgresErrorOf(pgError('23505', 'wiki_pages_slug_unique'))).toEqual({
      code: '23505',
      constraint: 'wiki_pages_slug_unique',
    });
    expect(
      postgresErrorOf(new DrizzleQueryError('insert ...', [], pgError('23503', 'fk_name')))
    ).toEqual({ code: '23503', constraint: 'fk_name' });
  });

  it('ignores errors that are not from Postgres', () => {
    expect(postgresErrorOf(Object.assign(new Error('x'), { code: 'EADDRINUSE' }))).toBeNull();
    expect(postgresErrorOf(new Error('plain'))).toBeNull();
    expect(postgresErrorOf(null)).toBeNull();
    expect(postgresErrorOf('23505')).toBeNull();
  });
});
