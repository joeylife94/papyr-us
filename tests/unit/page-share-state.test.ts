/**
 * The sharing dialog's decisions (WP4), as pure functions: which rows an owner can change, what
 * the public control shows for the combined public level, which control the header offers, the
 * level labels, how a grant that gives nothing is shown, and how the shared page reads an answer
 * for a link. What is drawn (layout, focus, the requests the buttons send) is proven by
 * tests/page-share-ui.spec.ts; the repository has no DOM test setup.
 */
import { describe, it, expect } from 'vitest';
import type { PageSharingEntry } from '../../shared/page-sharing';
import {
  LEVEL_BADGE_LABELS,
  LEVEL_LABELS,
  baselineText,
  canRemoveRow,
  dialogMode,
  entryLabel,
  entryNote,
  headerAction,
  isPageLevel,
  publicControl,
  rowControl,
  selectedLevel,
  shareLinkState,
} from '../../client/src/components/permissions/share-state';
import { strongestPublicLevel } from '../../shared/page-sharing';

const entry = (over: Partial<PageSharingEntry>): PageSharingEntry => ({
  entityType: 'user',
  name: 'Ada',
  permission: 'viewer',
  isYou: false,
  grantId: 1,
  entityId: 2,
  ...over,
});

describe('which rows an owner can change', () => {
  it('owner rows and the owner’s own row are fixed and cannot be removed', () => {
    for (const row of [
      entry({ permission: 'owner' }),
      entry({ isYou: true, permission: 'editor' }),
    ]) {
      expect(rowControl(row)).toBe('fixed');
      expect(canRemoveRow(row)).toBe(false);
    }
  });

  it('other rows are editable and removable; a grant to a gone account or team can only be removed', () => {
    for (const permission of ['viewer', 'commenter', 'editor'] as const) {
      const row = entry({ permission });
      expect(rowControl(row)).toBe('editable');
      expect(canRemoveRow(row)).toBe(true);
      expect(selectedLevel(row)).toBe(permission);
    }
    const gone = entry({ name: null, former: true });
    expect(rowControl(gone)).toBe('former');
    expect(canRemoveRow(gone)).toBe(true);
    expect(canRemoveRow(entry({ grantId: undefined }))).toBe(false);
  });

  it('names a row, and says of an unnamed one what it was', () => {
    expect(entryLabel(entry({}))).toBe('Ada');
    expect(entryLabel(entry({ name: null, former: true }))).toBe('조직을 떠난 계정');
    expect(entryLabel(entry({ name: null, entityType: 'team', former: true }))).toBe('삭제된 팀');
  });

  it('shows a grant that gives nothing with its reason, and only that one', () => {
    expect(entryNote(entry({ noEffect: true }))).toBe('팀 멤버가 아니라 효과 없음');
    expect(entryNote(entry({}))).toBeNull();
  });
});

describe('the public control', () => {
  it('shows off, viewer or commenter for the combined level', () => {
    expect(publicControl(null)).toEqual({ value: 'off', cappedNote: null });
    expect(publicControl({ level: 'viewer' })).toEqual({ value: 'viewer', cappedNote: null });
    expect(publicControl({ level: 'commenter' }).value).toBe('commenter');
  });

  it('explains a stored level above what a public grant carries', () => {
    const state = publicControl({ level: 'viewer', storedLevel: 'editor' });
    expect(state.value).toBe('viewer');
    expect(state.cappedNote).toContain("'editor'");
    expect(state.cappedNote).toContain(LEVEL_LABELS.viewer);
  });

  it('the combined level is the strongest honoured one, whatever the order of the rows', () => {
    const rows = (...levels: string[]) => levels.map((permission) => ({ permission }));
    expect(strongestPublicLevel(rows('bogus', 'viewer'))).toBe('viewer');
    expect(strongestPublicLevel(rows('viewer', 'bogus'))).toBe('viewer');
    expect(strongestPublicLevel(rows('owner', 'commenter'))).toBe('commenter');
    expect(strongestPublicLevel(rows('commenter', 'owner'))).toBe('commenter');
    expect(strongestPublicLevel(rows('editor'))).toBe('viewer');
    expect(strongestPublicLevel(rows('bogus', 'x'))).toBeNull();
    expect(strongestPublicLevel([])).toBeNull();
  });
});

describe('what each kind of caller is offered', () => {
  it('an owner manages; another reader sees the list; a caller with no list copies the link', () => {
    expect(dialogMode({ canManage: true })).toBe('manage');
    expect(dialogMode({ canManage: false })).toBe('readonly');
    expect(headerAction({ canManage: true })).toEqual({ kind: 'manage', label: '문서 공유' });
    expect(headerAction({ canManage: false })).toEqual({
      kind: 'readonly',
      label: '접근 권한 보기',
    });
    expect(headerAction(null).kind).toBe('copy-link');
    expect(headerAction(undefined).kind).toBe('copy-link');
  });

  it('labels every level, and only the four are levels', () => {
    for (const level of ['owner', 'editor', 'commenter', 'viewer'] as const) {
      expect(isPageLevel(level)).toBe(true);
      expect(LEVEL_LABELS[level]).toBeTruthy();
      expect(LEVEL_BADGE_LABELS[level]).toBeTruthy();
    }
    expect(isPageLevel('admin')).toBe(false);
    expect(isPageLevel(null)).toBe(false);
  });

  it('says what members get without a grant', () => {
    expect(baselineText({ kind: 'team', name: 'Design', level: 'viewer' })).toContain("'Design'");
    expect(baselineText({ kind: 'organization', level: 'viewer' })).toContain('조직의 모든 구성원');
    expect(baselineText({ kind: 'restricted' })).toContain('아래에 있는 사람');
  });
});

describe('how the shared page reads an answer for a link', () => {
  it('asks for a password only when one is needed; an expired link says so; a gone link is gone', () => {
    expect(shareLinkState(200, null)).toBe('ok');
    expect(shareLinkState(403, { message: 'Password required' })).toBe('password');
    expect(shareLinkState(403, { message: 'Invalid password' })).toBe('password');
    expect(shareLinkState(403, { code: 'link_expired', message: 'Link expired' })).toBe('expired');
    expect(shareLinkState(403, null)).toBe('password');
    expect(shareLinkState(404, null)).toBe('gone');
    expect(shareLinkState(500, null)).toBe('gone');
  });
});
