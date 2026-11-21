import { OrganizationApiError } from './api';

/**
 * Words for the refusals the organization routes can give (server/organization-routes.ts,
 * storage.ts role rules). Matched on the server's message; anything unknown falls back to a
 * sentence per status, never to raw JSON or a status code.
 */
const KNOWN_MESSAGES: Record<string, string> = {
  'Only an organization owner can grant or change the owner role':
    '소유자 역할을 부여하거나 바꿀 수 있는 사람은 조직 소유자뿐입니다.',
  'Only an organization owner can change an admin':
    '관리자의 역할은 조직 소유자만 바꿀 수 있습니다.',
  'You cannot raise your own role': '자신의 역할을 올릴 수는 없습니다.',
  'Cannot remove the last organization owner':
    '조직의 마지막 소유자는 내릴 수 없습니다. 먼저 다른 구성원을 소유자로 지정하세요.',
  'You cannot remove yourself from the organization': '자기 자신을 조직에서 내보낼 수는 없습니다.',
  'Only an organization owner can remove an owner or admin':
    '소유자와 관리자는 조직 소유자만 내보낼 수 있습니다.',
  'Member not found': '이 구성원을 찾을 수 없습니다. 이미 조직에서 제외되었을 수 있습니다.',
  'Organization owner or admin role required':
    '조직 소유자 또는 관리자만 할 수 있습니다. 내 역할이 바뀌었을 수 있습니다.',
  'Your account does not belong to an organization': '이 계정은 더 이상 조직에 속해 있지 않습니다.',
  'Invalid organization settings':
    '설정 값이 올바르지 않습니다. 이름은 1자 이상 100자 이하여야 합니다.',
  'Only an organization owner can change AI access for an owner or admin':
    '소유자와 관리자의 AI 사용 권한은 조직 소유자만 바꿀 수 있습니다.',
  'You cannot grant AI access to yourself':
    '자신에게 AI 사용 권한을 줄 수는 없습니다. 조직 소유자에게 요청하세요.',
  'Invalid AI access': 'AI 사용 권한 값이 올바르지 않습니다. 목록을 새로 고친 뒤 다시 시도하세요.',
  'Invalid role': '선택한 역할이 올바르지 않습니다.',
  'Invalid user ID': '구성원을 확인할 수 없습니다. 목록을 새로 고친 뒤 다시 시도하세요.',
  'Organization is busy, try again': '조직이 다른 변경을 처리 중입니다. 잠시 후 다시 시도하세요.',
  'Only an organization owner can invite an admin':
    '관리자를 초대할 수 있는 사람은 조직 소유자뿐입니다. 구성원으로 초대하세요.',
  'Only an organization owner can revoke an invitation for an admin':
    '관리자 초대는 조직 소유자만 취소할 수 있습니다.',
  'The invitation is no longer pending': '이 초대는 이미 처리되어 취소할 수 없습니다.',
  'Invitation not found': '이 초대를 찾을 수 없습니다. 목록을 새로 고친 뒤 다시 시도하세요.',
  'Invalid invitation': '초대 값이 올바르지 않습니다. 이메일 형식과 만료 기간을 확인하세요.',
  'This address already belongs to a member': '이 이메일은 이미 이 조직의 구성원입니다.',
  'The organization is switched off': '조직이 꺼져 있어 초대를 만들 수 없습니다.',
  'Too many pending invitations':
    '대기 중인 초대가 너무 많습니다. 쓰지 않는 초대를 취소한 뒤 다시 시도하세요.',
};

const BY_STATUS: Record<number, string> = {
  0: '서버에 연결하지 못했습니다. 네트워크를 확인한 뒤 다시 시도하세요.',
  401: '로그인이 만료되었습니다. 다시 로그인하세요.',
  403: '이 작업을 할 권한이 없습니다.',
  404: '대상을 찾을 수 없습니다. 목록을 새로 고친 뒤 다시 시도하세요.',
  409: '현재 상태에서는 이 작업을 할 수 없습니다.',
  429: '요청이 너무 많습니다. 잠시 후 다시 시도하세요.',
  503: '조직이 다른 변경을 처리 중입니다. 잠시 후 다시 시도하세요.',
};

export function organizationErrorText(error: unknown): string {
  if (error instanceof OrganizationApiError) {
    if (error.status === 503) return KNOWN_MESSAGES['Organization is busy, try again'];
    if (error.serverMessage && KNOWN_MESSAGES[error.serverMessage]) {
      return KNOWN_MESSAGES[error.serverMessage];
    }
    return BY_STATUS[error.status] ?? '처리하지 못했습니다. 잠시 후 다시 시도하세요.';
  }
  return '처리하지 못했습니다. 잠시 후 다시 시도하세요.';
}

export const ROLE_LABELS = { owner: '소유자', admin: '관리자', member: '구성원' } as const;
