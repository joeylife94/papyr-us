import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, Move, Trash2, Upload } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  CoverUploadError,
  COVER_IMAGE_TYPES,
  offsetAfterDrag,
  offsetAfterKey,
  uploadCoverImage,
} from '@/lib/page-cover';
import {
  PAGE_COVER_PRESETS,
  PAGE_COVER_PRESET_IDS,
  type PageCover as PageCoverValue,
} from '@shared/schema';

/**
 * Page covers (issue #134): a banner above the title, either a built-in preset (fixed CSS from
 * shared/schema.ts) or an image uploaded to this instance. Callers pass a cover that went through
 * `readPageCover`, so only validated values reach `style` and `src`. The art is decorative: the
 * image has empty alt text and the preset is hidden from screen readers.
 */

const COVER_FRAME = 'relative h-36 w-full overflow-hidden rounded-lg bg-muted sm:h-48';

interface CoverArtProps {
  cover: PageCoverValue;
  /** Vertical position to show instead of the stored one (while repositioning). */
  offsetY?: number;
  onImageError?: () => void;
}

function CoverArt({ cover, offsetY, onImageError }: CoverArtProps) {
  if (cover.type === 'preset') {
    return (
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{ background: PAGE_COVER_PRESETS[cover.id].background }}
      />
    );
  }
  return (
    <img
      src={cover.path}
      alt=""
      draggable={false}
      onError={onImageError}
      className="absolute inset-0 h-full w-full select-none object-cover"
      style={{ objectPosition: `50% ${offsetY ?? cover.offsetY}%` }}
    />
  );
}

/** Whether the image of `cover` failed to load; resets when the cover changes. */
function useImageFailed(cover: PageCoverValue | null) {
  const key = cover?.type === 'image' ? cover.path : null;
  const [failedKey, setFailedKey] = useState<string | null>(null);
  return {
    failed: key !== null && failedKey === key,
    onImageError: () => setFailedKey(key),
  };
}

/**
 * The cover as readers see it: no controls. An image the viewer may not load (a share link
 * viewer without access to the upload, a removed file) shows no cover at all.
 */
export function PageCover({
  cover,
  className,
}: {
  cover: PageCoverValue | null;
  className?: string;
}) {
  const { failed, onImageError } = useImageFailed(cover);
  if (!cover || failed) return null;
  return (
    <div
      data-testid="page-cover"
      data-cover-type={cover.type}
      data-cover-preset={cover.type === 'preset' ? cover.id : undefined}
      className={cn(COVER_FRAME, className)}
    >
      <CoverArt cover={cover} onImageError={onImageError} />
    </div>
  );
}

interface PickerProps {
  cover: PageCoverValue | null;
  /** The page's team: an uploaded image is stored for it, like other uploads. */
  teamId: number | null;
  onChange: (cover: PageCoverValue) => void;
  children: React.ReactNode;
}

/** Popover to choose a preset or upload an image; `children` is the trigger button. */
function PageCoverPicker({ cover, teamId, onChange, children }: PickerProps) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const choose = (next: PageCoverValue) => {
    onChange(next);
    setOpen(false);
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      choose(await uploadCoverImage(file, teamId));
    } catch (error) {
      toast({
        title: '커버 이미지 업로드 실패',
        description: error instanceof CoverUploadError ? error.message : '잠시 후 다시 시도하세요.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" aria-label="커버 선택" className="w-[20rem] space-y-4 p-3">
        <div role="group" aria-labelledby="page-cover-presets-label">
          <p
            id="page-cover-presets-label"
            className="mb-2 text-xs font-medium text-muted-foreground"
          >
            기본 커버
          </p>
          <div className="grid grid-cols-5 gap-2">
            {PAGE_COVER_PRESET_IDS.map((id) => {
              const current = cover?.type === 'preset' && cover.id === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-label={PAGE_COVER_PRESETS[id].label}
                  aria-pressed={current}
                  title={PAGE_COVER_PRESETS[id].label}
                  data-cover-preset-option={id}
                  onClick={() => choose({ type: 'preset', id })}
                  className={cn(
                    'h-10 rounded-md border border-border transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    current && 'ring-2 ring-primary ring-offset-2'
                  )}
                  style={{ background: PAGE_COVER_PRESETS[id].background }}
                />
              );
            })}
          </div>
        </div>
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs font-medium text-muted-foreground">이미지</p>
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Upload className="h-4 w-4" aria-hidden="true" />
            )}
            {uploading ? '올리는 중…' : '이미지 업로드'}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept={COVER_IMAGE_TYPES.join(',')}
            className="hidden"
            data-testid="page-cover-file-input"
            onChange={(event) => void upload(event.target.files?.[0])}
          />
          <p className="text-xs text-muted-foreground">PNG, JPEG, GIF, WebP · 5MB 이하</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

const QUIET_BUTTON =
  'inline-flex h-7 items-center gap-1.5 rounded-md px-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** "커버 추가" for a page without a cover (shown next to the icon control). */
export function AddPageCoverButton({
  teamId,
  onChange,
}: {
  teamId: number | null;
  onChange: (cover: PageCoverValue) => void;
}) {
  return (
    <PageCoverPicker cover={null} teamId={teamId} onChange={onChange}>
      <button type="button" className={QUIET_BUTTON}>
        <ImagePlus className="h-4 w-4" aria-hidden="true" />
        커버 추가
      </button>
    </PageCoverPicker>
  );
}

const OVERLAY_BUTTON =
  'inline-flex h-7 items-center gap-1.5 rounded-md bg-background/90 px-2 text-xs font-medium text-foreground shadow-sm backdrop-blur transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * The cover for editors: "커버 변경", "위치 조정" (image covers) and "커버 제거" on the banner.
 * Repositioning shows a vertical slider over the image: drag it, or use the arrow, Page Up/Down,
 * Home and End keys; Enter or "위치 저장" saves, Escape or "취소" keeps the old position.
 */
export function EditablePageCover({
  cover,
  teamId,
  onChange,
}: {
  cover: PageCoverValue;
  teamId: number | null;
  onChange: (cover: PageCoverValue | null) => void;
}) {
  const { failed, onImageError } = useImageFailed(cover);
  const [draft, setDraft] = useState<number | null>(null);
  const slider = useRef<HTMLDivElement>(null);
  const adjustButton = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ pointerId: number; startY: number; startOffset: number } | null>(null);
  const repositioning = draft !== null && cover.type === 'image';

  useEffect(() => {
    if (repositioning) slider.current?.focus();
  }, [repositioning]);

  // Another cover (a new image, a preset) ends any repositioning of the old one.
  const coverKey = cover.type === 'image' ? cover.path : cover.id;
  useEffect(() => setDraft(null), [coverKey]);

  const finish = (save: boolean) => {
    if (save && draft !== null && cover.type === 'image' && draft !== cover.offsetY) {
      onChange({ ...cover, offsetY: draft });
    }
    setDraft(null);
    drag.current = null;
    // Back to the control that started it, once it is shown again.
    requestAnimationFrame(() => adjustButton.current?.focus());
  };

  return (
    <div
      data-testid="page-cover"
      data-cover-type={cover.type}
      data-cover-preset={cover.type === 'preset' ? cover.id : undefined}
      className={cn(COVER_FRAME, 'group')}
    >
      {failed ? (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          커버 이미지를 불러올 수 없습니다
        </div>
      ) : (
        <CoverArt cover={cover} offsetY={draft ?? undefined} onImageError={onImageError} />
      )}

      {draft !== null && cover.type === 'image' ? (
        <>
          <div
            ref={slider}
            role="slider"
            tabIndex={0}
            aria-label="커버 세로 위치"
            aria-orientation="vertical"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={draft}
            aria-valuetext={`위에서 ${draft}%`}
            data-testid="page-cover-position"
            className="absolute inset-0 cursor-grab touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:cursor-grabbing"
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                finish(true);
                return;
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                finish(false);
                return;
              }
              const next = offsetAfterKey(draft, event.key);
              if (next !== null) {
                event.preventDefault();
                setDraft(next);
              }
            }}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = {
                pointerId: event.pointerId,
                startY: event.clientY,
                startOffset: draft,
              };
            }}
            onPointerMove={(event) => {
              const active = drag.current;
              if (!active || active.pointerId !== event.pointerId) return;
              const height = event.currentTarget.getBoundingClientRect().height;
              setDraft(offsetAfterDrag(active.startOffset, event.clientY - active.startY, height));
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
          />
          <p className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-md bg-background/90 px-2 py-1 text-xs text-foreground shadow-sm">
            드래그하거나 화살표 키로 위치를 조정하세요
          </p>
          <div className="absolute bottom-2 right-2 flex gap-1">
            <button type="button" className={OVERLAY_BUTTON} onClick={() => finish(true)}>
              위치 저장
            </button>
            <button type="button" className={OVERLAY_BUTTON} onClick={() => finish(false)}>
              취소
            </button>
          </div>
        </>
      ) : (
        // Shown on hover or keyboard focus on wide screens, always on small (touch) screens.
        <div
          role="group"
          aria-label="커버"
          className="absolute bottom-2 right-2 flex gap-1 transition-opacity md:opacity-0 md:focus-within:opacity-100 md:group-hover:opacity-100"
        >
          <PageCoverPicker cover={cover} teamId={teamId} onChange={onChange}>
            <button type="button" className={OVERLAY_BUTTON}>
              <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
              커버 변경
            </button>
          </PageCoverPicker>
          {cover.type === 'image' && !failed && (
            <button
              ref={adjustButton}
              type="button"
              className={OVERLAY_BUTTON}
              onClick={() => setDraft(cover.offsetY)}
            >
              <Move className="h-3.5 w-3.5" aria-hidden="true" />
              위치 조정
            </button>
          )}
          <button type="button" className={OVERLAY_BUTTON} onClick={() => onChange(null)}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            커버 제거
          </button>
        </div>
      )}
    </div>
  );
}
