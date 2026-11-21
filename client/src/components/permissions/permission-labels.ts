import { OrganizationApiError } from '@/components/organization/api';

export {
  LEVEL_BADGE_LABELS,
  LEVEL_DESCRIPTIONS,
  LEVEL_LABELS,
  isPageLevel,
  type PageLevel,
} from './share-state';

/** Words for the refusals the sharing routes give; unknown messages fall back to the status. */
const KNOWN_MESSAGES: Record<string, string> = {
  'Unknown user or team': '이 사람이나 팀을 조직에서 찾을 수 없습니다. 검색을 다시 해 보세요.',
  'Invalid permission data': '선택한 권한을 적용할 수 없습니다.',
  'Only page owners can manage permissions': '문서 소유자만 공유를 바꿀 수 있습니다.',
  'Only page owners can share the page': '문서 소유자만 공유를 바꿀 수 있습니다.',
  'Permission not found': '이미 바뀐 항목입니다. 목록을 새로 고쳤습니다.',
  'Invalid search': '검색어가 올바르지 않습니다. 100자 이하로 입력하세요.',
};

const BY_STATUS: Record<number, string> = {
  0: '서버에 연결하지 못했습니다. 네트워크를 확인한 뒤 다시 시도하세요.',
  401: '로그인이 만료되었습니다. 다시 로그인하세요.',
  403: '이 작업을 할 권한이 없습니다. 내 권한이 바뀌었을 수 있습니다.',
  404: '문서를 찾을 수 없거나 더 이상 접근할 수 없습니다.',
  429: '요청이 너무 많습니다. 잠시 후 다시 시도하세요.',
};

export function shareErrorText(error: unknown): string {
  if (error instanceof OrganizationApiError) {
    if (error.serverMessage && KNOWN_MESSAGES[error.serverMessage]) {
      return KNOWN_MESSAGES[error.serverMessage];
    }
    return BY_STATUS[error.status] ?? '처리하지 못했습니다. 잠시 후 다시 시도하세요.';
  }
  return '처리하지 못했습니다. 잠시 후 다시 시도하세요.';
}
