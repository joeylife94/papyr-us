import type { QueryClient } from '@tanstack/react-query';

/**
 * Client side of the Markdown vault export and import (#113 P2-D2): GET /api/vault/export and
 * POST /api/vault/import, both scoped like the page tree (a team name, or the team-less pages).
 */

export interface VaultImportSummary {
  created: Array<{
    id: number;
    title: string;
    slug: string;
    parentId: number | null;
    path: string;
  }>;
  skipped: Array<{ path: string; reason: string }>;
  unresolvedLinks: Array<{ path: string; target: string }>;
  unresolvedLinkCount: number;
}

/** A refused or failed vault request; `status` is the HTTP status (0 when the request failed). */
export class VaultRequestError extends Error {
  constructor(public readonly status: number) {
    super(`vault request failed: ${status}`);
    this.name = 'VaultRequestError';
  }
}

function scopeQuery(teamName: string | null): string {
  return teamName ? `?teamId=${encodeURIComponent(teamName)}` : '';
}

/** The file name a `Content-Disposition` header suggests, preferring the UTF-8 form. */
export function fileNameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1]);
    } catch {
      // Fall back to the plain parameter.
    }
  }
  return /filename="([^"]+)"/i.exec(header)?.[1] ?? null;
}

/** Downloads the scope's vault as a `.zip` and returns the file name it was saved as. */
export async function downloadVault(teamName: string | null): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`/api/vault/export${scopeQuery(teamName)}`, { credentials: 'include' });
  } catch {
    throw new VaultRequestError(0);
  }
  if (!response.ok) throw new VaultRequestError(response.status);
  const blob = await response.blob();
  const name =
    fileNameFromDisposition(response.headers.get('Content-Disposition')) ?? 'papyrus-vault.zip';
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked after the browser has started the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return name;
}

/** Uploads `files` (one `.zip` or several `.md`) into the scope and returns the summary. */
export async function importVault(
  teamName: string | null,
  files: File[]
): Promise<VaultImportSummary> {
  const form = new FormData();
  for (const file of files) form.append('files', file, file.name);
  let response: Response;
  try {
    response = await fetch(`/api/vault/import${scopeQuery(teamName)}`, {
      method: 'POST',
      body: form,
      credentials: 'include',
    });
  } catch {
    throw new VaultRequestError(0);
  }
  if (!response.ok) throw new VaultRequestError(response.status);
  return response.json();
}

/** Upload limits, as the server enforces them (shown in the dialog). */
export const VAULT_UPLOAD_LIMIT_BYTES = 10 * 1024 * 1024;

const SKIP_REASONS: Record<string, string> = {
  'not-markdown': 'Markdown 파일이 아님',
  'too-large': '1MB를 넘는 파일',
  'too-deep': '폴더가 너무 깊음',
  duplicate: '같은 이름의 파일이 이미 있음',
};

export function skipReasonLabel(reason: string): string {
  return SKIP_REASONS[reason] ?? '가져올 수 없는 파일';
}

export function exportFailureMessage(error: unknown): string {
  const status = error instanceof VaultRequestError ? error.status : 0;
  if (status === 401) return '로그인이 필요합니다.';
  if (status === 403) return '이 워크스페이스의 문서를 내보낼 권한이 없습니다.';
  return '잠시 후 다시 시도하세요.';
}

export function importFailureMessage(error: unknown): string {
  const status = error instanceof VaultRequestError ? error.status : 0;
  if (status === 401) return '로그인이 필요합니다.';
  if (status === 403) return '이 워크스페이스에 문서를 가져올 권한이 없습니다.';
  if (status === 413) {
    return '파일이 너무 큽니다. 10MB, 500개 항목, 압축을 풀어 20MB까지 가져올 수 있습니다.';
  }
  if (status === 400) {
    return '가져올 수 없는 파일입니다. .zip 하나 또는 .md 파일을 선택하세요. 암호가 걸린 압축 파일이나 안전하지 않은 경로는 가져오지 않습니다.';
  }
  return '잠시 후 다시 시도하세요.';
}

const REFRESHED_PREFIXES = ['/api/pages', '/api/folders', '/api/knowledge-graph', '/api/tags'];

/** Refreshes the page tree, document lists and other page listings after an import. */
export function refreshPageListings(queryClient: QueryClient) {
  return queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey[0];
      return typeof key === 'string' && REFRESHED_PREFIXES.some((prefix) => key.startsWith(prefix));
    },
  });
}
