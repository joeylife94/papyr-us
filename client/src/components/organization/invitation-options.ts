/**
 * What the invitation screens offer a caller (issue #124 X1d). Display logic only: the server
 * decides again under the organization lock (grantableInvitationRoles in
 * server/organization-invitations.ts), and tests/unit/organization-invitation-options.test.ts
 * compares the two for every role.
 */
import type { OrganizationRole } from './role-options';

export type InvitationRole = 'member' | 'admin';
export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';
export type InvitationDelivery = 'not_requested' | 'not_configured' | 'sent' | 'failed' | 'pending';

/** The roles an invitation may carry for this caller: an owner invites members or admins, an admin members. */
export function invitableRoles(caller: OrganizationRole | null | undefined): InvitationRole[] {
  if (caller === 'owner') return ['member', 'admin'];
  if (caller === 'admin') return ['member'];
  return [];
}

/** Whether the list offers "revoke" on a row: a pending invitation, within the caller's ceiling. */
export function canRevokeInvitation(
  caller: OrganizationRole | null | undefined,
  role: InvitationRole,
  status: InvitationStatus
): boolean {
  return status === 'pending' && invitableRoles(caller).includes(role);
}

export const INVITATION_STATUS_LABELS: Record<InvitationStatus, string> = {
  pending: '대기 중',
  accepted: '수락됨',
  revoked: '취소됨',
  expired: '만료됨',
};

export const INVITATION_ROLE_LABELS: Record<InvitationRole, string> = {
  member: '구성원',
  admin: '관리자',
};

export const EXPIRY_CHOICES = [1, 3, 7, 14, 30] as const;
export const DEFAULT_EXPIRY_DAYS = 7;

/** What the creation answer says about the email, in words for the inviter. */
export function deliveryText(delivery: InvitationDelivery): string {
  switch (delivery) {
    case 'sent':
      return '초대 이메일을 보냈습니다. 아래 링크를 직접 전달할 수도 있습니다.';
    case 'pending':
      return '이메일 서버가 아직 응답하지 않았습니다. 계속 보내는 중이니, 급하면 아래 링크를 직접 전달하세요.';
    case 'failed':
      return '이메일을 보내지 못했습니다. 아래 링크를 직접 전달하세요.';
    case 'not_configured':
      return '이 서버에는 이메일 발송이 설정되어 있지 않습니다. 아래 링크를 직접 전달하세요.';
    default:
      return '아래 링크를 초대할 사람에게 전달하세요.';
  }
}

/** The link for a token. The token goes in the fragment: a browser does not send it to the server. */
export function invitationLink(origin: string, token: string): string {
  return `${origin}/join#token=${encodeURIComponent(token)}`;
}

/** The token in a page's URL fragment (`#token=...`), or null. */
export function tokenFromHash(hash: string): string | null {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const token = params.get('token');
  return token && /^[A-Za-z0-9_-]{43,200}$/.test(token) ? token : null;
}
