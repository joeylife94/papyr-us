import type { ViewMode, TabType } from './types';

// ─── 테이블 컬럼 정의 ────────────────────────────────────────────────────────

export const PAGE_COLUMNS = [
  { key: 'title', label: '제목', type: 'text' as const, sortable: true },
  { key: 'folder', label: '폴더', type: 'text' as const, sortable: true },
  { key: 'author', label: '작성자', type: 'text' as const, sortable: true },
  { key: 'createdAt', label: '작성일', type: 'date' as const, sortable: true },
  { key: 'tagsDisplay', label: '태그', type: 'text' as const },
  { key: 'actions', label: '작업', type: 'action' as const },
];

export const TASK_COLUMNS = [
  { key: 'title', label: '제목', type: 'text' as const, sortable: true },
  {
    key: 'status',
    label: '상태',
    type: 'select' as const,
    sortable: true,
    filterable: true,
    options: [
      { value: 'todo', label: '할 일' },
      { value: 'in-progress', label: '진행 중' },
      { value: 'review', label: '검토' },
      { value: 'done', label: '완료' },
    ],
  },
  {
    key: 'priority',
    label: '우선순위',
    type: 'select' as const,
    sortable: true,
    filterable: true,
    options: [
      { value: 'low', label: '낮음' },
      { value: 'medium', label: '보통' },
      { value: 'high', label: '높음' },
    ],
  },
  { key: 'assignedTo', label: '담당자', type: 'text' as const, sortable: true },
  { key: 'dueDate', label: '마감일', type: 'date' as const, sortable: true },
  { key: 'actions', label: '작업', type: 'action' as const },
];

export const FILE_COLUMNS = [
  { key: 'filename', label: '파일명', type: 'text' as const, sortable: true },
  { key: 'mimetype', label: '타입', type: 'text' as const, sortable: true },
  { key: 'size', label: '크기', type: 'number' as const, sortable: true },
  { key: 'created', label: '업로드일', type: 'date' as const, sortable: true },
  { key: 'actions', label: '작업', type: 'action' as const },
];

// ─── 칸반 컬럼 ───────────────────────────────────────────────────────────────

export const KANBAN_COLUMNS = [
  { id: 'todo', title: '할 일', color: '#6b7280' },
  { id: 'in-progress', title: '진행 중', color: '#f59e0b' },
  { id: 'review', title: '검토', color: '#3b82f6' },
  { id: 'done', title: '완료', color: '#10b981' },
];

// ─── 색상 유틸 ───────────────────────────────────────────────────────────────

/** 칸반 카드 우선순위 점 — Tailwind className 반환 */
const PRIORITY_CLASS_MAP: Record<string, string> = {
  high: 'bg-red-500',
  medium: 'bg-amber-500',
  low: 'bg-emerald-500',
};
export const getPriorityColor = (priority: string): string =>
  PRIORITY_CLASS_MAP[priority] ?? 'bg-gray-400';

/** 갤러리/뱃지 상태 — hex 반환 (inline style에 사용) */
const STATUS_HEX_MAP: Record<string, string> = {
  todo: '#6b7280',
  'in-progress': '#f59e0b',
  review: '#3b82f6',
  done: '#10b981',
  published: '#10b981',
  draft: '#6b7280',
  image: '#3b82f6',
  file: '#8b5cf6',
};
export const getStatusColor = (status: string): string => STATUS_HEX_MAP[status] ?? '#6b7280';

// ─── 탭별 지원 뷰 모드 ───────────────────────────────────────────────────────

export const SUPPORTED_VIEWS: Record<TabType, ViewMode[]> = {
  pages: ['table', 'gallery'],
  tasks: ['table', 'kanban', 'gallery'],
  files: ['table', 'gallery'],
};
