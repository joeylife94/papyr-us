import { Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { rowTitle } from '@/lib/inline-database';
import type { DatabaseField, DatabaseRowRecord } from '@shared/inline-database';
import { DatabaseCell } from './database-cell';
import { PropertyTypeIcon } from './database-properties';
import type { DatabaseActions } from './inline-database';

/** Every property of one row, editable for editors (the board's "열기", and on small screens). */
export function DatabaseRowDialog({
  row,
  fields,
  canEdit,
  focusTitle,
  actions,
  onClose,
}: {
  row: DatabaseRowRecord | null;
  fields: DatabaseField[];
  canEdit: boolean;
  focusTitle: boolean;
  actions: DatabaseActions;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!row} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        {row && (
          <>
            <DialogHeader>
              <DialogTitle className="truncate">{rowTitle(fields, row)}</DialogTitle>
              <DialogDescription>
                {canEdit ? '행의 속성을 편집합니다.' : '행의 속성입니다.'}
              </DialogDescription>
            </DialogHeader>
            <dl className="space-y-2">
              {fields.map((field) => (
                <div key={field.id} className="grid grid-cols-[8rem_1fr] items-start gap-2">
                  <dt className="flex items-center gap-1.5 pt-1.5 text-sm text-muted-foreground">
                    <PropertyTypeIcon type={field.type} />
                    <span className="truncate">{field.name}</span>
                  </dt>
                  <dd className="min-w-0 rounded-md border border-border">
                    <DatabaseCell
                      field={field}
                      value={row.data?.[field.id]}
                      label={field.name}
                      readOnly={!canEdit}
                      autoFocus={focusTitle && field.type === 'title'}
                      onCommit={(value) => actions.commitCell(row, field, value)}
                      onCreateOption={(name) => actions.createOption(field.id, name)}
                    />
                  </dd>
                </div>
              ))}
            </dl>
            {canEdit && (
              <div className="flex justify-end pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    actions.deleteRow(row);
                    onClose();
                  }}
                >
                  <Trash2 className="mr-1 h-4 w-4" />행 삭제
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
