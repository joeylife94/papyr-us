import React, { useState, useCallback } from 'react';
import { Block, BlockType } from '@shared/schema';
import { HeadingBlock } from './heading-block';
import { ParagraphBlock } from './paragraph-block';
import { CheckboxBlock } from './checkbox-block';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

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

  return (
    <div className="block-editor min-h-[400px] p-4">
      {blocks.length === 0 ? (
        <div 
          className="flex items-center justify-center h-64 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 transition-colors"
          onClick={handleEmptyEditorClick}
        >
          <div className="text-center">
            <Plus className="h-8 w-8 mx-auto mb-2 text-gray-400" />
            <p className="text-gray-500">클릭하여 첫 번째 블록을 추가하세요</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {blocks.map((block, index) => renderBlock(block, index))}
          
          {/* 마지막에 새 블록 추가 버튼 */}
          <div className="flex justify-center pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => addBlock(blocks.length, 'paragraph')}
              className="opacity-60 hover:opacity-100 transition-opacity"
            >
              <Plus className="h-4 w-4 mr-2" />
              블록 추가
            </Button>
          </div>
        </div>
      )}
    </div>
  );
} 