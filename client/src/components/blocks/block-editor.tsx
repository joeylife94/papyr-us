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
} from 'lucide-react';
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
      const newBlock: Block = {
        id: `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type,
        content: '',
        properties: {},
        order: index,
        children: [],
      };

      if (useYjs && yjsCollaboration.isConnected) {
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
      if (useYjs && yjsCollaboration.isConnected) {
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
      if (useYjs && yjsCollaboration.isConnected) {
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
            />
          </div>
        );
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
      className="block-editor min-h-[400px] p-4 relative"
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

      {/* 실시간 협업 상태 표시 */}
      {pageId && (
        <div className="flex items-center justify-between mb-4 p-2 bg-gray-50 rounded-lg">
          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-1">
              {useYjs ? (
                // Yjs CRDT collaboration status
                <>
                  {yjsCollaboration.isConnected ? (
                    <Wifi className="h-4 w-4 text-green-500" />
                  ) : (
                    <WifiOff className="h-4 w-4 text-red-500" />
                  )}
                  <span className="text-sm text-gray-600">
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
                    <Wifi className="h-4 w-4 text-green-500" />
                  ) : (
                    <WifiOff className="h-4 w-4 text-red-500" />
                  )}
                  <span className="text-sm text-gray-600">
                    {collaboration.isConnected ? '실시간 연결됨' : '연결 끊김'}
                  </span>
                </>
              )}
            </div>

            {useYjs
              ? // Yjs user count
                yjsCollaboration.userCount > 0 && (
                  <div className="flex items-center space-x-1">
                    <Users className="h-4 w-4 text-blue-500" />
                    <span className="text-sm text-gray-600">
                      {yjsCollaboration.userCount}명 참여 중
                    </span>
                  </div>
                )
              : // Legacy user count
                collaboration.users.length > 0 && (
                  <div className="flex items-center space-x-1">
                    <Users className="h-4 w-4 text-blue-500" />
                    <span className="text-sm text-gray-600">
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
              <Badge variant="outline" className="text-xs text-blue-600">
                {collaboration.typingUsers.length}명 입력 중...
              </Badge>
            )}
          </div>
        </div>
      )}
      {blocks.length === 0 ? (
        <div className="flex items-center justify-center h-64 border-2 border-dashed border-gray-300 rounded-lg hover:border-gray-400 transition-colors">
          <div className="text-center space-y-4">
            <Plus className="h-8 w-8 mx-auto text-gray-400" />
            <p className="text-gray-500">첫 번째 블록을 추가하세요</p>
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
                  'synced_block',
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
                    {type === 'synced_block' && '동기화'}
                  </span>
                </Button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {blocks.map((block, index) => renderBlock(block, index))}

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
                <DropdownMenuItem onClick={() => addBlock(blocks.length, 'synced_block')}>
                  <Link2 className="h-4 w-4 mr-2" />
                  동기화 블록
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
