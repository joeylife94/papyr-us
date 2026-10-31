import { describe, expect, it } from 'vitest';
import { describeVersion } from '../../client/src/lib/version-history';

describe('describeVersion', () => {
  it('labels the checkpoints the save pipeline records', () => {
    expect(describeVersion('Before editing session')).toEqual({
      kind: 'editing-session',
      label: '편집 시작 전',
    });
    expect(describeVersion('Before restore')).toEqual({ kind: 'restore', label: '복원 전' });
    expect(describeVersion('Version 12')).toEqual({ kind: 'manual-save', label: '저장 전' });
  });

  it('shows any other description as written, and nothing when there is none', () => {
    expect(describeVersion('Imported from Markdown')).toEqual({
      kind: 'other',
      label: 'Imported from Markdown',
    });
    expect(describeVersion(null)).toBeNull();
    expect(describeVersion('   ')).toBeNull();
  });
});
