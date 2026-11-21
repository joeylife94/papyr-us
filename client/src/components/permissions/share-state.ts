export type PageLevel = 'owner' | 'editor' | 'commenter' | 'viewer';

/** The level names a person sees, from the strongest to the weakest. */
export const LEVEL_LABELS: Record<PageLevel, string> = {
  owner: '소유자',
  editor: '편집 가능',
  commenter: '댓글 가능',
  viewer: '보기 가능',
};

/** The short names on the permission badge. */
export const LEVEL_BADGE_LABELS: Record<PageLevel, string> = {
  owner: '소유자',
  editor: '편집자',
  commenter: '댓글 작성자',
  viewer: '보기',
};

export const LEVEL_DESCRIPTIONS: Record<PageLevel, string> = {
  owner: '문서를 보고, 편집하고, 공유를 관리할 수 있습니다.',
  editor: '문서를 보고 편집할 수 있습니다.',
  commenter: '문서를 보고 댓글을 달 수 있습니다.',
  viewer: '문서를 볼 수만 있습니다.',
};

import type { PageSharingEntry, PageSharingResponse } from '@shared/page-sharing';

export function isPageLevel(value: unknown): value is PageLevel {
  return value === 'owner' || value === 'editor' || value === 'commenter' || value === 'viewer';
}

/** What a row of the access list lets an owner do. */
export type RowControl = 'fixed' | 'editable' | 'former';

/**
 * An owner's own row and any owner row show their level and offer nothing, so a page cannot be
 * left without an owner from the dialog; a grant to an account or team that is gone can only be
 * removed; every other row can be changed and removed.
 */
export function rowControl(entry: PageSharingEntry): RowControl {
  if (entry.former) return 'former';
  return entry.permission === 'owner' || entry.isYou ? 'fixed' : 'editable';
}

export function canRemoveRow(entry: PageSharingEntry): boolean {
  return rowControl(entry) !== 'fixed' && entry.grantId !== undefined;
}

/** The level an editable row's selector shows. */
export function selectedLevel(entry: PageSharingEntry): 'viewer' | 'commenter' | 'editor' {
  return entry.permission === 'owner' ? 'editor' : entry.permission;
}

export function entryLabel(entry: PageSharingEntry): string {
  if (entry.name === null) {
    return entry.entityType === 'team' ? '삭제된 팀' : '조직을 떠난 계정';
  }
  return entry.name;
}

/** A line under a row, when the grant needs explaining. */
export function entryNote(entry: PageSharingEntry): string | null {
  if (entry.noEffect) return '팀 멤버가 아니라 효과 없음';
  return null;
}

export function baselineText(baseline: PageSharingResponse['baseline']): string {
  if (baseline.kind === 'team') {
    // What a plain member holds without a grant follows the team's own setting
    const action = baseline.level === 'editor' ? '편집할' : '볼';
    return `'${baseline.name}' 팀의 멤버는 이 문서를 ${action} 수 있습니다. 팀의 소유자와 관리자는 문서를 관리할 수 있습니다.`;
  }
  if (baseline.kind === 'organization') {
    return '권한이 지정되지 않은 문서입니다. 조직의 모든 구성원이 볼 수 있습니다.';
  }
  return '아래에 있는 사람과 팀만 이 문서에 접근할 수 있습니다.';
}

export type PublicControlValue = 'off' | 'viewer' | 'commenter';

/**
 * What the public access control shows for the combined public level of the page: the level it is
 * honoured as, and a note when the stored level is above what a public grant can carry.
 */
export function publicControl(publicAccess: PageSharingResponse['publicAccess']): {
  value: PublicControlValue;
  cappedNote: string | null;
} {
  if (!publicAccess) return { value: 'off', cappedNote: null };
  return {
    value: publicAccess.level,
    cappedNote: publicAccess.storedLevel
      ? `이전에 '${publicAccess.storedLevel}'로 저장되어 있지만 '${LEVEL_LABELS[publicAccess.level]}'으로 적용됩니다.`
      : null,
  };
}

/** What the dialog shows: the manager's controls, or the read-only list. */
export function dialogMode(data: Pick<PageSharingResponse, 'canManage'>): 'manage' | 'readonly' {
  return data.canManage ? 'manage' : 'readonly';
}

/** The header button: the dialog for an owner, the list for other readers, a plain copy otherwise. */
export function headerAction(data: Pick<PageSharingResponse, 'canManage'> | null | undefined): {
  kind: 'copy-link' | 'manage' | 'readonly';
  label: string;
} {
  if (!data) return { kind: 'copy-link', label: '링크 공유' };
  return data.canManage
    ? { kind: 'manage', label: '문서 공유' }
    : { kind: 'readonly', label: '접근 권한 보기' };
}

/** How the shared page reads an answer of /api/share/:token. */
export function shareLinkState(
  status: number,
  body: { code?: unknown; message?: unknown } | null
): 'ok' | 'expired' | 'password' | 'gone' {
  if (status >= 200 && status < 300) return 'ok';
  if (status === 403) return body?.code === 'link_expired' ? 'expired' : 'password';
  return 'gone';
}
