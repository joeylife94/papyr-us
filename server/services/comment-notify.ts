/**
 * Decides what a new comment notifies (WP6), from what storage reports, before the comment is
 * written.
 *
 * Rules enforced here:
 * - a recipient is an account that is an active member of the page's organization AND may read
 *   the page (storage checks membership first, so a publicly shared page reaches nobody outside
 *   the organization); everyone else is dropped silently;
 * - mention tokens naming anyone else are removed from the text before it is stored, so a stored
 *   token always names a current reader of the page;
 * - the notification text is a short excerpt of the comment with mentions rendered as names, and
 *   the sender's name; never an email, and nothing a reader of the page could not already see;
 * - recipients are accounts (`author_user_id`, `created_by_user_id`, mention ids); nothing is
 *   matched by email or by the page's `author` text.
 */
import type { InsertNotification } from '../../shared/schema.js';
import {
  excerptOf,
  extractMentionIds,
  renderMentionsAsText,
  stripUnlistedMentions,
} from '../../shared/comment-mentions.js';
import { computeCommentRecipients, type CommentNotificationKind } from './comment-recipients.js';

/** The storage methods the plan reads (all reads, none inside a transaction). */
export interface CommentPlanStorage {
  getPageCommentThreadRows(
    pageId: number
  ): Promise<Array<{ id: number; parentId: number | null; authorUserId: number | null }>>;
  getReadableOrganizationMembers(
    organizationId: number,
    pageId: number,
    userIds: number[]
  ): Promise<Map<number, string>>;
  getActiveAccountNames(userIds: number[]): Promise<Map<number, string>>;
}

export interface CommentPlanPage {
  id: number;
  title: string;
  organizationId: number;
  createdByUserId: number | null;
}

export type NotificationDraft = Omit<InsertNotification, 'relatedCommentId'>;

export interface CommentPlan {
  /** The comment text to store: mention tokens that are not live are replaced by plain text. */
  content: string;
  notifications: NotificationDraft[];
}

const MAX_TITLE_LENGTH = 200;

function titleFor(kind: CommentNotificationKind, senderName: string, pageTitle: string): string {
  const verb =
    kind === 'mention'
      ? 'mentioned you in'
      : kind === 'reply'
        ? 'replied in your thread on'
        : 'commented on';
  const title = `${senderName} ${verb} "${pageTitle}"`;
  return [...title].length <= MAX_TITLE_LENGTH
    ? title
    : `${[...title].slice(0, MAX_TITLE_LENGTH - 1).join('')}…`;
}

/** What is stored when nothing could be checked: no live mention, no notification. */
export function failClosedPlan(content: string): CommentPlan {
  return { content: stripUnlistedMentions(content, new Set()), notifications: [] };
}

export async function planCommentNotifications(
  storage: CommentPlanStorage,
  input: {
    page: CommentPlanPage;
    actorUserId: number;
    content: string;
    parentId: number | null;
  }
): Promise<CommentPlan> {
  const { page, actorUserId, parentId } = input;
  const mentionedUserIds = extractMentionIds(input.content);
  const pageComments = parentId !== null ? await storage.getPageCommentThreadRows(page.id) : [];

  const candidates = computeCommentRecipients({
    actorUserId,
    pageCreatorUserId: page.createdByUserId,
    parentId,
    pageComments,
    mentionedUserIds,
  });

  // Mentions first, so the recipient limit never drops a mention in favour of a participant.
  const readers = await storage.getReadableOrganizationMembers(page.organizationId, page.id, [
    ...mentionedUserIds,
    ...candidates.keys(),
  ]);

  const content = stripUnlistedMentions(input.content, new Set(readers.keys()));
  const recipients = [...candidates].filter(([userId]) => readers.has(userId));
  if (recipients.length === 0) return { content, notifications: [] };

  const senderName = (await storage.getActiveAccountNames([actorUserId])).get(actorUserId);
  const excerpt = excerptOf(renderMentionsAsText(content, readers));
  return {
    content,
    notifications: recipients.map(([recipientUserId, kind]) => ({
      type: kind,
      title: titleFor(kind, senderName ?? 'Someone', page.title),
      content: excerpt,
      recipientUserId,
      organizationId: page.organizationId,
      senderUserId: actorUserId,
      relatedPageId: page.id,
      relatedTaskId: null,
      isRead: false,
    })),
  };
}
