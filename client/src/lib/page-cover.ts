import {
  PAGE_COVER_DEFAULT_OFFSET_Y,
  PAGE_COVER_IMAGE_PATH,
  pageCoverSchema,
  type PageCover,
} from '@shared/schema';

/**
 * Client helpers for page covers (issue #134): the vertical position control and the cover
 * image upload. Covers come from page metadata and are validated with the shared schema before
 * anything reaches `style` or `src` (`readPageCover` in shared/schema.ts).
 */

/** One arrow key press moves the cover this many percent; Page Up/Down move it further. */
export const COVER_OFFSET_STEP = 5;
export const COVER_OFFSET_PAGE_STEP = 20;

/** Image types the upload service keeps as images (server/services/upload.ts). */
export const COVER_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
export const COVER_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export function clampCoverOffset(value: number): number {
  if (!Number.isFinite(value)) return PAGE_COVER_DEFAULT_OFFSET_Y;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * The offset after dragging the image `deltaY` pixels in a cover `height` pixels tall. Dragging
 * the image down shows more of its top, so the offset goes down.
 */
export function offsetAfterDrag(start: number, deltaY: number, height: number): number {
  if (!(height > 0)) return clampCoverOffset(start);
  return clampCoverOffset(start - (deltaY / height) * 100);
}

/**
 * The offset after a key press on the position slider, or null for a key it ignores. Up (or
 * right) raises the value, which shows a lower part of the image: the image moves up.
 */
export function offsetAfterKey(offset: number, key: string): number | null {
  switch (key) {
    case 'ArrowUp':
    case 'ArrowRight':
      return clampCoverOffset(offset + COVER_OFFSET_STEP);
    case 'ArrowDown':
    case 'ArrowLeft':
      return clampCoverOffset(offset - COVER_OFFSET_STEP);
    case 'PageUp':
      return clampCoverOffset(offset + COVER_OFFSET_PAGE_STEP);
    case 'PageDown':
      return clampCoverOffset(offset - COVER_OFFSET_PAGE_STEP);
    case 'Home':
      return 0;
    case 'End':
      return 100;
    default:
      return null;
  }
}

/** Why a cover image upload failed, in words the editor shows. */
export class CoverUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CoverUploadError';
  }
}

/**
 * Uploads `file` through the existing upload route and returns it as an image cover. A team
 * page's image is stored for that team (the route checks membership), so only its members can
 * load it, like other uploads.
 */
export async function uploadCoverImage(file: File, teamId: number | null): Promise<PageCover> {
  if (!COVER_IMAGE_TYPES.includes(file.type)) {
    throw new CoverUploadError('PNG, JPEG, GIF, WebP 이미지만 커버로 쓸 수 있습니다.');
  }
  if (file.size > COVER_IMAGE_MAX_BYTES) {
    throw new CoverUploadError('5MB 이하의 이미지를 올리세요.');
  }
  const form = new FormData();
  form.append('files', file);
  if (teamId != null) form.append('teamId', String(teamId));
  let response: Response;
  try {
    response = await fetch(teamId != null ? `/api/upload?teamId=${teamId}` : '/api/upload', {
      method: 'POST',
      body: form,
      credentials: 'include',
    });
  } catch {
    throw new CoverUploadError('이미지를 올리지 못했습니다. 잠시 후 다시 시도하세요.');
  }
  if (!response.ok) {
    throw new CoverUploadError(
      response.status === 403
        ? '이 워크스페이스에 이미지를 올릴 권한이 없습니다.'
        : '이미지를 올리지 못했습니다. 잠시 후 다시 시도하세요.'
    );
  }
  const body = await response.json().catch(() => null);
  const path = body?.files?.[0]?.url;
  const cover = pageCoverSchema.safeParse({
    type: 'image',
    path,
    offsetY: PAGE_COVER_DEFAULT_OFFSET_Y,
  });
  if (typeof path !== 'string' || !PAGE_COVER_IMAGE_PATH.test(path) || !cover.success) {
    // The upload service names files from the original name; an unusual name cannot be a cover.
    throw new CoverUploadError(
      '이 이미지는 커버로 쓸 수 없습니다. 파일 이름을 바꿔 다시 올리세요.'
    );
  }
  return cover.data;
}
