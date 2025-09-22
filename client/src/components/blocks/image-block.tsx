import React, { useState, useRef, useEffect } from 'react';
import { Block, BlockType } from '@shared/schema';
import { Trash2, Image as ImageIcon, Upload, X, Edit3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDropzone } from 'react-dropzone';
import { useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

interface ImageBlockProps {
  block: Block;
  isFocused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onUpdate: (updates: Partial<Block>) => void;
  onDelete: () => void;
  onAddBlock: (type?: BlockType) => void;
  teamName?: string;
}

interface UploadedFile {
  filename: string;
  originalName: string;
  size: number;
  mimetype: string;
  url: string;
  path: string;
}

export function ImageBlock({
  block,
  isFocused,
  onFocus,
  onBlur,
  onUpdate,
  onDelete,
  onAddBlock,
  teamName,
}: ImageBlockProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isEditingCaption, setIsEditingCaption] = useState(false);
  const [caption, setCaption] = useState(block.properties?.caption || '');
  const { toast } = useToast();

  const imageUrl = block.properties?.imageUrl || block.content;
  const imageAlt = block.properties?.alt || block.properties?.caption || '';

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File): Promise<UploadedFile> => {
      const formData = new FormData();
      formData.append('files', file);

      if (teamName) {
        formData.append('teamId', teamName);
      }

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Upload failed');
      }

      const result = await response.json();
      return result.files[0];
    },
    onSuccess: (uploadedFile) => {
      onUpdate({
        content: uploadedFile.url,
        properties: {
          ...block.properties,
          imageUrl: uploadedFile.url,
          originalName: uploadedFile.originalName,
          size: uploadedFile.size,
          mimetype: uploadedFile.mimetype,
          alt: uploadedFile.originalName,
        },
      });
      setIsUploading(false);
      toast({
        title: '이미지 업로드 완료',
        description: '이미지가 성공적으로 업로드되었습니다.',
      });
    },
    onError: (error: Error) => {
      setIsUploading(false);
      toast({
        title: '업로드 실패',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const onDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setIsUploading(true);
      uploadMutation.mutate(acceptedFiles[0]);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp'],
    },
    maxFiles: 1,
    maxSize: 5 * 1024 * 1024, // 5MB
    disabled: isUploading,
  });

  const handleCaptionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCaption(e.target.value);
  };

  const handleCaptionSave = () => {
    onUpdate({
      properties: {
        ...block.properties,
        caption: caption,
        alt: caption || block.properties?.originalName || '이미지',
      },
    });
    setIsEditingCaption(false);
  };

  const handleCaptionCancel = () => {
    setCaption(block.properties?.caption || '');
    setIsEditingCaption(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isEditingCaption) {
        handleCaptionSave();
      } else {
        onAddBlock('paragraph');
      }
    } else if (e.key === 'Backspace' && !imageUrl) {
      e.preventDefault();
      onDelete();
    } else if (e.key === 'Escape' && isEditingCaption) {
      handleCaptionCancel();
    }
  };

  // 이미지가 없는 경우 업로드 영역 표시
  if (!imageUrl) {
    return (
      <div
        className={`relative group ${isFocused ? 'bg-blue-50 dark:bg-blue-950/20' : ''} rounded-lg p-4 transition-colors`}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        {/* 블록 타입 표시 */}
        <div className="absolute left-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <ImageIcon className="h-4 w-4 text-gray-400" />
        </div>

        <div
          {...getRootProps()}
          className={`
            border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
            ${
              isDragActive
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/25 hover:border-primary/50'
            }
            ${isUploading && 'cursor-not-allowed opacity-50'}
          `}
        >
          <input {...getInputProps()} />

          {isUploading ? (
            <div className="space-y-2">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="text-sm text-muted-foreground">업로드 중...</p>
            </div>
          ) : (
            <div className="space-y-2">
              <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {isDragActive
                  ? '이미지를 여기에 놓으세요'
                  : '이미지를 드래그하거나 클릭하여 업로드하세요'}
              </p>
              <p className="text-xs text-muted-foreground">PNG, JPG, GIF, WebP (최대 5MB)</p>
            </div>
          )}
        </div>

        {/* 액션 버튼들 */}
        {isFocused && (
          <div className="absolute right-2 top-2 flex items-center space-x-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="h-6 w-6 p-0 text-gray-400 hover:text-red-500"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
    );
  }

  // 이미지가 있는 경우 이미지 표시
  return (
    <div
      className={`relative group ${isFocused ? 'bg-blue-50 dark:bg-blue-950/20' : ''} rounded-lg p-4 transition-colors`}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* 블록 타입 표시 */}
      <div className="absolute left-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <ImageIcon className="h-4 w-4 text-gray-400" />
      </div>

      {/* 이미지 컨테이너 */}
      <div className="relative">
        <img
          src={imageUrl}
          alt={imageAlt}
          className="w-full h-auto rounded-lg shadow-sm"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            target.nextElementSibling?.classList.remove('hidden');
          }}
        />

        {/* 이미지 로드 실패 시 표시 */}
        <div className="hidden w-full h-32 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center">
          <div className="text-center text-gray-500">
            <ImageIcon className="h-8 w-8 mx-auto mb-2" />
            <p className="text-sm">이미지를 불러올 수 없습니다</p>
          </div>
        </div>

        {/* 이미지 오버레이 액션 */}
        {isFocused && (
          <div className="absolute inset-0 bg-black/20 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="flex space-x-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'image/*';
                  input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) {
                      setIsUploading(true);
                      uploadMutation.mutate(file);
                    }
                  };
                  input.click();
                }}
                className="bg-white/90 hover:bg-white text-gray-900"
              >
                <Upload className="h-4 w-4 mr-1" />
                변경
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={onDelete}
                className="bg-white/90 hover:bg-white text-red-600"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                삭제
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* 캡션 */}
      <div className="mt-2">
        {isEditingCaption ? (
          <div className="flex items-center space-x-2">
            <Input
              value={caption}
              onChange={handleCaptionChange}
              placeholder="이미지 설명을 입력하세요..."
              className="text-sm"
              autoFocus
            />
            <Button variant="ghost" size="sm" onClick={handleCaptionSave} className="h-8 px-2">
              저장
            </Button>
            <Button variant="ghost" size="sm" onClick={handleCaptionCancel} className="h-8 px-2">
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {block.properties?.caption || '이미지 설명을 추가하려면 클릭하세요'}
            </p>
            {isFocused && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditingCaption(true)}
                className="h-6 w-6 p-0 text-gray-400 hover:text-gray-600"
              >
                <Edit3 className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* 액션 버튼들 */}
      {isFocused && (
        <div className="absolute right-2 top-2 flex items-center space-x-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="h-6 w-6 p-0 text-gray-400 hover:text-red-500"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}
