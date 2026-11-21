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
 *   matched by email or by the page's `author` text;
 * - mentions are a feature of members: when the commenter is not an active member of the page's
 *   organization, every token is replaced by the neutral label and no mention is sent, whatever
 *   the ids were, so the answer tells such a commenter nothing about who is a member.
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

/** Most recipients one comment is resolved for; mentions come first. */
const MAX_RECIPIENTS = 200;

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

interface PlanInput {
  page: CommentPlanPage;
  actorUserId: number;
  /** Whether the commenter is an active member of the page's organization. */
  actorIsMember: boolean;
  content: string;
}

async function buildPlan(
  storage: CommentPlanStorage,
  input: PlanInput,
  candidates: Map<number, CommentNotificationKind>,
  mentionedUserIds: number[]
): Promise<CommentPlan> {
  const { page, actorUserId } = input;
  // Mentions first, so the recipient limit never drops a mention in favour of a participant.
  const wanted = [...new Set([...mentionedUserIds, ...candidates.keys()])].slice(0, MAX_RECIPIENTS);
  const readers = await storage.getReadableOrganizationMembers(
    page.organizationId,
    page.id,
    wanted
  );

  const content = stripUnlistedMentions(
    input.content,
    new Set(mentionedUserIds.filter((id) => readers.has(id)))
  );
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

/** A new comment or reply. */
export async function planCommentNotifications(
  storage: CommentPlanStorage,
  input: PlanInput & { parentId: number | null }
): Promise<CommentPlan> {
  const { page, actorUserId, parentId } = input;
  // A commenter outside the organization mentions nobody: the tokens go, the rest is as usual.
  const mentionedUserIds = input.actorIsMember ? extractMentionIds(input.content) : [];
  const pageComments = parentId !== null ? await storage.getPageCommentThreadRows(page.id) : [];
  const candidates = computeCommentRecipients({
    actorUserId,
    pageCreatorUserId: page.createdByUserId,
    parentId,
    pageComments,
    mentionedUserIds,
  });
  return buildPlan(storage, input, candidates, mentionedUserIds);
}

/**
 * An edited comment: the text keeps only live tokens, and a `mention` goes to each eligible
 * account the edit ADDED (a token already in `previousContent` notifies nobody again). Nothing
 * else is notified by an edit.
 */
export async function planEditNotifications(
  storage: CommentPlanStorage,
  input: PlanInput & { previousContent: string }
): Promise<CommentPlan> {
  const all = input.actorIsMember ? extractMentionIds(input.content) : [];
  const before = new Set(extractMentionIds(input.previousContent));
  const added = all.filter((id) => !before.has(id) && id !== input.actorUserId);
  const candidates = new Map<number, CommentNotificationKind>(added.map((id) => [id, 'mention']));
  return buildPlan(storage, input, candidates, all);
}
