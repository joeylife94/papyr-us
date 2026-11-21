import { describe, expect, it } from 'vitest';
import { commentFailureMessage } from '../../client/src/lib/comment-errors';

const response = (status: number, body: unknown) => ({
  status,
  json: async () => body,
});

describe('commentFailureMessage', () => {
  it('shows the fixed message of a 503, so the draft can be kept and sent again', async () => {
    expect(
      await commentFailureMessage(
        response(503, { message: 'Comments are temporarily unavailable. Please try again.' }),
        'Failed to post comment'
      )
    ).toBe('Comments are temporarily unavailable. Please try again.');
  });

  it('gives any other failure the generic text, never a server detail', async () => {
    expect(
      await commentFailureMessage(response(500, { message: 'internal detail' }), 'Failed')
    ).toBe('Failed');
    expect(await commentFailureMessage(response(400, {}), 'Failed')).toBe('Failed');
  });

  it('falls back when a 503 has no usable body', async () => {
    expect(await commentFailureMessage(response(503, null), 'Failed')).toBe('Failed');
    expect(
      await commentFailureMessage(
        {
          status: 503,
          json: async () => {
            throw new Error('not json');
          },
        },
        'Failed'
      )
    ).toBe('Failed');
  });
});
