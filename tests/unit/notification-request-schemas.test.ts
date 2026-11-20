import { describe, expect, it } from 'vitest';
import {
  createNotificationRequestSchema,
  memberNotificationTypes,
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

describe('createNotificationRequestSchema bounds (what a person may send)', () => {
  const parse = (over: Record<string, unknown>) =>
    createNotificationRequestSchema.safeParse({ ...base, ...over });

  it('trims the title and keeps 1 to 200 characters', () => {
    expect(parse({ title: '  Hi  ' })).toMatchObject({ success: true, data: { title: 'Hi' } });
    expect(parse({ title: 'x'.repeat(200) }).success).toBe(true);
    expect(parse({ title: 'x'.repeat(201) }).success).toBe(false);
    expect(parse({ title: '' }).success).toBe(false);
    expect(parse({ title: '   ' }).success).toBe(false);
  });

  it('keeps the content at 2,000 characters or fewer, and allows it to be empty', () => {
    expect(parse({ content: 'x'.repeat(2000) }).success).toBe(true);
    expect(parse({ content: 'x'.repeat(2001) }).success).toBe(false);
    expect(parse({ content: '' }).success).toBe(true);
  });

  it.each(memberNotificationTypes)('accepts the kind %s', (type) => {
    expect(parse({ type }).success).toBe(true);
  });

  it.each(['system', 'test', '', 'MENTION', 'workflow'])('refuses the kind %j', (type) => {
    expect(parse({ type }).success).toBe(false);
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
