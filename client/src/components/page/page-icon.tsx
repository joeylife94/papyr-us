import { useState } from 'react';
import { FileText, SmilePlus, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { isSingleEmoji } from '@shared/schema';

/**
 * A page's icon wherever the page appears (issue #103 E4): the emoji, or a document glyph when the
 * page has none. Decorative next to the title, so it is hidden from screen readers.
 */
export function PageIcon({
  icon,
  className,
  fallback = true,
}: {
  icon?: string | null;
  className?: string;
  /** Show the document glyph when there is no icon (lists); headers show nothing instead. */
  fallback?: boolean;
}) {
  if (icon) {
    return (
      <span
        aria-hidden="true"
        data-page-icon={icon}
        className={cn('shrink-0 leading-none', className)}
      >
        {icon}
      </span>
    );
  }
  if (!fallback) return null;
  return (
    <FileText aria-hidden="true" className={cn('h-3.5 w-3.5 shrink-0 opacity-60', className)} />
  );
}

const ICON_GROUPS: Array<{ label: string; icons: Array<[string, string]> }> = [
  {
    label: '문서',
    icons: [
      ['📄', '문서 page document'],
      ['📝', '메모 note memo'],
      ['📚', '책 자료 books'],
      ['📖', '읽기 가이드 book guide'],
      ['📋', '체크리스트 클립보드 checklist'],
      ['🗂️', '폴더 분류 folder index'],
      ['📌', '고정 핀 pin'],
      ['🔖', '북마크 bookmark'],
      ['📎', '첨부 clip attachment'],
      ['🗒️', '노트 notepad'],
    ],
  },
  {
    label: '작업',
    icons: [
      ['✅', '완료 체크 done check'],
      ['🎯', '목표 goal target'],
      ['🚀', '출시 로켓 launch rocket'],
      ['🛠️', '도구 작업 tools'],
      ['⚙️', '설정 settings'],
      ['📅', '일정 달력 calendar schedule'],
      ['⏰', '마감 알람 deadline'],
      ['📈', '성장 지표 chart growth'],
      ['📊', '보고서 통계 report stats'],
      ['🧪', '실험 테스트 experiment test'],
      ['🐛', '버그 bug'],
      ['🔍', '검색 조사 search research'],
    ],
  },
  {
    label: '사람·팀',
    icons: [
      ['👥', '팀 사람들 team people'],
      ['🤝', '협업 합의 partnership'],
      ['💬', '대화 회의 chat meeting'],
      ['📣', '공지 announcement'],
      ['🎉', '축하 celebration'],
      ['👋', '환영 온보딩 welcome onboarding'],
      ['🧑‍💻', '개발자 developer'],
      ['🎨', '디자인 design'],
    ],
  },
  {
    label: '사물·장소',
    icons: [
      ['💡', '아이디어 idea'],
      ['🔑', '열쇠 키 key'],
      ['🔒', '보안 잠금 security lock'],
      ['🏠', '홈 home'],
      ['🏢', '회사 office company'],
      ['📦', '패키지 배포 package'],
      ['🧭', '방향 나침반 compass'],
      ['🗺️', '지도 로드맵 map roadmap'],
      ['💰', '예산 돈 budget money'],
      ['🎓', '학습 교육 learning'],
    ],
  },
  {
    label: '자연·기호',
    icons: [
      ['⭐', '별 중요 star'],
      ['🔥', '긴급 불 urgent fire'],
      ['⚡', '빠른 번개 fast'],
      ['🌱', '시작 새싹 seed start'],
      ['🌍', '세계 global world'],
      ['☀️', '해 sun'],
      ['❤️', '하트 heart'],
      ['⚠️', '주의 경고 warning'],
      ['❓', '질문 question'],
      ['🧩', '퍼즐 통합 puzzle'],
    ],
  },
];

const ICON_NAMES = new Map(
  ICON_GROUPS.flatMap((group) => group.icons).map(([icon, keywords]) => [
    icon,
    keywords.split(' ')[0],
  ])
);

interface PickerProps {
  icon: string | null | undefined;
  onChange: (icon: string | null) => void;
}

/**
 * Header icon for editors: the icon itself (or "아이콘 추가") opens a searchable picker. The picker
 * is a combobox (cmdk): type a Korean or English word to filter, arrows to move, Enter to choose.
 * Pasting or typing an emoji offers it directly.
 */
export function PageIconPicker({ icon, onChange }: PickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const typed = query.trim();
  const typedEmoji = isSingleEmoji(typed);
  const choose = (next: string | null) => {
    onChange(next);
    setOpen(false);
    setQuery('');
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <PopoverTrigger asChild>
        {icon ? (
          <button
            type="button"
            aria-label={`페이지 아이콘 변경 (현재 ${ICON_NAMES.get(icon) ?? icon})`}
            data-testid="page-icon-button"
            className="-ml-1 inline-flex h-14 w-14 items-center justify-center rounded-lg text-[44px] leading-none transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span aria-hidden="true" data-page-icon={icon}>
              {icon}
            </span>
          </button>
        ) : (
          <button
            type="button"
            data-testid="page-icon-button"
            className="-ml-1 inline-flex h-7 items-center gap-1.5 rounded-md px-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <SmilePlus className="h-4 w-4" aria-hidden="true" />
            아이콘 추가
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[22rem] p-0">
        <Command label="페이지 아이콘 선택" loop>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="아이콘 검색 (예: 문서, 로켓) 또는 이모지 입력"
          />
          <CommandList className="max-h-72">
            {!typedEmoji && <CommandEmpty>일치하는 아이콘이 없습니다</CommandEmpty>}
            {typedEmoji && (
              // forceMount: cmdk's fuzzy filter does not match emoji, so keep this group visible.
              <CommandGroup heading="입력한 이모지" forceMount>
                <CommandItem forceMount value={`typed ${typed}`} onSelect={() => choose(typed)}>
                  <span aria-hidden="true" className="text-xl">
                    {typed}
                  </span>
                  <span>이 이모지 사용</span>
                </CommandItem>
              </CommandGroup>
            )}
            {icon && (
              <CommandGroup>
                <CommandItem value="remove 제거 삭제 없음" onSelect={() => choose(null)}>
                  <X className="h-4 w-4" aria-hidden="true" />
                  아이콘 제거
                </CommandItem>
              </CommandGroup>
            )}
            {ICON_GROUPS.map((group) => (
              <CommandGroup
                key={group.label}
                heading={group.label}
                className="[&_[cmdk-group-items]]:grid [&_[cmdk-group-items]]:grid-cols-8 [&_[cmdk-group-items]]:gap-0.5"
              >
                {group.icons.map(([emoji, keywords]) => (
                  <CommandItem
                    key={emoji}
                    value={`${emoji} ${keywords}`}
                    onSelect={() => choose(emoji)}
                    title={keywords.split(' ')[0]}
                    className="h-9 w-9 justify-center p-0 text-xl"
                  >
                    <span aria-hidden="true">{emoji}</span>
                    <span className="sr-only">{keywords.split(' ')[0]}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
