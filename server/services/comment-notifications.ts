/**
 * Comment Notification System
 * 
 * Real-time notifications for comment activities:
 * - New comments on pages you created/follow
 * - Replies to your comments
 * - @mentions in comments
 * - Comment reactions
 */

import type { Pool } from 'pg';
import type { Server as SocketIOServer } from 'socket.io';
import logger from './logger.js';

// Notification types for comments
export enum CommentNotificationType {
  NEW_COMMENT = 'comment.new',
  COMMENT_REPLY = 'comment.reply',
  COMMENT_MENTION = 'comment.mention',
  COMMENT_REACTION = 'comment.reaction',
  COMMENT_RESOLVED = 'comment.resolved',
}

// Notification payload
export interface CommentNotification {
  id?: number;
  type: CommentNotificationType;
  recipientId: number;
  senderId?: number;
  senderName?: string;
  senderEmail?: string;
  pageId: number;
  pageTitle: string;
  commentId: number;
  commentPreview: string;
  parentCommentId?: number;
  mentionedText?: string;
  reactionType?: string;
  isRead: boolean;
  createdAt: Date;
}

// Socket.IO instance reference
let io: SocketIOServer | null = null;

/**
 * Set Socket.IO server instance
 */
export function setSocketIOServer(server: SocketIOServer): void {
  io = server;
}

/**
 * Initialize comment notifications table
 */
export async function initCommentNotificationsTable(pool: Pool): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS comment_notifications (
        id SERIAL PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        recipient_id INTEGER NOT NULL,
        sender_id INTEGER,
        sender_name VARCHAR(255),
        sender_email VARCHAR(255),
        page_id INTEGER NOT NULL,
        page_title TEXT,
        comment_id INTEGER NOT NULL,
        comment_preview TEXT,
        parent_comment_id INTEGER,
        mentioned_text TEXT,
        reaction_type VARCHAR(50),
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_comment_notif_recipient ON comment_notifications(recipient_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_comment_notif_read ON comment_notifications(recipient_id, is_read)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_comment_notif_created ON comment_notifications(created_at)`);
    
    logger.info('Comment notifications table initialized');
  } catch (error) {
    logger.error('Failed to initialize comment notifications table', { error });
  }
}

/**
 * Create and send a comment notification
 */
export async function sendCommentNotification(
  pool: Pool,
  notification: Omit<CommentNotification, 'id' | 'isRead' | 'createdAt'>
): Promise<CommentNotification> {
  // Don't notify yourself
  if (notification.senderId === notification.recipientId) {
    logger.debug('Skipping self-notification', { userId: notification.recipientId });
    return { ...notification, id: 0, isRead: true, createdAt: new Date() };
  }

  // Insert notification
  const result = await pool.query(
    `INSERT INTO comment_notifications 
     (type, recipient_id, sender_id, sender_name, sender_email, page_id, page_title, 
      comment_id, comment_preview, parent_comment_id, mentioned_text, reaction_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      notification.type,
      notification.recipientId,
      notification.senderId || null,
      notification.senderName || null,
      notification.senderEmail || null,
      notification.pageId,
      notification.pageTitle || null,
      notification.commentId,
      notification.commentPreview?.substring(0, 200) || null,
      notification.parentCommentId || null,
      notification.mentionedText || null,
      notification.reactionType || null,
    ]
  );

  const row = result.rows[0];
  const createdNotification: CommentNotification = {
    id: row.id,
    type: row.type,
    recipientId: row.recipient_id,
    senderId: row.sender_id,
    senderName: row.sender_name,
    senderEmail: row.sender_email,
    pageId: row.page_id,
    pageTitle: row.page_title,
    commentId: row.comment_id,
    commentPreview: row.comment_preview,
    parentCommentId: row.parent_comment_id,
    mentionedText: row.mentioned_text,
    reactionType: row.reaction_type,
    isRead: row.is_read,
    createdAt: row.created_at,
  };

  // Send real-time notification via Socket.IO
  if (io) {
    io.to(`user:${notification.recipientId}`).emit('comment:notification', createdNotification);
    logger.debug('Real-time comment notification sent', { recipientId: notification.recipientId, type: notification.type });
  }

  return createdNotification;
}

/**
 * Notify page owner about new comment
 */
export async function notifyNewComment(
  pool: Pool,
  pageOwnerId: number,
  comment: {
    id: number;
    content: string;
    pageId: number;
    pageTitle: string;
    authorId: number;
    authorName?: string;
    authorEmail?: string;
  }
): Promise<void> {
  await sendCommentNotification(pool, {
    type: CommentNotificationType.NEW_COMMENT,
    recipientId: pageOwnerId,
    senderId: comment.authorId,
    senderName: comment.authorName,
    senderEmail: comment.authorEmail,
    pageId: comment.pageId,
    pageTitle: comment.pageTitle,
    commentId: comment.id,
    commentPreview: comment.content,
  });
}

/**
 * Notify about reply to a comment
 */
export async function notifyCommentReply(
  pool: Pool,
  originalCommentAuthorId: number,
  reply: {
    id: number;
    content: string;
    pageId: number;
    pageTitle: string;
    parentCommentId: number;
    authorId: number;
    authorName?: string;
    authorEmail?: string;
  }
): Promise<void> {
  await sendCommentNotification(pool, {
    type: CommentNotificationType.COMMENT_REPLY,
    recipientId: originalCommentAuthorId,
    senderId: reply.authorId,
    senderName: reply.authorName,
    senderEmail: reply.authorEmail,
    pageId: reply.pageId,
    pageTitle: reply.pageTitle,
    commentId: reply.id,
    commentPreview: reply.content,
    parentCommentId: reply.parentCommentId,
  });
}

/**
 * Notify mentioned users in a comment
 */
export async function notifyMentions(
  pool: Pool,
  comment: {
    id: number;
    content: string;
    pageId: number;
    pageTitle: string;
    authorId: number;
    authorName?: string;
    authorEmail?: string;
  }
): Promise<void> {
  // Extract @mentions from content (format: @[username](userId))
  const mentionRegex = /@\[([^\]]+)\]\((\d+)\)/g;
  const mentions: Array<{ name: string; userId: number }> = [];
  
  let match;
  while ((match = mentionRegex.exec(comment.content)) !== null) {
    mentions.push({
      name: match[1],
      userId: parseInt(match[2]),
    });
  }

  // Also check for simple @email format
  const emailMentionRegex = /@(\S+@\S+\.\S+)/g;
  while ((match = emailMentionRegex.exec(comment.content)) !== null) {
    // Look up user by email
    const userResult = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [match[1]]
    );
    if (userResult.rows[0]) {
      mentions.push({
        name: match[1],
        userId: userResult.rows[0].id,
      });
    }
  }

  // Send notifications to mentioned users
  for (const mention of mentions) {
    await sendCommentNotification(pool, {
      type: CommentNotificationType.COMMENT_MENTION,
      recipientId: mention.userId,
      senderId: comment.authorId,
      senderName: comment.authorName,
      senderEmail: comment.authorEmail,
      pageId: comment.pageId,
      pageTitle: comment.pageTitle,
      commentId: comment.id,
      commentPreview: comment.content,
      mentionedText: `@${mention.name}`,
    });
  }
}

/**
 * Notify about reaction to a comment
 */
export async function notifyCommentReaction(
  pool: Pool,
  commentAuthorId: number,
  reaction: {
    commentId: number;
    pageId: number;
    pageTitle: string;
    reactionType: string;
    reactorId: number;
    reactorName?: string;
    reactorEmail?: string;
    commentPreview: string;
  }
): Promise<void> {
  await sendCommentNotification(pool, {
    type: CommentNotificationType.COMMENT_REACTION,
    recipientId: commentAuthorId,
    senderId: reaction.reactorId,
    senderName: reaction.reactorName,
    senderEmail: reaction.reactorEmail,
    pageId: reaction.pageId,
    pageTitle: reaction.pageTitle,
    commentId: reaction.commentId,
    commentPreview: reaction.commentPreview,
    reactionType: reaction.reactionType,
  });
}

/**
 * Get comment notifications for a user
 */
export async function getCommentNotifications(
  pool: Pool,
  userId: number,
  options?: {
    unreadOnly?: boolean;
    limit?: number;
    offset?: number;
  }
): Promise<{ notifications: CommentNotification[]; total: number; unreadCount: number }> {
  const limit = options?.limit || 50;
  const offset = options?.offset || 0;
  const unreadOnly = options?.unreadOnly || false;

  const whereClause = unreadOnly 
    ? 'WHERE recipient_id = $1 AND is_read = false'
    : 'WHERE recipient_id = $1';

  // Get total and unread counts
  const countResult = await pool.query(
    `SELECT 
       COUNT(*) as total,
       COUNT(*) FILTER (WHERE is_read = false) as unread
     FROM comment_notifications 
     WHERE recipient_id = $1`,
    [userId]
  );

  // Get notifications
  const result = await pool.query(
    `SELECT * FROM comment_notifications 
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  const notifications: CommentNotification[] = result.rows.map(row => ({
    id: row.id,
    type: row.type,
    recipientId: row.recipient_id,
    senderId: row.sender_id,
    senderName: row.sender_name,
    senderEmail: row.sender_email,
    pageId: row.page_id,
    pageTitle: row.page_title,
    commentId: row.comment_id,
    commentPreview: row.comment_preview,
    parentCommentId: row.parent_comment_id,
    mentionedText: row.mentioned_text,
    reactionType: row.reaction_type,
    isRead: row.is_read,
    createdAt: row.created_at,
  }));

  return {
    notifications,
    total: parseInt(countResult.rows[0].total),
    unreadCount: parseInt(countResult.rows[0].unread),
  };
}

/**
 * Mark notifications as read
 */
export async function markNotificationsRead(
  pool: Pool,
  userId: number,
  notificationIds?: number[]
): Promise<number> {
  let result;
  
  if (notificationIds && notificationIds.length > 0) {
    // Mark specific notifications as read
    result = await pool.query(
      `UPDATE comment_notifications 
       SET is_read = true 
       WHERE recipient_id = $1 AND id = ANY($2)
       RETURNING id`,
      [userId, notificationIds]
    );
  } else {
    // Mark all as read
    result = await pool.query(
      `UPDATE comment_notifications 
       SET is_read = true 
       WHERE recipient_id = $1 AND is_read = false
       RETURNING id`,
      [userId]
    );
  }

  const count = result.rowCount || 0;
  
  // Emit socket event for real-time UI update
  if (io && count > 0) {
    io.to(`user:${userId}`).emit('notifications:marked_read', { count });
  }

  return count;
}

/**
 * Delete old notifications
 */
export async function pruneOldNotifications(
  pool: Pool,
  daysToKeep: number = 30
): Promise<number> {
  const result = await pool.query(
    `DELETE FROM comment_notifications 
     WHERE created_at < NOW() - INTERVAL '1 day' * $1
     RETURNING id`,
    [daysToKeep]
  );

  const count = result.rowCount || 0;
  if (count > 0) {
    logger.info('Pruned old comment notifications', { count, daysToKeep });
  }

  return count;
}

/**
 * Get notification preferences for a user
 */
export async function getNotificationPreferences(
  pool: Pool,
  userId: number
): Promise<{
  emailNotifications: boolean;
  pushNotifications: boolean;
  commentReplies: boolean;
  mentions: boolean;
  reactions: boolean;
}> {
  const result = await pool.query(
    `SELECT preferences FROM users WHERE id = $1`,
    [userId]
  );

  const prefs = result.rows[0]?.preferences?.notifications || {};

  return {
    emailNotifications: prefs.email !== false,
    pushNotifications: prefs.push !== false,
    commentReplies: prefs.commentReplies !== false,
    mentions: prefs.mentions !== false,
    reactions: prefs.reactions !== false,
  };
}

export default {
  setSocketIOServer,
  initCommentNotificationsTable,
  sendCommentNotification,
  notifyNewComment,
  notifyCommentReply,
  notifyMentions,
  notifyCommentReaction,
  getCommentNotifications,
  markNotificationsRead,
  pruneOldNotifications,
  getNotificationPreferences,
  CommentNotificationType,
};
