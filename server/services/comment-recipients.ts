/**
 * Who a new comment is about (WP6), before anyone is checked for access.
 *
 * Pure: the caller supplies what it read and filters the result down to accounts that are active
 * members of the page's organization and may read the page. Nothing here matches a person by
 * email or by display text; recipients are account ids taken from `author_user_id`,
 * `created_by_user_id` and validated mention tokens.
 */

export type CommentNotificationKind = 'mention' | 'reply' | 'comment';

export interface ThreadComment {
  id: number;
  parentId: number | null;
  authorUserId: number | null;
}

export interface RecipientInput {
  /** The commenting account (server-derived). Never notified about their own comment. */
  actorUserId: number;
  /** `wiki_pages.created_by_user_id`; null for automation and older pages. */
  pageCreatorUserId: number | null;
  /** The comment being replied to, or null for a top-level comment. */
  parentId: number | null;
  /** Every existing comment of the page (ids, parents and author accounts only). */
  pageComments: ThreadComment[];
  /** Account ids named by the comment's mention tokens, already validated or not. */
  mentionedUserIds: number[];
}

/** The comment at the top of the thread that `commentId` belongs to (guarded against cycles). */
function threadRootId(commentId: number, byId: Map<number, ThreadComment>): number {
  let current = commentId;
  const seen = new Set<number>();
  for (;;) {
    seen.add(current);
    const parentId = byId.get(current)?.parentId ?? null;
    if (parentId === null || !byId.has(parentId) || seen.has(parentId)) return current;
    current = parentId;
  }
}

/** Accounts that wrote the thread's comments, root included. Comments with no account add nobody. */
export function threadParticipantIds(parentId: number, pageComments: ThreadComment[]): number[] {
  const byId = new Map(pageComments.map((comment) => [comment.id, comment]));
  if (!byId.has(parentId)) return [];
  const root = threadRootId(parentId, byId);
  const ids: number[] = [];
  for (const comment of pageComments) {
    if (comment.authorUserId == null) continue;
    if (threadRootId(comment.id, byId) !== root) continue;
    if (!ids.includes(comment.authorUserId)) ids.push(comment.authorUserId);
  }
  return ids;
}

/**
 * One kind per account, the most specific winning (a mention, then a reply, then a comment), so
 * duplicates within one event collapse to a single notification. The actor is never included.
 */
export function computeCommentRecipients(
  input: RecipientInput
): Map<number, CommentNotificationKind> {
  const result = new Map<number, CommentNotificationKind>();
  const add = (userId: number | null | undefined, kind: CommentNotificationKind) => {
    if (userId == null || userId === input.actorUserId || result.has(userId)) return;
    result.set(userId, kind);
  };

  for (const id of input.mentionedUserIds) add(id, 'mention');
  if (input.parentId !== null) {
    for (const id of threadParticipantIds(input.parentId, input.pageComments)) add(id, 'reply');
  } else {
    add(input.pageCreatorUserId, 'comment');
  }
  return result;
}
