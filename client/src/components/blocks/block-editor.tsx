import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Block, BlockType } from '@shared/schema';
import { HeadingBlock } from './heading-block';
import { ParagraphBlock } from './paragraph-block';
import { CheckboxBlock } from './checkbox-block';
import { ImageBlock } from './image-block';
import { TableBlock } from './table-block';
import { CodeBlock } from './code-block';
import { QuoteBlock } from './quote-block';
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

interface BlockEditorProps {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
  teamName?: string;
  pageId?: number;
  userId?: string;
  userName?: string;
}

export function BlockEditor({
  blocks,
  onChange,
  teamName,
  pageId,
  userId,
  userName,
}: BlockEditorProps) {
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);

  // 실시간 협업 설정
  const collaboration = useCollaboration(
    pageId || 0,
    userId || 'anonymous',
    userName || 'Anonymous User',
    teamName
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

      const newBlocks = [...blocks];
      newBlocks.splice(index, 0, newBlock);

      // 순서 재정렬
      newBlocks.forEach((block, idx) => {
        block.order = idx;
      });

      onChange(newBlocks);
      setFocusedBlockId(newBlock.id);

      // 실시간 협업: 추가 변경사항 전송
      if (pageId && collaboration.isConnected) {
        collaboration.sendDocumentChange({
          pageId,
          blockId: newBlock.id,
          type: 'insert',
          data: { blocks: newBlocks },
        });
      }
    },
    [blocks, onChange, pageId, collaboration]
  );

  // 블록 삭제 함수
  const deleteBlock = useCallback(
    (blockId: string) => {
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
    },
    [blocks, onChange, pageId, collaboration]
  );

  // 블록 업데이트 함수
  const updateBlock = useCallback(
    (blockId: string, updates: Partial<Block>) => {
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
    },
    [blocks, onChange, pageId, collaboration]
  );

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
            <ParagraphBlock {...commonProps} />
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
      default:
        return <AlignLeft className="h-4 w-4" />;
    }
  };

  return (
    <div className="block-editor min-h-[400px] p-4">
      {/* 실시간 협업 상태 표시 */}
      {pageId && (
        <div className="flex items-center justify-between mb-4 p-2 bg-gray-50 rounded-lg">
          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-1">
              {collaboration.isConnected ? (
                <Wifi className="h-4 w-4 text-green-500" />
              ) : (
                <WifiOff className="h-4 w-4 text-red-500" />
              )}
              <span className="text-sm text-gray-600">
                {collaboration.isConnected ? '실시간 연결됨' : '연결 끊김'}
              </span>
            </div>

            {collaboration.users.length > 0 && (
              <div className="flex items-center space-x-1">
                <Users className="h-4 w-4 text-blue-500" />
                <span className="text-sm text-gray-600">
                  {collaboration.users.length}명 참여 중
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-2">
            {collaboration.users.map((user) => (
              <Badge key={user.id} variant="secondary" className="text-xs">
                {user.name}
              </Badge>
            ))}

            {collaboration.typingUsers.length > 0 && (
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
                  'image',
                  'table',
                  'code',
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
                    {type === 'image' && '이미지'}
                    {type === 'table' && '테이블'}
                    {type === 'code' && '코드'}
                    {type === 'quote' && '인용'}
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
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}
    </div>
  );
}
