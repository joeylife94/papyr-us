import { describe, it, expect } from 'vitest';
import { createSuccessResponse, createErrorResponse } from '../../types.ts';

describe('smoke: response helpers', () => {
  it('createSuccessResponse returns success with data and optional message', () => {
    const res = createSuccessResponse({ ok: true }, 'done');
    expect(res.success).toBe(true);
    expect(res.data).toEqual({ ok: true });
    expect(res.message).toBe('done');
  });

  it('createErrorResponse returns error with message and optional code/details', () => {
    const res = createErrorResponse('failed', 'E_FAIL', { why: 'x' });
    expect(res.success).toBe(false);
    expect(res.error?.message).toBe('failed');
    expect(res.error?.code).toBe('E_FAIL');
    expect(res.error?.details).toEqual({ why: 'x' });
  });
});
