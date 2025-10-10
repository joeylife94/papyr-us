import { describe, it, expect } from 'vitest';
import { blockSchema, blockTypes } from '../../../shared/schema.ts';

describe('smoke: shared/schema block schema', () => {
  it('blockTypes contains expected minimal entries', () => {
    expect(blockTypes).toContain('paragraph');
    expect(blockTypes).toContain('heading1');
  });

  it('blockSchema applies defaults', () => {
    const input = {
      id: 'b1',
      type: 'paragraph' as const,
      order: 1,
      // omit optional/defaulted fields
    };
    const parsed = blockSchema.parse(input);
    expect(parsed.content).toBe('');
    expect(parsed.properties).toEqual({});
    expect(parsed.children).toEqual([]);
  });
});
