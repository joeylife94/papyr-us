/**
 * What a page version is, from the `changeDescription` the versions API already returns
 * (issue #101 P6). The save pipeline (server/services/page-save.ts) records versions only at
 * checkpoints: before an editing session's first change, before a manual save, and before a
 * restore. Autosaves never create one.
 */
export type VersionKind = 'editing-session' | 'restore' | 'manual-save' | 'other';

export interface VersionDescription {
  kind: VersionKind;
  label: string;
}

export function describeVersion(
  changeDescription: string | null | undefined
): VersionDescription | null {
  const text = changeDescription?.trim();
  if (!text) return null;
  if (text === 'Before editing session') return { kind: 'editing-session', label: '편집 시작 전' };
  if (text === 'Before restore') return { kind: 'restore', label: '복원 전' };
  if (/^Version \d+$/.test(text)) return { kind: 'manual-save', label: '저장 전' };
  return { kind: 'other', label: text };
}
