/**
 * Unit tests — Logger sensitive-field masking (P2)
 *
 * Verifies that maskSensitiveFields() always redacts auth-related keys so that
 * passwords, tokens, and cookies never reach production log storage.
 */
import { describe, it, expect } from 'vitest';
import { maskSensitiveFields } from '../services/logger.js';

describe('maskSensitiveFields', () => {
  it('redacts password field', () => {
    const result = maskSensitiveFields({ email: 'user@example.com', password: 'hunter2' });
    expect(result.password).toBe('[REDACTED]');
    expect(result.email).toBe('user@example.com');
  });

  it('redacts hashedPassword field', () => {
    const result = maskSensitiveFields({ hashedPassword: '$2b$10$abc...' });
    expect(result.hashedPassword).toBe('[REDACTED]');
  });

  it('redacts accessToken and refreshToken fields', () => {
    const result = maskSensitiveFields({
      accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig',
      refreshToken: 'some-long-refresh-token',
    });
    expect(result.accessToken).toBe('[REDACTED]');
    expect(result.refreshToken).toBe('[REDACTED]');
  });

  it('redacts cookie and authorization headers', () => {
    const result = maskSensitiveFields({
      cookie: 'accessToken=abc123; Path=/',
      authorization: 'Bearer eyJhb...',
    });
    expect(result.cookie).toBe('[REDACTED]');
    expect(result.authorization).toBe('[REDACTED]');
  });

  it('redacts secret field', () => {
    const result = maskSensitiveFields({ secret: 'my-jwt-secret' });
    expect(result.secret).toBe('[REDACTED]');
  });

  it('preserves non-sensitive fields intact', () => {
    const result = maskSensitiveFields({ userId: 42, action: 'login', status: 'ok' });
    expect(result.userId).toBe(42);
    expect(result.action).toBe('login');
    expect(result.status).toBe('ok');
  });

  it('deep-masks nested sensitive fields', () => {
    const result = maskSensitiveFields({
      user: { id: 1, name: 'Alice', password: 'secret' },
      meta: { token: 'tok_xyz', timestamp: '2026-03-28T00:00:00Z' },
    });
    expect((result.user as any).password).toBe('[REDACTED]');
    expect((result.user as any).id).toBe(1);
    expect((result.user as any).name).toBe('Alice');
    expect((result.meta as any).token).toBe('[REDACTED]');
    expect((result.meta as any).timestamp).toBe('2026-03-28T00:00:00Z');
  });

  it('does not mutate the original object', () => {
    const original = { password: 'secret', userId: 7 };
    const result = maskSensitiveFields(original);
    expect(original.password).toBe('secret');
    expect(result.password).toBe('[REDACTED]');
  });

  it('handles empty metadata gracefully', () => {
    const result = maskSensitiveFields({});
    expect(result).toEqual({});
  });
});
