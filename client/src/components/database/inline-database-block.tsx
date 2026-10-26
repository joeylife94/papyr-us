import { useEffect, useRef, useState } from 'react';
import { Database } from 'lucide-react';
import type { Block } from '@shared/schema';
import {
  DEFAULT_DATABASE_NAME,
  defaultDatabaseFields,
  readDatabaseProperties,
} from '@/lib/inline-database';
import type { DatabaseSchemaRecord } from '@shared/inline-database';
import { createDatabase } from './use-inline-database';
import { InlineDatabase } from './inline-database';

// One creation per block, even when React mounts the block twice (StrictMode, remounts).
const pendingCreations = new Map<string, Promise<DatabaseSchemaRecord>>();

/**
 * The `database_inline` block in the editor (#113 §4, P2-D3). The block stores `schemaId` and
 * the view configuration in `properties`, and the database name as its `content` (so search
 * finds it); rows and properties are server state. A new block creates its database once the
 * page exists: on a page that is not created yet (E2's lazy creation) the block's text starts
 * the page, and the database is made when the block is shown on the created page.
 */
export function InlineDatabaseBlock({
  block,
  pageId,
  onUpdate,
}: {
  block: Block;
  pageId?: number;
  onUpdate: (updates: Partial<Block>) => void;
}) {
  const config = readDatabaseProperties(block.properties);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const name = block.content.trim() || DEFAULT_DATABASE_NAME;
  // The creation resolves later: by then the editor's blocks may have changed, so it must call
  // the latest `onUpdate` (an older one would write back older blocks).
  const latest = useRef({ onUpdate, properties: block.properties });
  latest.current = { onUpdate, properties: block.properties };

  // The name doubles as the block's text: it makes a new page "touched" and keeps search working.
  useEffect(() => {
    if (!block.content.trim()) onUpdate({ content: DEFAULT_DATABASE_NAME });
    // Only when the block first appears without a name.
  }, []);

  useEffect(() => {
    if (config.schemaId || !pageId) return;
    let cancelled = false;
    let creation = pendingCreations.get(block.id);
    if (!creation) {
      creation = createDatabase(pageId, name, defaultDatabaseFields());
      pendingCreations.set(block.id, creation);
    }
    setFailed(false);
    creation.then(
      (schema) => {
        if (cancelled) return;
        latest.current.onUpdate({
          content: schema.name,
          properties: {
            ...(latest.current.properties ?? {}),
            schemaId: schema.id,
            activeView: 'table',
          },
        });
      },
      () => {
        pendingCreations.delete(block.id);
        if (!cancelled) setFailed(true);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [config.schemaId, pageId, block.id, attempt]);

  if (!config.schemaId) {
    return (
      <div
        role="status"
        className="my-2 flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground"
      >
        <Database className="h-4 w-4 shrink-0" aria-hidden />
        {!pageId ? (
          '문서가 만들어지면 데이터베이스가 준비됩니다.'
        ) : failed ? (
          <>
            데이터베이스를 만들지 못했습니다.
            <button
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
              className="text-foreground underline underline-offset-2"
            >
              다시 시도
            </button>
          </>
        ) : (
          '데이터베이스를 만드는 중…'
        )}
      </div>
    );
  }

  return (
    <InlineDatabase
      schemaId={config.schemaId}
      config={config}
      readOnly={false}
      onConfigChange={(next) =>
        onUpdate({
          properties: {
            ...(block.properties ?? {}),
            schemaId: next.schemaId,
            activeView: next.activeView,
            views: next.views,
          },
        })
      }
      onNameChange={(next) => onUpdate({ content: next })}
    />
  );
}
