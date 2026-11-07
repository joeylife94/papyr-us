/**
 * Server state of an inline database (#113 §4): the schema and its rows through react-query.
 * Edits apply to the cache at once and roll back when the server refuses them. Other editors'
 * changes arrive by polling every 15 seconds and on window focus; a poll that lands while one of
 * this database's edits is in flight is discarded, so it never flashes an older state.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { applyRowChange, type RowPlace } from '@/lib/inline-database';
import type {
  AddFieldInput,
  DatabaseCellValue,
  DatabaseField,
  DatabaseRowRecord,
  DatabaseSchemaRecord,
  UpdateFieldInput,
} from '@shared/inline-database';

export const DATABASE_POLL_MS = 15_000;

export class DatabaseRequestError extends Error {
  constructor(public status: number) {
    super(`Database request failed (${status})`);
  }
}

async function send<T>(method: string, url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'include',
  });
  if (!response.ok) throw new DatabaseRequestError(response.status);
  return (response.status === 204 ? undefined : await response.json()) as T;
}

export const databaseSchemaKey = (schemaId: number | null) => ['inline-database', schemaId];
export const databaseRowsKey = (schemaId: number | null) => ['inline-database', schemaId, 'rows'];
const mutationKey = (schemaId: number) => ['inline-database-edit', schemaId];

/** Creates the database a new block points at, on a page the caller edits. */
export function createDatabase(pageId: number, name: string, fields: DatabaseField[]) {
  return send<DatabaseSchemaRecord>('POST', '/api/database/schemas', { pageId, name, fields });
}

function usePolledQuery<T>(key: unknown[], url: string, schemaId: number | null) {
  const queryClient = useQueryClient();
  return useQuery<T, DatabaseRequestError>({
    queryKey: key,
    queryFn: async () => {
      const data = await send<T>('GET', url);
      const editing = schemaId ? queryClient.isMutating({ mutationKey: mutationKey(schemaId) }) : 0;
      return editing > 0 ? (queryClient.getQueryData<T>(key) ?? data) : data;
    },
    enabled: !!schemaId,
    refetchInterval: DATABASE_POLL_MS,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
    retry: false,
  });
}

export function useDatabaseSchema(schemaId: number | null) {
  return usePolledQuery<DatabaseSchemaRecord>(
    databaseSchemaKey(schemaId),
    `/api/database/schemas/${schemaId}`,
    schemaId
  );
}

export function useDatabaseRows(schemaId: number | null) {
  return usePolledQuery<DatabaseRowRecord[]>(
    databaseRowsKey(schemaId),
    `/api/database/schemas/${schemaId}/rows`,
    schemaId
  );
}

export interface RowChange {
  rowId: number;
  values?: Record<string, DatabaseCellValue | null>;
  place?: RowPlace;
}

export function useDatabaseMutations(schemaId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const schemaKey = databaseSchemaKey(schemaId);
  const rowsKey = databaseRowsKey(schemaId);
  const key = mutationKey(schemaId);

  const failed = (title: string, error: unknown) => {
    const status = error instanceof DatabaseRequestError ? error.status : 0;
    toast({
      title,
      description:
        status === 403 || status === 404
          ? '이 데이터베이스를 편집할 권한이 없습니다.'
          : status === 409
            ? '현재 상태에서는 이 변경을 적용할 수 없습니다.'
            : '변경 사항을 되돌렸습니다. 잠시 후 다시 시도하세요.',
      variant: 'destructive',
    });
  };

  /** Applies `update` to a cached value now; returns how to undo it. */
  const optimistic = async <T>(cacheKey: unknown[], update: (value: T) => T) => {
    await queryClient.cancelQueries({ queryKey: cacheKey });
    const previous = queryClient.getQueryData<T>(cacheKey);
    if (previous !== undefined) queryClient.setQueryData<T>(cacheKey, update(previous));
    return () => {
      if (previous !== undefined) queryClient.setQueryData<T>(cacheKey, previous);
      void queryClient.invalidateQueries({ queryKey: cacheKey });
    };
  };

  const setSchema = (schema: DatabaseSchemaRecord) => queryClient.setQueryData(schemaKey, schema);

  const updateRow = useMutation({
    mutationKey: key,
    mutationFn: ({ rowId, values, place }: RowChange) =>
      send<DatabaseRowRecord>('PATCH', `/api/database/rows/${rowId}`, {
        ...(values ? { data: values } : {}),
        ...(place ?? {}),
      }),
    onMutate: ({ rowId, values, place }) =>
      optimistic<DatabaseRowRecord[]>(rowsKey, (rows) =>
        applyRowChange(rows, rowId, { values, place })
      ),
    onError: (error, _change, undo) => {
      undo?.();
      failed('행을 저장하지 못했습니다', error);
    },
    onSuccess: (row, change) => {
      if (change.place) {
        // Other rows were renumbered on the server.
        void queryClient.invalidateQueries({ queryKey: rowsKey });
      } else {
        queryClient.setQueryData<DatabaseRowRecord[]>(rowsKey, (rows) =>
          rows?.map((candidate) => (candidate.id === row.id ? row : candidate))
        );
      }
    },
  });

  const createRow = useMutation({
    mutationKey: key,
    mutationFn: (values: Record<string, DatabaseCellValue | null>) =>
      send<DatabaseRowRecord>('POST', '/api/database/rows', { schemaId, data: values }),
    onSuccess: (row) => {
      queryClient.setQueryData<DatabaseRowRecord[]>(rowsKey, (rows) =>
        rows && !rows.some((candidate) => candidate.id === row.id) ? [...rows, row] : rows
      );
    },
    onError: (error) =>
      failed(
        error instanceof DatabaseRequestError && error.status === 409
          ? '행을 더 만들 수 없습니다 (최대 5,000개)'
          : '행을 만들지 못했습니다',
        error
      ),
  });

  const deleteRow = useMutation({
    mutationKey: key,
    mutationFn: (rowId: number) => send<void>('DELETE', `/api/database/rows/${rowId}`),
    onMutate: (rowId) =>
      optimistic<DatabaseRowRecord[]>(rowsKey, (rows) => rows.filter((row) => row.id !== rowId)),
    onError: (error, _rowId, undo) => {
      undo?.();
      failed('행을 삭제하지 못했습니다', error);
    },
  });

  const renameDatabase = useMutation({
    mutationKey: key,
    mutationFn: (name: string) =>
      send<DatabaseSchemaRecord>('PATCH', `/api/database/schemas/${schemaId}`, { name }),
    onMutate: (name) =>
      optimistic<DatabaseSchemaRecord>(schemaKey, (schema) => ({ ...schema, name })),
    onError: (error, _name, undo) => {
      undo?.();
      failed('데이터베이스 이름을 바꾸지 못했습니다', error);
    },
    onSuccess: setSchema,
  });

  const addField = useMutation({
    mutationKey: key,
    mutationFn: (field: AddFieldInput & { id: string }) =>
      send<DatabaseSchemaRecord>('POST', `/api/database/schemas/${schemaId}/fields`, field),
    onMutate: (field) =>
      optimistic<DatabaseSchemaRecord>(schemaKey, (schema) => ({
        ...schema,
        fields: [
          ...schema.fields,
          {
            id: field.id,
            name: field.name,
            type: field.type,
            ...(field.type === 'select' || field.type === 'multi_select'
              ? { options: field.options ?? [] }
              : {}),
          },
        ],
      })),
    onError: (error, _field, undo) => {
      undo?.();
      failed('속성을 추가하지 못했습니다', error);
    },
    onSuccess: setSchema,
  });

  const updateField = useMutation({
    mutationKey: key,
    mutationFn: ({ fieldId, changes }: { fieldId: string; changes: UpdateFieldInput }) =>
      send<DatabaseSchemaRecord>(
        'PATCH',
        `/api/database/schemas/${schemaId}/fields/${encodeURIComponent(fieldId)}`,
        changes
      ),
    onMutate: ({ fieldId, changes }) =>
      optimistic<DatabaseSchemaRecord>(schemaKey, (schema) => ({
        ...schema,
        fields: schema.fields.map((field) => {
          if (field.id !== fieldId) return field;
          const type = changes.type ?? field.type;
          const next: DatabaseField = { id: field.id, name: changes.name ?? field.name, type };
          if (type === 'select' || type === 'multi_select') {
            next.options = changes.options ?? field.options ?? [];
          }
          return next;
        }),
      })),
    onError: (error, _change, undo) => {
      undo?.();
      failed('속성을 바꾸지 못했습니다', error);
    },
    onSuccess: setSchema,
  });

  const deleteField = useMutation({
    mutationKey: key,
    mutationFn: (fieldId: string) =>
      send<DatabaseSchemaRecord>(
        'DELETE',
        `/api/database/schemas/${schemaId}/fields/${encodeURIComponent(fieldId)}`
      ),
    onMutate: async (fieldId) => {
      const undoSchema = await optimistic<DatabaseSchemaRecord>(schemaKey, (schema) => ({
        ...schema,
        fields: schema.fields.filter((field) => field.id !== fieldId),
      }));
      const undoRows = await optimistic<DatabaseRowRecord[]>(rowsKey, (rows) =>
        rows.map((row) => {
          if (!(fieldId in (row.data ?? {}))) return row;
          const data = { ...row.data };
          delete data[fieldId];
          return { ...row, data };
        })
      );
      return () => {
        undoSchema();
        undoRows();
      };
    },
    onError: (error, _fieldId, undo) => {
      undo?.();
      failed('속성을 삭제하지 못했습니다', error);
    },
    onSuccess: setSchema,
  });

  return { updateRow, createRow, deleteRow, renameDatabase, addField, updateField, deleteField };
}

export type DatabaseMutations = ReturnType<typeof useDatabaseMutations>;
