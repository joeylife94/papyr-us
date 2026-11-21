/**
 * What a person is told when posting or editing a comment fails. A 503 carries the server's fixed
 * message (the comment was not stored and the draft stays in the box); any other failure gets the
 * generic text, never a server detail.
 */
export async function commentFailureMessage(
  response: { status: number; json: () => Promise<unknown> },
  fallback: string
): Promise<string> {
  if (response.status !== 503) return fallback;
  try {
    const body = (await response.json()) as { message?: unknown };
    return typeof body?.message === 'string' && body.message ? body.message : fallback;
  } catch {
    return fallback;
  }
}
