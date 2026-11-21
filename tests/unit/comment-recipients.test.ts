import { describe, expect, it } from 'vitest';
import {
  computeCommentRecipients,
  threadParticipantIds,
  type ThreadComment,
} from '../../server/services/comment-recipients';

const comment = (id: number, parentId: number | null, authorUserId: number | null) =>
  ({ id, parentId, authorUserId }) as ThreadComment;

const base = {
  actorUserId: 1,
  pageCreatorUserId: 2,
  parentId: null,
  pageComments: [] as ThreadComment[],
  mentionedUserIds: [] as number[],
};

const asObject = (map: Map<number, string>) => Object.fromEntries(map);

describe('who a comment is about', () => {
  it('a new top-level comment notifies the page creator', () => {
    expect(asObject(computeCommentRecipients(base))).toEqual({ 2: 'comment' });
  });

  it('a page without a recorded creator notifies no one as creator', () => {
    expect(computeCommentRecipients({ ...base, pageCreatorUserId: null }).size).toBe(0);
  });

  it('nobody is notified about their own action', () => {
    expect(computeCommentRecipients({ ...base, actorUserId: 2 }).size).toBe(0);
    expect(computeCommentRecipients({ ...base, actorUserId: 2, mentionedUserIds: [2] }).size).toBe(
      0
    );
  });

  it('a mention notifies the mentioned account, and the creator too on a top-level comment', () => {
    expect(asObject(computeCommentRecipients({ ...base, mentionedUserIds: [3] }))).toEqual({
      3: 'mention',
      2: 'comment',
    });
  });

  it('the most specific kind wins when one account qualifies twice', () => {
    expect(asObject(computeCommentRecipients({ ...base, mentionedUserIds: [2, 2] }))).toEqual({
      2: 'mention',
    });
  });

  describe('replies', () => {
    const thread = [
      comment(10, null, 2),
      comment(11, 10, 3),
      comment(12, 10, 4),
      comment(13, 10, null),
      comment(20, null, 5),
      comment(21, 20, 6),
    ];

    it('notify the parent author and the earlier participants of that thread only', () => {
      expect(
        asObject(computeCommentRecipients({ ...base, parentId: 10, pageComments: thread }))
      ).toEqual({ 2: 'reply', 3: 'reply', 4: 'reply' });
    });

    it('replying to a reply uses the same thread', () => {
      expect(
        asObject(computeCommentRecipients({ ...base, parentId: 11, pageComments: thread }))
      ).toEqual({ 2: 'reply', 3: 'reply', 4: 'reply' });
    });

    it('do not notify the page creator on that ground, nor the commenter', () => {
      const result = computeCommentRecipients({
        ...base,
        actorUserId: 3,
        pageCreatorUserId: 9,
        parentId: 10,
        pageComments: thread,
      });
      expect(asObject(result)).toEqual({ 2: 'reply', 4: 'reply' });
    });

    it('comments without an account (workflow comments) contribute nobody', () => {
      expect(threadParticipantIds(10, [comment(10, null, null), comment(11, 10, null)])).toEqual(
        []
      );
    });

    it('a mention in a reply wins over being a participant', () => {
      expect(
        asObject(
          computeCommentRecipients({
            ...base,
            parentId: 10,
            pageComments: thread,
            mentionedUserIds: [4],
          })
        )
      ).toEqual({ 4: 'mention', 2: 'reply', 3: 'reply' });
    });

    it('an unknown parent has no participants, and a parent cycle ends', () => {
      expect(threadParticipantIds(99, thread)).toEqual([]);
      const cycle = [comment(1, 2, 7), comment(2, 1, 8)];
      expect(() => threadParticipantIds(1, cycle)).not.toThrow();
    });
  });
});
