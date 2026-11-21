import { OrganizationApiError } from '@/components/organization/api';

/**
 * Words for the refusals the team routes can give (server/team-membership-routes.ts, the role
 * rules in server/storage.ts, POST /api/teams). Matched on the server's message; anything
 * unknown falls back to a sentence per status, never to raw JSON or a status code.
 */
const KNOWN_MESSAGES: Record<string, string> = {
  'Only a team owner can grant or change the owner role':
    '소유자 역할을 부여하거나 바꿀 수 있는 사람은 팀 소유자뿐입니다.',
  'Only a team owner can change an admin': '관리자의 역할은 팀 소유자만 바꿀 수 있습니다.',
  'You cannot raise your own role': '자신의 역할을 올릴 수는 없습니다.',
  'Cannot demote the sole team owner':
    '팀의 마지막 소유자는 내릴 수 없습니다. 먼저 다른 멤버를 소유자로 지정하세요.',
  'Cannot remove the sole team owner':
    '팀의 마지막 소유자는 내보내거나 나갈 수 없습니다. 먼저 다른 멤버를 소유자로 지정하세요.',
  'Only an owner can remove another owner': '소유자를 내보낼 수 있는 사람은 팀 소유자뿐입니다.',
  'Only an owner can remove an admin': '관리자는 팀 소유자만 내보낼 수 있습니다.',
  'Membership not found': '이 멤버를 찾을 수 없습니다. 이미 팀에서 나갔을 수 있습니다.',
  'Owner or admin role required':
    '팀 소유자 또는 관리자만 할 수 있습니다. 내 역할이 바뀌었을 수 있습니다.',
  'You are not a member of this team': '이 팀의 멤버가 아닙니다.',
  'Registered user not found': '이 계정을 찾을 수 없습니다. 조직에서 제외되었을 수 있습니다.',
  'Invalid role': '선택한 역할이 올바르지 않습니다.',
  'Invalid team or user ID': '멤버를 확인할 수 없습니다. 목록을 새로 고친 뒤 다시 시도하세요.',
  'Existing user email is required': '추가할 계정을 확인할 수 없습니다.',
  'Invalid search': '검색어가 올바르지 않습니다. 100자 이하로 입력하세요.',
};

const BUSY = '팀이 다른 변경을 처리 중입니다. 잠시 후 다시 시도하세요.';

const BY_STATUS: Record<number, string> = {
  0: '서버에 연결하지 못했습니다. 네트워크를 확인한 뒤 다시 시도하세요.',
  401: '로그인이 만료되었습니다. 다시 로그인하세요.',
  403: '이 작업을 할 권한이 없습니다.',
  404: '대상을 찾을 수 없습니다. 목록을 새로 고친 뒤 다시 시도하세요.',
  409: '현재 상태에서는 이 작업을 할 수 없습니다.',
  429: '요청이 너무 많습니다. 잠시 후 다시 시도하세요.',
  503: BUSY,
};

export function teamErrorText(error: unknown): string {
  if (error instanceof OrganizationApiError) {
    if (error.status === 503) return BUSY;
    if (error.serverMessage && KNOWN_MESSAGES[error.serverMessage]) {
      return KNOWN_MESSAGES[error.serverMessage];
    }
    return BY_STATUS[error.status] ?? '처리하지 못했습니다. 잠시 후 다시 시도하세요.';
  }
  return '처리하지 못했습니다. 잠시 후 다시 시도하세요.';
}

/** Words for a refused team creation (POST /api/teams answers { error }, not { message }). */
export function createTeamErrorText(status: number): string {
  switch (status) {
    case 0:
      return BY_STATUS[0];
    case 400:
      return '팀 이름을 확인하세요. 1자 이상 100자 이하여야 합니다.';
    case 401:
      return BY_STATUS[401];
    case 403:
      return '이 계정은 어떤 조직에도 속해 있지 않아 팀을 만들 수 없습니다.';
    case 503:
      return '팀을 만들지 못했습니다. 잠시 후 다시 시도하세요.';
    case 429:
      return BY_STATUS[429];
    default:
      return '팀을 만들지 못했습니다. 잠시 후 다시 시도하세요.';
  }
}

export const TEAM_ROLE_LABELS = { owner: '소유자', admin: '관리자', member: '멤버' } as const;

/** The team setting "members can edit team pages" (WP7), as the team screen words it. */
export const MEMBERS_CAN_EDIT_LABEL = '멤버가 팀 페이지를 편집할 수 있음';

export function membersCanEditMeaning(on: boolean): string {
  return on
    ? '켜짐: 멤버는 팀 문서를 편집하고, 이전 버전 복원, 다른 사람의 댓글 삭제, 문서 이동·복제, 데이터베이스와 동기화 블록 만들기를 할 수 있습니다. 문서 공유(접근 관리)와 문서 삭제는 할 수 없습니다.'
    : '꺼짐: 이 팀의 멤버는 팀 문서를 볼 수만 있습니다. 편집하려면 문서마다 권한을 받아야 합니다.';
}
