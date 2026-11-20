import { describe, expect, it } from 'vitest';
import {
  createNotificationRequestSchema,
  updateNotificationRequestSchema,
} from '../../shared/schema';

const base = { type: 'mention', title: 'Hi', content: 'There', recipientUserId: 5 };

describe('createNotificationRequestSchema (a notification is addressed to an account)', () => {
  it('accepts the account-addressed shape and the optional fields', () => {
    expect(createNotificationRequestSchema.parse(base)).toEqual(base);
    const full = {
      ...base,
      relatedPageId: 1,
      relatedTaskId: null,
      relatedCommentId: 3,
      isRead: false,
    };
    expect(createNotificationRequestSchema.parse(full)).toEqual(full);
  });

  it.each([
    ['recipientId', { recipientId: 5 }],
    ['senderId', { senderId: 5 }],
    ['senderUserId', { senderUserId: 5 }],
    ['organizationId', { organizationId: 1 }],
    ['id', { id: 1 }],
    ['createdAt', { createdAt: '2025-01-01' }],
  ])('refuses the key %s', (_key, extra) => {
    expect(createNotificationRequestSchema.safeParse({ ...base, ...extra }).success).toBe(false);
  });

  it.each([
    ['no recipient', { recipientUserId: undefined }],
    ['a zero recipient', { recipientUserId: 0 }],
    ['a negative recipient', { recipientUserId: -1 }],
    ['a fractional recipient', { recipientUserId: 1.5 }],
    ['a string recipient', { recipientUserId: '5' }],
    ['no title', { title: undefined }],
  ])('refuses %s', (_label, over) => {
    expect(createNotificationRequestSchema.safeParse({ ...base, ...over }).success).toBe(false);
  });
});

describe('updateNotificationRequestSchema', () => {
  it('accepts content fields and the fixed fields (the route compares them to the stored values)', () => {
    const body = {
      isRead: true,
      title: 'T',
      content: 'C',
      type: 'x',
      recipientUserId: 1,
      senderUserId: null,
      organizationId: 1,
      relatedPageId: null,
      relatedTaskId: null,
      relatedCommentId: null,
    };
    expect(updateNotificationRequestSchema.parse(body)).toEqual(body);
    expect(updateNotificationRequestSchema.parse({})).toEqual({});
  });

  it.each([['recipientId'], ['senderId'], ['id'], ['createdAt'], ['unknown']])(
    'refuses the key %s',
    (key) => {
      expect(updateNotificationRequestSchema.safeParse({ [key]: 1 }).success).toBe(false);
    }
  );
});
