/**
 * Small request helper for the organization screens (issue #124 X1c). A refused request becomes
 * an OrganizationApiError that carries the server's own words (`message`, `code`, `reasons`);
 * the screens turn it into text for the person. No status code or JSON is ever shown as is.
 */
export class OrganizationApiError extends Error {
  constructor(
    readonly status: number,
    readonly serverMessage: string | undefined,
    readonly code?: string,
    readonly reasons?: string[]
  ) {
    super(serverMessage ?? `Request failed (${status})`);
    this.name = 'OrganizationApiError';
  }
}

export async function organizationRequest<T>(
  url: string,
  init?: { method?: string; body?: unknown }
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: init?.method ?? 'GET',
      credentials: 'include',
      headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new OrganizationApiError(0, undefined);
  }
  if (!response.ok) {
    let body: { message?: unknown; code?: unknown; reasons?: unknown } = {};
    try {
      body = await response.json();
    } catch {
      // Not JSON: only the status is known.
    }
    throw new OrganizationApiError(
      response.status,
      typeof body.message === 'string' ? body.message : undefined,
      typeof body.code === 'string' ? body.code : undefined,
      Array.isArray(body.reasons)
        ? body.reasons.filter((reason): reason is string => typeof reason === 'string')
        : undefined
    );
  }
  // An answer with no body (204, as team removal gives) has nothing to read.
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** The server asked the caller to try again: the organization is busy with another change. */
export function isBusy(error: unknown): boolean {
  return error instanceof OrganizationApiError && error.status === 503;
}
