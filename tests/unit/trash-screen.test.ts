import { describe, expect, it } from 'vitest';
import {
  emptyTrashScopeText,
  failureMessage,
  restoredMessage,
  sortFavorites,
} from '../../client/src/lib/trash-screen';

describe('failureMessage: a refused trash action says why, never nothing', () => {
  it('names the missing owner right for a 403 and uses the server reason when it gives one', () => {
    expect(failureMessage('restore', 403, null)).toMatch(/소유자/);
    expect(
      failureMessage('restore', 403, {
        error: '함께 삭제된 하위 문서 중 복원할 권한이 없는 문서가 있어 복원할 수 없습니다',
      })
    ).toBe('함께 삭제된 하위 문서 중 복원할 권한이 없는 문서가 있어 복원할 수 없습니다');
    expect(
      failureMessage('delete', 403, { message: 'Insufficient permissions: owner required' })
    ).toMatch(/소유자/);
  });

  it('says the page is no longer in the trash for a 404', () => {
    expect(failureMessage('restore', 404, null)).toMatch(/휴지통에 없/);
    expect(failureMessage('delete', 404, null)).toMatch(/휴지통에 없/);
  });

  it('says it failed, with the status, for a 500 and anything else', () => {
    for (const status of [500, 502, 0]) {
      const text = failureMessage('delete', status, null);
      expect(text).toMatch(/영구 삭제하지 못했습니다/);
      expect(text).toContain(String(status));
    }
    expect(failureMessage('restore', 500, null)).toMatch(/복원하지 못했습니다/);
    expect(failureMessage('empty', 403, null)).toMatch(/플랫폼 관리자/);
  });
});

describe('restoredMessage', () => {
  it('counts the pages that came back, the page and its subtree', () => {
    expect(restoredMessage('계획', 1)).toBe('"계획" 문서를 복원했습니다.');
    expect(restoredMessage('계획', 3)).toBe(
      '"계획" 문서와 하위 문서 2개를 포함해 3개를 복원했습니다.'
    );
  });

  it('falls back to the page alone for a missing or invalid count', () => {
    for (const count of [undefined, null, 0, -1, 1.5, '3' as any]) {
      expect(restoredMessage('계획', count as any)).toBe('"계획" 문서를 복원했습니다.');
    }
  });
});

describe('emptyTrashScopeText: the confirmation names the team and how many pages go', () => {
  it('names the team and the number of pages shown', () => {
    const text = emptyTrashScopeText('디자인팀', 3);
    expect(text).toMatch(/"디자인팀" 팀/);
    expect(text).toMatch(/3개/);
    expect(text).toMatch(/영구 삭제/);
  });
});

describe('sortFavorites: the sidebar order does not change between loads', () => {
  const row = (id: number, createdAt: string) => ({ id, createdAt });
  it('puts the newest favourite first and breaks ties by id', () => {
    const rows = [
      row(1, '2025-01-01T00:00:00Z'),
      row(3, '2025-01-02T00:00:00Z'),
      row(2, '2025-01-02T00:00:00Z'),
    ];
    expect(sortFavorites(rows).map((r) => r.id)).toEqual([3, 2, 1]);
    expect(sortFavorites([...rows].reverse()).map((r) => r.id)).toEqual([3, 2, 1]);
  });
  it('does not change its input', () => {
    const rows = [row(1, '2025-01-01T00:00:00Z'), row(2, '2025-01-02T00:00:00Z')];
    sortFavorites(rows);
    expect(rows.map((r) => r.id)).toEqual([1, 2]);
  });
});
