/**
 * The one reader of a page id in a URL, used by every gate and handler that acts on a page, so
 * the page a gate checks is the page the handler acts on. Only plain decimal digits without a
 * sign, a leading zero, an exponent or any other text, and within the database's integer range;
 * everything else names no page.
 */
import type { Response } from 'express';

/** The largest page id the database holds; a larger one names no page. */
export const MAX_PAGE_ID = 2147483647;

export function parsePageIdParam(raw: unknown): number | null {
  if (typeof raw !== 'string' || !/^[1-9][0-9]*$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id <= MAX_PAGE_ID ? id : null;
}

/** The page id a gate checked, left for the handler behind it. */
export function checkedPageId(res: Response): number {
  return res.locals.pageId as number;
}
