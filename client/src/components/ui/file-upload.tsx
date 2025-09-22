import React, { useState, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from './button';
import { Card, CardContent } from './card';
import { Progress } from './progress';
import { Badge } from './badge';
import {
  Upload,
  X,
  File,
  Image as ImageIcon,
  FileText,
  Archive,
  Loader2,
  Check,
  AlertCircle,
  Copy,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface UploadedFile {
  filename: string;
  originalName: string;
  size: number;
  mimetype: string;
  url: string;
  path: string;
}

interface FileUploadProps {
  onFilesUploaded?: (files: UploadedFile[]) => void;
  onMarkdownInsert?: (markdown: string) => void;
  teamName?: string;
  accept?: string;
  maxFiles?: number;
  maxSize?: number;
  className?: string;
}

interface FileWithProgress {
  file: File;
  progress: number;
  status: 'uploading' | 'completed' | 'error';
  result?: UploadedFile;
  error?: string;
}

const getFileIcon = (mimetype: string) => {
  if (mimetype.startsWith('image/')) return ImageIcon;
  if (mimetype.includes('pdf')) return FileText;
  if (mimetype.includes('zip') || mimetype.includes('rar')) return Archive;
  return File;
};

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const generateMarkdown = (file: UploadedFile): string => {
  if (file.mimetype.startsWith('image/')) {
    return `![${file.originalName}](${file.url})`;
  } else {
    return `[${file.originalName}](${file.url})`;
  }
};

export function FileUpload({
  onFilesUploaded,
  onMarkdownInsert,
  teamName,
  accept = 'image/*,.pdf,.doc,.docx,.txt,.md,.zip',
  maxFiles = 5,
  maxSize = 10 * 1024 * 1024, // 10MB
  className,
}: FileUploadProps) {
  const [filesWithProgress, setFilesWithProgress] = useState<FileWithProgress[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (files: File[]): Promise<UploadedFile[]> => {
      const formData = new FormData();
      files.forEach((file) => {
        formData.append('files', file);
      });

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
      return result.files;
    },
    onSuccess: (uploadedFiles) => {
      // Update progress to completed
      setFilesWithProgress((prev) =>
        prev.map((item, index) => ({
          ...item,
          status: 'completed' as const,
          progress: 100,
          result: uploadedFiles[index],
        }))
      );

      onFilesUploaded?.(uploadedFiles);

      // Generate markdown for all uploaded files
      if (onMarkdownInsert) {
        const markdownLinks = uploadedFiles.map(generateMarkdown).join('\n');
        onMarkdownInsert(markdownLinks);
      }

      toast({
        title: '업로드 완료',
        description: `${uploadedFiles.length}개 파일이 성공적으로 업로드되었습니다.`,
      });

      // Clear files after a delay
      setTimeout(() => {
        setFilesWithProgress([]);
        setIsUploading(false);
      }, 2000);
    },
    onError: (error: Error) => {
      setFilesWithProgress((prev) =>
        prev.map((item) => ({
          ...item,
          status: 'error' as const,
          error: error.message,
        }))
      );

      toast({
        title: '업로드 실패',
        description: error.message,
        variant: 'destructive',
      });

      setIsUploading(false);
    },
  });

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: any[]) => {
      // Handle rejected files
      if (rejectedFiles.length > 0) {
        const errors = rejectedFiles.map(
          ({ file, errors }) => `${file.name}: ${errors.map((e: any) => e.message).join(', ')}`
        );

        toast({
          title: '일부 파일을 업로드할 수 없습니다',
          description: errors.join('\n'),
          variant: 'destructive',
        });
      }

      if (acceptedFiles.length === 0) return;

      // Initialize files with progress
      const newFilesWithProgress: FileWithProgress[] = acceptedFiles.map((file) => ({
        file,
        progress: 0,
        status: 'uploading',
      }));

      setFilesWithProgress(newFilesWithProgress);
      setIsUploading(true);

      // Simulate progress (since we can't track real progress with FormData)
      newFilesWithProgress.forEach((_, index) => {
        const interval = setInterval(() => {
          setFilesWithProgress((prev) =>
            prev.map((item, i) =>
              i === index && item.status === 'uploading'
                ? { ...item, progress: Math.min(item.progress + 10, 90) }
                : item
            )
          );
        }, 200);

        // Clear interval after 2 seconds
        setTimeout(() => clearInterval(interval), 2000);
      });

      // Start upload
      uploadMutation.mutate(acceptedFiles);
    },
    [uploadMutation, toast]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: accept.split(',').reduce((acc, type) => {
      acc[type.trim()] = [];
      return acc;
    }, {} as any),
    maxFiles,
    maxSize,
    disabled: isUploading,
  });

  const removeFile = (index: number) => {
    setFilesWithProgress((prev) => prev.filter((_, i) => i !== index));
  };

  const copyMarkdown = (file: UploadedFile) => {
    const markdown = generateMarkdown(file);
    navigator.clipboard.writeText(markdown);
    toast({
      title: '클립보드에 복사됨',
      description: '마크다운 코드가 클립보드에 복사되었습니다.',
    });
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Drop Zone */}
      <div
        {...getRootProps()}
        className={cn(
          'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
          isDragActive
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-primary/50',
          isUploading && 'cursor-not-allowed opacity-50'
        )}
      >
        <input {...getInputProps()} />

        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            {isUploading ? (
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
            ) : (
              <Upload className="w-6 h-6 text-primary" />
            )}
          </div>

          <div>
            <p className="text-lg font-medium">
              {isDragActive ? '파일을 여기에 놓으세요' : '파일을 드래그하거나 클릭하여 업로드'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              최대 {maxFiles}개 파일, 파일당 {formatFileSize(maxSize)} 이하
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              지원 형식: 이미지, PDF, 문서, 압축파일
            </p>
          </div>
        </div>
      </div>

      {/* File List */}
      {filesWithProgress.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium">업로드 중인 파일</h4>
          {filesWithProgress.map((item, index) => {
            const Icon = getFileIcon(item.file.type);

            return (
              <Card key={index} className="p-0">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-3">
                    <Icon className="w-8 h-8 text-muted-foreground flex-shrink-0" />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium truncate">{item.file.name}</p>
                        <div className="flex items-center space-x-2">
                          {item.status === 'completed' && item.result && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyMarkdown(item.result!)}
                              className="h-6 px-2"
                            >
                              <Copy className="w-3 h-3" />
                            </Button>
                          )}
                          {item.status !== 'uploading' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeFile(index)}
                              className="h-6 px-2"
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{formatFileSize(item.file.size)}</span>
                        {item.status === 'completed' && (
                          <Badge variant="outline" className="text-green-600">
                            <Check className="w-3 h-3 mr-1" />
                            완료
                          </Badge>
                        )}
                        {item.status === 'error' && (
                          <Badge variant="destructive" className="text-xs">
                            <AlertCircle className="w-3 h-3 mr-1" />
                            실패
                          </Badge>
                        )}
                      </div>

                      {item.status === 'uploading' && (
                        <Progress value={item.progress} className="mt-2 h-1" />
                      )}

                      {item.status === 'error' && item.error && (
                        <p className="text-xs text-destructive mt-1">{item.error}</p>
                      )}

                      {item.status === 'completed' && item.result && (
                        <div className="mt-2 p-2 bg-muted rounded text-xs font-mono">
                          {generateMarkdown(item.result)}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
