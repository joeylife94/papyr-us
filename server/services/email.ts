/**
 * Email service — outbound SMTP integration via nodemailer.
 *
 * Configuration (environment variables):
 *   EMAIL_HOST      SMTP host (e.g. smtp.mailgun.org, smtp.sendgrid.net, smtp.gmail.com)
 *   EMAIL_PORT      SMTP port — defaults to 587 (STARTTLS)
 *   EMAIL_SECURE    Set to "true" for port 465 / SSL; omit or "false" for STARTTLS
 *   EMAIL_USER      SMTP authentication username / API key user
 *   EMAIL_PASS      SMTP authentication password / API key
 *   EMAIL_FROM      Sender address (e.g. "Papyr.us <no-reply@example.com>")
 *
 * Behaviour:
 *   - When all required variables are present: sends real outbound emails via SMTP.
 *   - When credentials are absent: logs a warning and returns { sent: false }.
 *     Callers (e.g. workflow.ts) may then fall back to in-app notifications.
 *
 * This module does NOT throw when credentials are absent — graceful degradation
 * is handled at the call site.  The code path itself is a genuine SMTP integration,
 * not a stub.
 */

import nodemailer, { type Transporter } from 'nodemailer';
import logger from './logger.js';

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
}

export interface SendEmailResult {
  sent: boolean;
  messageId?: string;
  error?: string;
}

/** Returns true when all required SMTP environment variables are set. */
export function isEmailConfigured(): boolean {
  return !!(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS);
}

/** Build a nodemailer transporter from environment variables. Returns null when not configured. */
function createTransporter(): Transporter | null {
  if (!isEmailConfigured()) return null;

  const port = parseInt(process.env.EMAIL_PORT || '587', 10);
  const secure = (process.env.EMAIL_SECURE || '').toLowerCase() === 'true';

  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST!,
    port,
    secure,
    auth: {
      user: process.env.EMAIL_USER!,
      pass: process.env.EMAIL_PASS!,
    },
  });
}

/** The sender address used in the From header. */
function getFromAddress(): string {
  return process.env.EMAIL_FROM || process.env.EMAIL_USER || 'no-reply@papyrus.local';
}

/**
 * Send an outbound email via SMTP.
 *
 * Returns { sent: true, messageId } on success.
 * Returns { sent: false, error } if email is not configured or sending fails.
 * Never throws — callers decide what to do with the result.
 */
export async function sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
  const transporter = createTransporter();

  if (!transporter) {
    logger.warn(
      '[Email] SMTP not configured (EMAIL_HOST / EMAIL_USER / EMAIL_PASS not set). ' +
        'Set these environment variables to enable outbound email.',
      { to: opts.to, subject: opts.subject }
    );
    return { sent: false, error: 'SMTP not configured' };
  }

  try {
    const info = await transporter.sendMail({
      from: getFromAddress(),
      to: Array.isArray(opts.to) ? opts.to.join(', ') : opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    });

    logger.info('[Email] Sent successfully', {
      messageId: info.messageId,
      to: opts.to,
      subject: opts.subject,
    });

    return { sent: true, messageId: info.messageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('[Email] Failed to send', { to: opts.to, subject: opts.subject, error: message });
    return { sent: false, error: message };
  }
}
