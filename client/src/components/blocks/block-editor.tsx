import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Block, BlockType } from '@shared/schema';
import { HeadingBlock } from './heading-block';
import { ParagraphBlock } from './paragraph-block';
import { CheckboxBlock } from './checkbox-block';
import { ImageBlock } from './image-block';
import { TableBlock } from './table-block';
import { CodeBlock } from './code-block';
import { QuoteBlock } from './quote-block';
import { CalloutBlock } from './callout-block';
import { EmbedBlock } from './embed-block';
import { MathBlock } from './math-block';
import { SyncedBlock } from './synced-block';
import {
  Plus,
  Type,
  AlignLeft,
  CheckSquare,
  Image as ImageIcon,
  Table as TableIcon,
  Code,
  Quote,
  Users,
  Wifi,
  WifiOff,
  Lightbulb,
  Video,
  Sigma,
  Link2,
  GripVertical,
} from 'lucide-react';
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
  type ResponderProvided,
} from '@hello-pangea/dnd';
import { cn } from '@/lib/utils';
import { moveBlock as reorderBlocks } from '@/lib/block-order';
import { matchMarkdownShortcut } from '@/lib/markdown-shortcuts';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCollaboration } from '@/lib/socket';
import { Badge } from '@/components/ui/badge';
import { collaborationSync } from '@/lib/collaboration';
import { useYjsCollaboration } from '@/hooks/useYjsCollaboration';
import { UserCursors } from '@/components/collaboration/user-cursor';
import { useFeatureFlags } from '@/features/FeatureFlagsContext';
import { SlashCommandMenu } from './slash-command-menu';
import { InlineFormattingToolbar } from './inline-formatting-toolbar';

interface BlockEditorProps {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
  teamName?: string;
  pageId?: number;
  userId?: string;
  userName?: string;
  useYjs?: boolean; // Enable Yjs CRDT collaboration (default: false)
}

export function BlockEditor({
  blocks,
  onChange,
  teamName,
  pageId,
  userId,
  userName,
  useYjs = false, // Default to false for backward compatibility
}: BlockEditorProps) {
  const { flags } = useFeatureFlags();
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const addBlockRef = useRef<(index: number, type?: BlockType) => void>(() => {});
  const updateBlockRef = useRef<(blockId: string, updates: Partial<Block>) => void>(() => {});
  // Markdown shortcuts (#111 §6): the last conversion, which Ctrl/Cmd+Z can undo until the next
  // edit, and where to put the caret once a converted block has rendered.
  const lastShortcutRef = useRef<{
    blockId: string;
    converted: string;
    literal: string;
    caret: number;
  } | null>(null);
  const pendingCaretRef = useRef<{ blockId: string; position: number } | null>(null);

  // Slash command state
  const [slashMenu, setSlashMenu] = useState<{
    isOpen: boolean;
    position: { top: number; left: number };
    filter: string;
    blockId: string;
  }>({ isOpen: false, position: { top: 0, left: 0 }, filter: '', blockId: '' });

  const handleSlashCommand = useCallback((blockId: string, rect: DOMRect) => {
    setSlashMenu({
      isOpen: true,
      position: { top: rect.top, left: rect.left },
      filter: '',
      blockId,
    });
  }, []);

  const handleSlashFilter = useCallback((filter: string) => {
    setSlashMenu((prev) => ({ ...prev, filter }));
  }, []);

  const handleSlashClose = useCallback(() => {
    setSlashMenu((prev) => ({ ...prev, isOpen: false, filter: '' }));
  }, []);

  const handleSlashSelect = useCallback(
    (type: BlockType) => {
      const blockIndex = blocks.findIndex((b) => b.id === slashMenu.blockId);
      if (blockIndex === -1) return;

      // Remove the slash text from current block content
      const currentBlock = blocks[blockIndex];
      const cleanedContent = currentBlock.content.replace(/\/[^\s]*$/, '').trim();

      if (type === 'paragraph' && cleanedContent === '') {
        // If selecting paragraph on empty block, just keep it
        handleSlashClose();
        return;
      }

      if (cleanedContent === '') {
        // Empty block — just change its type
        updateBlockRef.current(slashMenu.blockId, { content: '', type });
      } else {
        // Block has content — update it, then add new block after
        updateBlockRef.current(slashMenu.blockId, { content: cleanedContent });
        addBlockRef.current(blockIndex + 1, type);
      }

      handleSlashClose();
    },
    [blocks, slashMenu.blockId, handleSlashClose]
  );

  const collaborationEnabled = flags.FEATURE_COLLABORATION && !!pageId && !!userId && !!userName;

  // Yjs CRDT-based collaboration (new, conflict-free)
  const yjsCollaboration = useYjsCollaboration({
    pageId: pageId || 0,
    userId,
    userName,
    enabled: collaborationEnabled && useYjs,
    onBlocksChange: onChange,
    onUsersChange: (users) => {
      console.log('[Yjs] Users changed:', users);
    },
    onUserCountChange: (count) => {
      console.log('[Yjs] User count changed:', count);
    },
    onError: (error) => {
      console.error('[Yjs] Collaboration error:', error);
    },
  });

  // Legacy Socket.IO collaboration (old, timestamp-based conflict resolution)
  const collaboration = useCollaboration(
    pageId || 0,
    userId || 'anonymous',
    userName || 'Anonymous User',
    teamName,
    { enabled: collaborationEnabled && !useYjs }
  );

  // 원격 변경사항 처리
  useEffect(() => {
    if (!collaboration.socket) return;

    const handleDocumentChange = (change: any) => {
      // validate payload and ignore own changes
      if (!change || typeof change !== 'object') return;
      if (change.userId && change.userId === userId) return;

      console.log('Received remote change:', change);

      // 충돌 해결 및 블록 업데이트
      const updatedBlocks = collaborationSync.processRemoteChange(change, blocks);
      if (updatedBlocks !== blocks) {
        onChange(updatedBlocks);
      }
    };

    collaboration.socket.on('document-change', handleDocumentChange);

    const handleCursorUpdate = (payload: any) => {
      // ignore own
      if (!payload || payload.userId === userId) return;
      // future: render live cursor for user
    };

    const handleTypingStart = (payload: any) => {
      // handled by useCollaboration's state
    };

    const handleTypingStop = (payload: any) => {
      // handled by useCollaboration's state
    };

    collaboration.socket.on('cursor-update', handleCursorUpdate);
    collaboration.socket.on('typing-start', handleTypingStart);
    collaboration.socket.on('typing-stop', handleTypingStop);

    return () => {
      collaboration.socket?.off('document-change', handleDocumentChange);
      collaboration.socket?.off('cursor-update', handleCursorUpdate);
      collaboration.socket?.off('typing-start', handleTypingStart);
      collaboration.socket?.off('typing-stop', handleTypingStop);
    };
  }, [collaboration.socket, blocks, onChange, userId]);

  const typingTimerRef = useRef<number | null>(null);

  // 블록 추가 함수
  const addBlock = useCallback(
    (index: number, type: BlockType = 'paragraph') => {
      lastShortcutRef.current = null;
      const newBlock: Block = {
        id: `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type,
        content: '',
        properties: {},
        order: index,
        children: [],
      };

      // Route edits through Yjs only once the shared document has synced; before that the
      // Y.Array can be shorter than the local blocks and index-based edits would be dropped.
      if (useYjs && yjsCollaboration.isSynced) {
        // Yjs CRDT: Conflict-free insertion
        yjsCollaboration.insertBlock(index, newBlock);
      } else {
        // Legacy: Manual conflict resolution
        const newBlocks = [...blocks];
        newBlocks.splice(index, 0, newBlock);

        // 순서 재정렬
        newBlocks.forEach((block, idx) => {
          block.order = idx;
        });

        onChange(newBlocks);

        // 실시간 협업: 추가 변경사항 전송
        if (pageId && collaboration.isConnected) {
          collaboration.sendDocumentChange({
            pageId,
            blockId: newBlock.id,
            type: 'insert',
            data: { blocks: newBlocks },
          });
        }
      }

      setFocusedBlockId(newBlock.id);
    },
    [blocks, onChange, pageId, collaboration, useYjs, yjsCollaboration]
  );

  // 블록 삭제 함수
  const deleteBlock = useCallback(
    (blockId: string) => {
      lastShortcutRef.current = null;
      if (useYjs && yjsCollaboration.isSynced) {
        // Yjs CRDT: Find index and delete
        const index = blocks.findIndex((b) => b.id === blockId);
        if (index !== -1) {
          yjsCollaboration.deleteBlock(index);
        }
      } else {
        // Legacy: Manual conflict resolution
        const newBlocks = blocks.filter((block) => block.id !== blockId);
        newBlocks.forEach((block, idx) => {
          block.order = idx;
        });
        onChange(newBlocks);

        // 실시간 협업: 삭제 변경사항 전송
        if (pageId && collaboration.isConnected) {
          collaboration.sendDocumentChange({
            pageId,
            blockId,
            type: 'delete',
            data: { blocks: newBlocks },
          });
        }
      }
    },
    [blocks, onChange, pageId, collaboration, useYjs, yjsCollaboration]
  );

  // 블록 업데이트 함수
  const updateBlock = useCallback(
    (blockId: string, updates: Partial<Block>) => {
      // Any edit ends the window in which Ctrl/Cmd+Z undoes a markdown shortcut.
      lastShortcutRef.current = null;
      if (useYjs && yjsCollaboration.isSynced) {
        // Yjs CRDT: Find index and update
        const index = blocks.findIndex((b) => b.id === blockId);
        if (index !== -1) {
          yjsCollaboration.updateBlock(index, updates);
        }
      } else {
        // Legacy: Manual conflict resolution
        const newBlocks = blocks.map((block) =>
          block.id === blockId ? { ...block, ...updates } : block
        );
        onChange(newBlocks);

        // 실시간 협업: 변경사항 전송
        if (pageId && collaboration.isConnected) {
          collaboration.sendDocumentChange({
            pageId,
            blockId,
            type: 'update',
            data: { blocks: newBlocks },
          });

          // typing start/stop (debounced)
          try {
            collaboration.sendTypingStart();
            if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
            typingTimerRef.current = window.setTimeout(() => {
              collaboration.sendTypingStop();
              typingTimerRef.current = null;
            }, 2000);
          } catch (err) {
            // noop
          }
        }
      }
    },
    [blocks, onChange, pageId, collaboration, useYjs, yjsCollaboration]
  );

  // 블록 이동 함수 (issue #103 E3): drag, Alt+↑/↓ and the drag handle's keyboard mode.
  const moveBlockAt = useCallback(
    (from: number, to: number) => {
      if (from === to || to < 0 || to >= blocks.length) return;
      if (useYjs && yjsCollaboration.isSynced) {
        // Yjs CRDT: one transaction, so collaborators converge on the new order.
        yjsCollaboration.moveBlock(from, to);
      } else {
        // The legacy Socket.IO channel has no move; pages edit through Yjs or autosave.
        onChange(reorderBlocks(blocks, from, to));
      }
    },
    [blocks, onChange, useYjs, yjsCollaboration]
  );

  // Markdown shortcuts (#111 §6). The conversion goes through updateBlock, like the slash menu,
  // so it autosaves and reaches collaborators through Yjs.
  const blockSnapshot = (block: Pick<Block, 'type' | 'content' | 'properties'>) =>
    JSON.stringify([block.type, block.content, block.properties ?? {}]);

  const applyMarkdownShortcut = (block: Block, previous: string, next: string, caret: number) => {
    const match = matchMarkdownShortcut(previous, next, caret);
    if (!match) return false;
    updateBlock(block.id, { type: match.type, content: match.content });
    lastShortcutRef.current = {
      blockId: block.id,
      converted: blockSnapshot({ ...block, type: match.type, content: match.content }),
      literal: next,
      caret,
    };
    pendingCaretRef.current = { blockId: block.id, position: 0 };
    return true;
  };

  // Ctrl/Cmd+Z right after a conversion, before any other edit: back to the literal text.
  const undoMarkdownShortcut = (event: React.KeyboardEvent, block: Block | undefined) => {
    const last = lastShortcutRef.current;
    if (!last || !block || last.blockId !== block.id) return false;
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return false;
    if (event.key.toLowerCase() !== 'z') return false;
    if (blockSnapshot(block) !== last.converted) {
      lastShortcutRef.current = null;
      return false;
    }
    event.preventDefault();
    updateBlock(block.id, { type: 'paragraph', content: last.literal });
    pendingCaretRef.current = { blockId: block.id, position: last.caret };
    return true;
  };

  // A converted (or restored) block is a new component; put the caret where the text continues.
  useEffect(() => {
    const pending = pendingCaretRef.current;
    if (!pending) return;
    const field = editorContainerRef.current?.querySelector<HTMLTextAreaElement>(
      `[data-block-row="${CSS.escape(pending.blockId)}"] textarea`
    );
    if (!field) return;
    pendingCaretRef.current = null;
    field.focus();
    field.setSelectionRange(pending.position, pending.position);
  }, [blocks]);

  // Screen reader feedback for Alt+↑/↓ moves (drags announce through the dnd library).
  const [moveAnnouncement, setMoveAnnouncement] = useState('');

  const handleRowKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (undoMarkdownShortcut(event, blocks[index])) return;
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const to = event.key === 'ArrowUp' ? index - 1 : index + 1;
    if (to < 0 || to >= blocks.length) return;

    // Reordering can move the focused element in the DOM, which drops focus; put it back.
    const active = document.activeElement as HTMLElement | null;
    const caret =
      active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement
        ? [active.selectionStart, active.selectionEnd]
        : null;
    moveBlockAt(index, to);
    setMoveAnnouncement(`블록을 ${to + 1}번째 위치로 옮겼습니다 (${blocks.length}개 중)`);
    requestAnimationFrame(() => {
      if (!active?.isConnected) return;
      if (document.activeElement !== active) active.focus();
      if (caret && (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement)) {
        active.setSelectionRange(caret[0], caret[1]);
      }
    });
  };

  const handleDragEnd = (result: DropResult, provided: ResponderProvided) => {
    if (!result.destination) {
      provided.announce('블록 이동을 취소했습니다');
      return;
    }
    const to = result.destination.index;
    moveBlockAt(result.source.index, to);
    provided.announce(`블록을 ${to + 1}번째 위치에 놓았습니다`);
  };

  // Keep refs in sync so handleSlashSelect can call these without circular dependency
  addBlockRef.current = addBlock;
  updateBlockRef.current = updateBlock;

  // 블록 렌더링 함수
  const renderBlock = (block: Block, index: number) => {
    const commonProps = {
      key: block.id,
      block,
      isFocused: focusedBlockId === block.id,
      onFocus: () => setFocusedBlockId(block.id),
      onBlur: () => setFocusedBlockId(null),
      onUpdate: (updates: Partial<Block>) => updateBlock(block.id, updates),
      onDelete: () => deleteBlock(block.id),
      onAddBlock: (type?: BlockType) => addBlock(index + 1, type),
    };

    switch (block.type) {
      case 'heading1':
      case 'heading2':
      case 'heading3':
        return <HeadingBlock {...commonProps} />;
      case 'paragraph':
        return (
          <div
            onMouseMove={(e) => {
              if (pageId && collaboration.isConnected) {
                try {
                  collaboration.sendCursorUpdate({ x: (e as any).clientX, y: (e as any).clientY });
                } catch (err) {
                  // ignore
                }
              }
            }}
          >
            <ParagraphBlock
              {...commonProps}
              onSlashCommand={(rect) => handleSlashCommand(block.id, rect)}
              onSlashFilter={handleSlashFilter}
              onSlashClose={handleSlashClose}
              onMarkdownShortcut={(previous, next, caret) =>
                applyMarkdownShortcut(block, previous, next, caret)
              }
            />
          </div>
        );
      case 'bulleted_list':
      case 'numbered_list': {
        // List items edit like paragraphs behind a marker. Enter continues the list; Enter on an
        // empty item turns it back into a paragraph.
        let number = 1;
        while (index - number >= 0 && blocks[index - number].type === 'numbered_list') number++;
        return (
          <div key={`list-${block.id}`} className="flex items-start">
            <span
              aria-hidden="true"
              className="w-6 shrink-0 select-none pt-2 text-right leading-relaxed text-muted-foreground"
            >
              {block.type === 'bulleted_list' ? '•' : `${number}.`}
            </span>
            <div className="min-w-0 flex-1">
              <ParagraphBlock
                {...commonProps}
                placeholder="목록"
                onAddBlock={() =>
                  block.content === ''
                    ? updateBlock(block.id, { type: 'paragraph' })
                    : addBlock(index + 1, block.type)
                }
              />
            </div>
          </div>
        );
      }
      case 'checkbox':
        return <CheckboxBlock {...commonProps} />;
      case 'image':
        return <ImageBlock {...commonProps} teamName={teamName} />;
      case 'table':
        return <TableBlock {...commonProps} />;
      case 'code':
        return <CodeBlock {...commonProps} />;
      case 'quote':
        return <QuoteBlock {...commonProps} />;
      case 'callout':
        return (
          <CalloutBlock
            content={block.content}
            color={(block.properties?.color as any) || 'blue'}
            icon={(block.properties?.icon as string) || 'lightbulb'}
            onContentChange={(content: string) => updateBlock(block.id, { content })}
            readOnly={false}
          />
        );
      case 'embed':
        return (
          <EmbedBlock
            url={(block.properties?.url as string) || ''}
            onUrlChange={(url: string) =>
              updateBlock(block.id, { properties: { ...block.properties, url } })
            }
            readOnly={false}
          />
        );
      case 'math':
        return (
          <MathBlock
            expression={block.content}
            displayMode={(block.properties?.displayMode as 'inline' | 'block') || 'block'}
            onExpressionChange={(expression: string) =>
              updateBlock(block.id, { content: expression })
            }
            readOnly={false}
          />
        );
      case 'synced_block':
        return (
          <SyncedBlock
            originalBlockId={block.properties?.originalBlockId as string}
            syncedContent={(block.properties?.syncedContent as any[]) || []}
            isOriginal={(block.properties?.isOriginal as boolean) || false}
            onContentChange={(content: any[]) =>
              updateBlock(block.id, { properties: { ...block.properties, syncedContent: content } })
            }
            onCreateOriginal={() => {
              const originalId = `synced_${Date.now()}`;
              updateBlock(block.id, {
                properties: {
                  ...block.properties,
                  isOriginal: true,
                  originalBlockId: originalId,
                },
              });
            }}
            onUnlink={() => {
              updateBlock(block.id, {
                properties: {
                  ...block.properties,
                  originalBlockId: undefined,
                  isOriginal: false,
                },
              });
            }}
            readOnly={false}
          />
        );
      default:
        return <ParagraphBlock {...commonProps} />;
    }
  };

  // 빈 에디터일 때 기본 블록 추가
  const handleEmptyEditorClick = () => {
    if (blocks.length === 0) {
      addBlock(0, 'paragraph');
    }
  };

  // 블록 타입별 아이콘
  const getBlockTypeIcon = (type: BlockType) => {
    switch (type) {
      case 'heading1':
      case 'heading2':
      case 'heading3':
        return <Type className="h-4 w-4" />;
      case 'paragraph':
        return <AlignLeft className="h-4 w-4" />;
      case 'checkbox':
        return <CheckSquare className="h-4 w-4" />;
      case 'image':
        return <ImageIcon className="h-4 w-4" />;
      case 'table':
        return <TableIcon className="h-4 w-4" />;
      case 'code':
        return <Code className="h-4 w-4" />;
      case 'quote':
        return <Quote className="h-4 w-4" />;
      case 'callout':
        return <Lightbulb className="h-4 w-4" />;
      case 'embed':
        return <Video className="h-4 w-4" />;
      case 'math':
        return <Sigma className="h-4 w-4" />;
      case 'synced_block':
        return <Link2 className="h-4 w-4" />;
      default:
        return <AlignLeft className="h-4 w-4" />;
    }
  };

  return (
    <div
      ref={editorContainerRef}
      className="block-editor relative min-h-[400px] py-2 sm:py-4"
      onMouseMove={(e) => {
        // Update cursor position for Yjs collaboration
        if (useYjs && yjsCollaboration.isConnected && pageId) {
          yjsCollaboration.updateCursor({
            x: e.clientX,
            y: e.clientY,
          });
        }
      }}
    >
      {/* Multi-user cursors (Yjs only) */}
      {useYjs && yjsCollaboration.users.length > 0 && (
        <UserCursors users={yjsCollaboration.users} containerRef={editorContainerRef} />
      )}

      {/* 실시간 협업 상태 표시 (협업 기능이 켜진 경우에만) */}
      {collaborationEnabled && (
        <div className="flex items-center justify-between mb-4 p-2 bg-muted rounded-lg">
          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-1">
              {useYjs ? (
                // Yjs CRDT collaboration status
                <>
                  {yjsCollaboration.isConnected ? (
                    <Wifi className="h-4 w-4 text-success" />
                  ) : (
                    <WifiOff className="h-4 w-4 text-destructive" />
                  )}
                  <span className="text-sm text-foreground-secondary">
                    {yjsCollaboration.isConnected
                      ? yjsCollaboration.isSynced
                        ? '🟢 Yjs 동기화됨'
                        : '🟡 Yjs 연결 중...'
                      : '🔴 Yjs 연결 끊김'}
                  </span>
                </>
              ) : (
                // Legacy Socket.IO collaboration status
                <>
                  {collaboration.isConnected ? (
                    <Wifi className="h-4 w-4 text-success" />
                  ) : (
                    <WifiOff className="h-4 w-4 text-destructive" />
                  )}
                  <span className="text-sm text-foreground-secondary">
                    {collaboration.isConnected ? '실시간 연결됨' : '연결 끊김'}
                  </span>
                </>
              )}
            </div>

            {useYjs
              ? // Yjs user count
                yjsCollaboration.userCount > 0 && (
                  <div className="flex items-center space-x-1">
                    <Users className="h-4 w-4 text-info" />
                    <span className="text-sm text-foreground-secondary">
                      {yjsCollaboration.userCount}명 참여 중
                    </span>
                  </div>
                )
              : // Legacy user count
                collaboration.users.length > 0 && (
                  <div className="flex items-center space-x-1">
                    <Users className="h-4 w-4 text-info" />
                    <span className="text-sm text-foreground-secondary">
                      {collaboration.users.length}명 참여 중
                    </span>
                  </div>
                )}
          </div>

          <div className="flex items-center space-x-2">
            {useYjs
              ? // Yjs active users with color indicators
                yjsCollaboration.users.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center space-x-1 px-2 py-1 rounded text-xs"
                    style={{
                      backgroundColor: `${user.color}20`,
                      borderLeft: `3px solid ${user.color}`,
                    }}
                  >
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: user.color }} />
                    <span className="font-medium">{user.name}</span>
                  </div>
                ))
              : // Legacy user badges
                collaboration.users.map((user) => (
                  <Badge key={user.id} variant="secondary" className="text-xs">
                    {user.name}
                  </Badge>
                ))}

            {!useYjs && collaboration.typingUsers.length > 0 && (
              <Badge variant="outline" className="text-xs text-info">
                {collaboration.typingUsers.length}명 입력 중...
              </Badge>
            )}
          </div>
        </div>
      )}
      {blocks.length === 0 ? (
        <div className="flex items-center justify-center h-64 border-2 border-dashed border-border rounded-lg hover:border-muted-foreground transition-colors">
          <div className="text-center space-y-4">
            <Plus className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">첫 번째 블록을 추가하세요</p>
            <div className="flex flex-wrap justify-center gap-2">
              {(
                [
                  'paragraph',
                  'heading1',
                  'checkbox',
                  'callout',
                  'image',
                  'embed',
                  'table',
                  'code',
                  'math',
                  'quote',
                ] as BlockType[]
              ).map((type) => (
                <Button
                  key={type}
                  variant="outline"
                  size="sm"
                  onClick={() => addBlock(0, type)}
                  className="flex items-center space-x-2"
                >
                  {getBlockTypeIcon(type)}
                  <span>
                    {type === 'paragraph' && '단락'}
                    {type === 'heading1' && '제목'}
                    {type === 'checkbox' && '체크박스'}
                    {type === 'callout' && 'Callout'}
                    {type === 'image' && '이미지'}
                    {type === 'embed' && 'Embed'}
                    {type === 'table' && '테이블'}
                    {type === 'code' && '코드'}
                    {type === 'math' && '수식'}
                    {type === 'quote' && '인용'}
                  </span>
                </Button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <DragDropContext
            onDragStart={(start, provided) =>
              provided.announce(`${start.source.index + 1}번째 블록을 들었습니다`)
            }
            onDragUpdate={(update, provided) => {
              if (update.destination) {
                provided.announce(`${update.destination.index + 1}번째 위치`);
              }
            }}
            onDragEnd={handleDragEnd}
            dragHandleUsageInstructions="스페이스바로 블록을 들고 위아래 화살표로 옮긴 뒤 스페이스바로 놓습니다. Esc로 취소합니다. 블록 안에서는 Alt+위/아래 화살표로도 옮길 수 있습니다."
          >
            <Droppable droppableId="page-blocks">
              {(dropProvided) => (
                <div
                  ref={dropProvided.innerRef}
                  {...dropProvided.droppableProps}
                  className="space-y-1"
                >
                  {blocks.map((block, index) => (
                    <Draggable key={block.id} draggableId={block.id} index={index}>
                      {(dragProvided, snapshot) => (
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          data-block-row={block.id}
                          data-block-type={block.type}
                          onKeyDown={(event) => handleRowKeyDown(event, index)}
                          className={cn(
                            // The gutter hangs into the left margin so text lines up near the title.
                            'group/row relative -ml-4 flex items-start gap-0.5 sm:-ml-12 sm:gap-1',
                            snapshot.isDragging && 'rounded-lg bg-card shadow-lg ring-1 ring-border'
                          )}
                        >
                          {/* Gutter: insert below and the drag handle (keyboard: Space). The
                              targets are 24px on touch screens (WCAG 2.5.8); `!min-*` overrides
                              the global 44px mobile minimum, which would double the gutter. */}
                          <div className="flex w-6 shrink-0 items-center justify-end gap-0.5 pt-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100 [@media(hover:none)]:opacity-60 sm:w-11 sm:pt-2.5">
                            <button
                              type="button"
                              onClick={() => addBlock(index + 1, 'paragraph')}
                              aria-label="아래에 블록 추가"
                              title="아래에 블록 추가"
                              className="hidden h-5 w-5 !min-h-0 !min-w-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:inline-flex"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                            <div
                              {...dragProvided.dragHandleProps}
                              aria-label={`블록 ${index + 1} 이동`}
                              title="드래그해서 이동"
                              data-testid="block-drag-handle"
                              className="inline-flex h-6 w-6 !min-h-0 !min-w-0 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing sm:h-5 sm:w-5"
                            >
                              <GripVertical className="h-4 w-4" />
                            </div>
                          </div>
                          <div className="min-w-0 flex-1">{renderBlock(block, index)}</div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {dropProvided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
          <p className="sr-only" role="status" aria-live="polite">
            {moveAnnouncement}
          </p>

          {/* 마지막에 새 블록 추가 버튼 */}
          <div className="flex justify-center pt-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="opacity-60 hover:opacity-100 transition-opacity"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  블록 추가
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center">
                <DropdownMenuItem onClick={() => addBlock(blocks.length, 'paragraph')}>
                  <AlignLeft className="h-4 w-4 mr-2" />
                  단락
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => addBlock(blocks.length, 'heading1')}>
                  <Type className="h-4 w-4 mr-2" />
                  제목 1
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => addBlock(blocks.length, 'heading2')}>
                  <Type className="h-4 w-4 mr-2" />
                  제목 2
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => addBlock(blocks.length, 'heading3')}>
                  <Type className="h-4 w-4 mr-2" />
                  제목 3
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => addBlock(blocks.length, 'checkbox')}>
                  <CheckSquare className="h-4 w-4 mr-2" />
                  체크박스
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => addBlock(blocks.length, 'image')}>
                  <ImageIcon className="h-4 w-4 mr-2" />
                  이미지
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => addBlock(blocks.length, 'table')}>
                  <TableIcon className="h-4 w-4 mr-2" />
                  테이블
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => addBlock(blocks.length, 'code')}>
                  <Code className="h-4 w-4 mr-2" />
                  코드
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => addBlock(blocks.length, 'quote')}>
                  <Quote className="h-4 w-4 mr-2" />
                  인용
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => addBlock(blocks.length, 'callout')}>
                  <Lightbulb className="h-4 w-4 mr-2" />
                  Callout
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => addBlock(blocks.length, 'embed')}>
                  <Video className="h-4 w-4 mr-2" />
                  Embed
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => addBlock(blocks.length, 'math')}>
                  <Sigma className="h-4 w-4 mr-2" />
                  수식
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}

      {/* Slash Command Menu (Notion-style /) */}
      <SlashCommandMenu
        isOpen={slashMenu.isOpen}
        position={slashMenu.position}
        filter={slashMenu.filter}
        onSelect={handleSlashSelect}
        onClose={handleSlashClose}
      />

      {/* Inline Formatting Toolbar (appears on text selection) */}
      <InlineFormattingToolbar containerRef={editorContainerRef} />
    </div>
  );
}
