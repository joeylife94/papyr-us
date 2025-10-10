import { describe, it, expect } from 'vitest';

// A tiny smoke test that does not require DB or external services.
// Put minimal fast checks here — adjust to your critical path.

describe('smoke tests', () => {
  it('sanity: 1+1=2', () => {
    expect(1 + 1).toBe(2);
  });
});
