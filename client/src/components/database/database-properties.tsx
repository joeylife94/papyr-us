import { useEffect, useRef, useState } from 'react';
import {
  AlignLeft,
  ArrowDown,
  ArrowUp,
  Calendar,
  ChevronDown,
  CircleDot,
  Hash,
  Link,
  Palette,
  Pencil,
  Plus,
  SquareCheck,
  Tags,
  Trash2,
  Type,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  OPTION_COLOR_LABELS,
  PROPERTY_TYPE_LABELS,
  newDatabaseId,
  nextOptionColor,
  type DatabaseSort,
} from '@/lib/inline-database';
import {
  DATABASE_LIMITS,
  DATABASE_OPTION_COLORS,
  type AddFieldInput,
  type DatabaseField,
  type DatabaseOption,
  type DatabaseOptionColor,
  type DatabasePropertyType,
} from '@shared/inline-database';
import { OptionBadge } from './database-cell';

const TYPE_ICONS: Record<DatabasePropertyType, typeof Type> = {
  title: Type,
  text: AlignLeft,
  number: Hash,
  select: CircleDot,
  multi_select: Tags,
  date: Calendar,
  checkbox: SquareCheck,
  url: Link,
};

export function PropertyTypeIcon({
  type,
  className,
}: {
  type: DatabasePropertyType;
  className?: string;
}) {
  const Icon = TYPE_ICONS[type];
  return <Icon className={cn('h-3.5 w-3.5 shrink-0', className)} aria-hidden />;
}

export const ADDABLE_TYPES: AddFieldInput['type'][] = [
  'text',
  'number',
  'select',
  'multi_select',
  'date',
  'checkbox',
  'url',
];

interface PropertyHeaderProps {
  field: DatabaseField;
  canEdit: boolean;
  sort: DatabaseSort | null;
  /** Types this property may change to now (see allowedTypeChanges). */
  typeChanges: DatabasePropertyType[];
  onSort: (direction: 'asc' | 'desc' | null) => void;
  onRename: (name: string) => void;
  onChangeType: (type: DatabasePropertyType) => void;
  onChangeOptions: (options: DatabaseOption[]) => void;
  onDelete: () => void;
}

/** A column header: the property's name and type, and its menu for editors. */
export function PropertyHeader(props: PropertyHeaderProps) {
  const { field, canEdit, sort } = props;
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingOptions, setEditingOptions] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const sorted = sort?.fieldId === field.id ? sort.direction : null;
  const hasOptions = field.type === 'select' || field.type === 'multi_select';

  const sortMark = sorted && (
    <>
      {sorted === 'asc' ? (
        <ArrowUp className="h-3.5 w-3.5 shrink-0 text-highlight" aria-hidden />
      ) : (
        <ArrowDown className="h-3.5 w-3.5 shrink-0 text-highlight" aria-hidden />
      )}
      <span className="sr-only">
        {sorted === 'asc' ? '(오름차순 정렬됨)' : '(내림차순 정렬됨)'}
      </span>
    </>
  );

  if (!canEdit) {
    return (
      <span className="flex items-center gap-1.5 px-2 py-1.5">
        <PropertyTypeIcon type={field.type} />
        <span className="truncate">{field.name}</span>
        {sortMark}
      </span>
    );
  }

  if (renaming) {
    return (
      <RenameInput
        initial={field.name}
        label="속성 이름"
        maxLength={DATABASE_LIMITS.fieldNameLength}
        onDone={(name) => {
          setRenaming(false);
          if (name && name !== field.name) props.onRename(name);
          requestAnimationFrame(() => buttonRef.current?.focus());
        }}
      />
    );
  }

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            ref={buttonRef}
            type="button"
            aria-label={`${field.name} 속성 메뉴 (${PROPERTY_TYPE_LABELS[field.type]})`}
            className="flex w-full !min-h-0 !min-w-0 items-center gap-1.5 rounded-sm px-2 py-1.5 text-left font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <PropertyTypeIcon type={field.type} />
            <span className="truncate">{field.name}</span>
            {sortMark}
            <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            {PROPERTY_TYPE_LABELS[field.type]} 속성
          </DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => setRenaming(true)}>
            <Pencil />
            이름 바꾸기
          </DropdownMenuItem>
          {field.type !== 'title' && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <PropertyTypeIcon type={field.type} className="h-4 w-4" />
                형식 바꾸기
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-52">
                {ADDABLE_TYPES.map((type) => (
                  <DropdownMenuItem
                    key={type}
                    disabled={type !== field.type && !props.typeChanges.includes(type)}
                    onSelect={() => type !== field.type && props.onChangeType(type)}
                  >
                    <PropertyTypeIcon type={type} className="h-4 w-4" />
                    {PROPERTY_TYPE_LABELS[type]}
                    {type === field.type && <span className="ml-auto text-xs">현재</span>}
                  </DropdownMenuItem>
                ))}
                {props.typeChanges.length < ADDABLE_TYPES.length - 1 && (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground">
                    값이 있는 속성은 텍스트와 URL 사이에서만 바꿀 수 있습니다.
                  </p>
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          {hasOptions && (
            <DropdownMenuItem onSelect={() => setEditingOptions(true)}>
              <Palette />
              옵션 편집
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => props.onSort(sorted === 'asc' ? null : 'asc')}>
            <ArrowUp />
            {sorted === 'asc' ? '정렬 해제' : '오름차순 정렬'}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => props.onSort(sorted === 'desc' ? null : 'desc')}>
            <ArrowDown />
            {sorted === 'desc' ? '정렬 해제' : '내림차순 정렬'}
          </DropdownMenuItem>
          {field.type !== 'title' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => setConfirmDelete(true)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 />
                속성 삭제
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>‘{field.name}’ 속성을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              모든 행에서 이 속성의 값도 함께 삭제됩니다. 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={props.onDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {hasOptions && (
        <OptionsDialog
          open={editingOptions}
          field={field}
          onOpenChange={setEditingOptions}
          onSave={props.onChangeOptions}
        />
      )}
    </>
  );
}

/** An inline name editor: Enter or leaving saves, Esc cancels. */
export function RenameInput({
  initial,
  label,
  maxLength,
  onDone,
  className,
}: {
  initial: string;
  label: string;
  maxLength: number;
  onDone: (name: string | null) => void;
  className?: string;
}) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  const finish = (name: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(name);
  };
  return (
    <input
      ref={inputRef}
      aria-label={label}
      value={value}
      maxLength={maxLength}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => finish(value.trim() || null)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
          event.preventDefault();
          finish(value.trim() || null);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          finish(null);
        }
      }}
      className={cn(
        'w-full min-w-0 rounded-sm border border-input bg-background px-2 py-1 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className
      )}
    />
  );
}

/** "+ 속성": adds a property of the chosen type. */
export function AddPropertyMenu({ onAdd }: { onAdd: (type: AddFieldInput['type']) => void }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="속성 추가"
          className="flex w-full !min-h-0 items-center gap-1 whitespace-nowrap rounded-sm px-2 py-1.5 text-left text-sm font-normal text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          속성
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          속성 추가
        </DropdownMenuLabel>
        {ADDABLE_TYPES.map((type) => (
          <DropdownMenuItem key={type} onSelect={() => onAdd(type)}>
            <PropertyTypeIcon type={type} className="h-4 w-4" />
            {PROPERTY_TYPE_LABELS[type]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Edits a select property's options: names, colors, order of creation, deletion. */
function OptionsDialog({
  open,
  field,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  field: DatabaseField;
  onOpenChange: (open: boolean) => void;
  onSave: (options: DatabaseOption[]) => void;
}) {
  const [options, setOptions] = useState<DatabaseOption[]>(field.options ?? []);
  useEffect(() => {
    if (open) setOptions(field.options ?? []);
  }, [open, field.options]);

  const change = (id: string, changes: Partial<DatabaseOption>) =>
    setOptions((list) =>
      list.map((option) => (option.id === id ? { ...option, ...changes } : option))
    );
  const valid = options.every((option) => option.name.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>‘{field.name}’ 옵션</DialogTitle>
          <DialogDescription>옵션을 삭제하면 그 옵션이 선택된 칸은 비게 됩니다.</DialogDescription>
        </DialogHeader>
        <ul className="max-h-72 space-y-2 overflow-y-auto">
          {options.map((option, index) => (
            <li key={option.id} className="flex items-center gap-2">
              <OptionBadge option={option} className="w-16 shrink-0 justify-center" />
              <input
                aria-label={`옵션 ${index + 1} 이름`}
                value={option.name}
                maxLength={DATABASE_LIMITS.optionNameLength}
                onChange={(event) => change(option.id, { name: event.target.value })}
                className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <select
                aria-label={`옵션 ${index + 1} 색상`}
                value={option.color}
                onChange={(event) =>
                  change(option.id, { color: event.target.value as DatabaseOptionColor })
                }
                className="rounded-md border border-input bg-background px-1.5 py-1.5 text-sm"
              >
                {DATABASE_OPTION_COLORS.map((color) => (
                  <option key={color} value={color}>
                    {OPTION_COLOR_LABELS[color]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-label={`옵션 삭제: ${option.name || index + 1}`}
                onClick={() => setOptions((list) => list.filter((item) => item.id !== option.id))}
                className="inline-flex h-8 w-8 !min-h-0 !min-w-0 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={options.length >= DATABASE_LIMITS.optionsPerField}
          onClick={() =>
            setOptions((list) => [
              ...list,
              {
                id: newDatabaseId('o'),
                name: `옵션 ${list.length + 1}`,
                color: nextOptionColor(list),
              },
            ])
          }
        >
          <Plus className="mr-1 h-4 w-4" />
          옵션 추가
        </Button>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            type="button"
            disabled={!valid}
            onClick={() => {
              onSave(options.map((option) => ({ ...option, name: option.name.trim() })));
              onOpenChange(false);
            }}
          >
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
