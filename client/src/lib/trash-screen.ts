/** Wording and ordering rules of the trash screen and the favourites list (pure, unit tested). */

export type TrashAction = 'restore' | 'delete' | 'empty';

const VERB: Record<TrashAction, string> = {
  restore: '복원하지 못했습니다',
  delete: '영구 삭제하지 못했습니다',
  empty: '휴지통을 비우지 못했습니다',
};

/**
 * What a refused trash request says. A 403 names the missing right (the server's own reason is
 * used when it gives a Korean one, e.g. a subtree page the caller does not own), a 404 says the
 * page is no longer in the trash, anything else says the action failed, with its status.
 */
export function failureMessage(action: TrashAction, status: number, body: unknown): string {
  if (status === 403) {
    if (action === 'empty') return '플랫폼 관리자만 휴지통을 비울 수 있습니다.';
    const reason = (body as { error?: unknown } | null)?.error;
    if (typeof reason === 'string' && /[가-힣]/.test(reason)) return reason;
    return `이 문서의 소유자만 ${action === 'restore' ? '복원' : '영구 삭제'}할 수 있습니다.`;
  }
  if (status === 404) return '이 문서는 이미 휴지통에 없습니다. 목록을 새로 불러왔습니다.';
  return `${VERB[action]} (오류 ${status}). 잠시 후 다시 시도해 주세요.`;
}

/** The notice after a restore: how many pages came back (the API's `restoredCount`). */
export function restoredMessage(title: string, restoredCount: unknown): string {
  if (typeof restoredCount === 'number' && Number.isInteger(restoredCount) && restoredCount > 1) {
    return `"${title}" 문서와 하위 문서 ${restoredCount - 1}개를 포함해 ${restoredCount}개를 복원했습니다.`;
  }
  return `"${title}" 문서를 복원했습니다.`;
}

/** The notice after emptying a team's trash: the server's count ("N page(s) permanently deleted"). */
export function emptiedMessage(serverMessage: unknown): string {
  const count =
    typeof serverMessage === 'string'
      ? /^(\d+) page\(s\) permanently deleted$/.exec(serverMessage)
      : null;
  return count ? `문서 ${count[1]}개를 영구 삭제했습니다.` : '휴지통을 비웠습니다.';
}

/** What a refused star says: a page the caller cannot list can never be added, so no "try again". */
export function favoriteFailureMessage(adding: boolean, status: number): string {
  if (adding && status === 404) return '이 문서는 즐겨찾기에 추가할 수 없습니다.';
  return `${adding ? '즐겨찾기에 추가하지 못했습니다' : '즐겨찾기에서 제거하지 못했습니다'}. 잠시 후 다시 시도해 주세요.`;
}

/** What "휴지통 비우기" deletes on a team's trash screen, said in the confirmation. */
export function emptyTrashScopeText(teamLabel: string, shownCount: number): string {
  return `"${teamLabel}" 팀의 휴지통에 있는 문서 ${shownCount}개를 영구 삭제합니다.`;
}

/** Newest favourite first; ties by id, so the sidebar order is the same on every load. */
export function sortFavorites<T extends { id: number; createdAt: string | Date }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() || b.id - a.id
  );
}
