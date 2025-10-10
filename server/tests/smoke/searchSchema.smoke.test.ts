import { describe, it, expect } from 'vitest';
import { searchSchema } from '../../../shared/schema.ts';

describe('smoke: search schema defaults', () => {
  it('applies defaults for limit and offset', () => {
    const parsed = searchSchema.parse({});
    expect(parsed.limit).toBe(20);
    expect(parsed.offset).toBe(0);
  });

  it('accepts optional fields when provided', () => {
    const parsed = searchSchema.parse({
      query: 'test',
      folder: 'docs',
      tags: ['a'],
      teamId: 'team1',
      limit: 10,
      offset: 5,
    });
    expect(parsed).toMatchObject({
      query: 'test',
      folder: 'docs',
      tags: ['a'],
      teamId: 'team1',
      limit: 10,
      offset: 5,
    });
  });
});
