import React, { useState, useCallback } from 'react';
import { Block, BlockType } from '@shared/schema';
import { HeadingBlock } from './heading-block';
import { ParagraphBlock } from './paragraph-block';
import { CheckboxBlock } from './checkbox-block';
import { ImageBlock } from './image-block';
import { TableBlock } from './table-block';
import { CodeBlock } from './code-block';
import { QuoteBlock } from './quote-block';
import { Plus, Type, AlignLeft, CheckSquare, Image as ImageIcon, Table as TableIcon, Code, Quote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface BlockEditorProps {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
  teamName?: string;
}

export function BlockEditor({ blocks, onChange, teamName }: BlockEditorProps) {
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);

  // 블록 추가 함수
  const addBlock = useCallback((index: number, type: BlockType = 'paragraph') => {
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
  }, [blocks, onChange]);

  // 블록 삭제 함수
  const deleteBlock = useCallback((blockId: string) => {
    const newBlocks = blocks.filter(block => block.id !== blockId);
    newBlocks.forEach((block, idx) => {
      block.order = idx;
    });
    onChange(newBlocks);
  }, [blocks, onChange]);

  // 블록 업데이트 함수
  const updateBlock = useCallback((blockId: string, updates: Partial<Block>) => {
    const newBlocks = blocks.map(block => 
      block.id === blockId ? { ...block, ...updates } : block
    );
    onChange(newBlocks);
  }, [blocks, onChange]);

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
        return <ParagraphBlock {...commonProps} />;
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
      {blocks.length === 0 ? (
        <div 
          className="flex items-center justify-center h-64 border-2 border-dashed border-gray-300 rounded-lg hover:border-gray-400 transition-colors"
        >
          <div className="text-center space-y-4">
            <Plus className="h-8 w-8 mx-auto text-gray-400" />
            <p className="text-gray-500">첫 번째 블록을 추가하세요</p>
            <div className="flex flex-wrap justify-center gap-2">
              {(['paragraph', 'heading1', 'checkbox', 'image', 'table', 'code', 'quote'] as BlockType[]).map((type) => (
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