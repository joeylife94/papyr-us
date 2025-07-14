import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { FileUpload } from '../components/ui/file-upload';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { 
  Upload, 
  Search, 
  Filter,
  Trash2, 
  Download, 
  Eye,
  Copy,
  Image as ImageIcon,
  File,
  FileText,
  Archive,
  Calendar,
  HardDrive
} from 'lucide-react';
import { useToast } from '../hooks/use-toast';

interface UploadedFile {
  filename: string;
  size: number;
  mimetype: string;
  created: string;
  modified: string;
  url: string;
}

interface FileList {
  images: UploadedFile[];
  files: UploadedFile[];
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

const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export default function FileManager() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFile, setSelectedFile] = useState<UploadedFile | null>(null);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('all');

  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch files
  const { data: fileList, isLoading } = useQuery<FileList>({
    queryKey: ['uploads'],
    queryFn: async () => {
      const response = await fetch('/api/uploads');
      if (!response.ok) {
        throw new Error('Failed to fetch files');
      }
      return response.json();
    }
  });

  // Delete file mutation
  const deleteMutation = useMutation({
    mutationFn: async ({ filename, isImage }: { filename: string; isImage: boolean }) => {
      const type = isImage ? 'images' : 'files';
      const response = await fetch(`/api/uploads/${type}/${filename}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Delete failed');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['uploads'] });
      toast({
        title: "파일 삭제 완료",
        description: "파일이 성공적으로 삭제되었습니다."
      });
    },
    onError: (error: Error) => {
      toast({
        title: "삭제 실패",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const copyUrl = (file: UploadedFile) => {
    navigator.clipboard.writeText(window.location.origin + file.url);
    toast({
      title: "URL 복사됨",
      description: "파일 URL이 클립보드에 복사되었습니다."
    });
  };

  const copyMarkdown = (file: UploadedFile) => {
    const markdown = file.mimetype.startsWith('image/') 
      ? `![파일](${file.url})`
      : `[${file.filename}](${file.url})`;
    
    navigator.clipboard.writeText(markdown);
    toast({
      title: "마크다운 복사됨",
      description: "마크다운 코드가 클립보드에 복사되었습니다."
    });
  };

  const downloadFile = (file: UploadedFile) => {
    const link = document.createElement('a');
    link.href = file.url;
    link.download = file.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const deleteFile = (file: UploadedFile) => {
    const isImage = file.mimetype.startsWith('image/');
    deleteMutation.mutate({ filename: file.filename, isImage });
  };

  // Filter files based on search and tab
  const filteredFiles = React.useMemo(() => {
    if (!fileList) return { images: [], files: [] };

    const filterBySearch = (files: UploadedFile[]) => 
      files.filter(file => 
        file.filename.toLowerCase().includes(searchQuery.toLowerCase())
      );

    const images = filterBySearch(fileList.images);
    const files = filterBySearch(fileList.files);

    switch (activeTab) {
      case 'images':
        return { images, files: [] };
      case 'files':
        return { images: [], files };
      default:
        return { images, files };
    }
  }, [fileList, searchQuery, activeTab]);

  const allFiles = [...(filteredFiles.images || []), ...(filteredFiles.files || [])];
  const totalSize = allFiles.reduce((sum, file) => sum + file.size, 0);

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">파일 목록을 불러오는 중...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">파일 관리</h1>
          <p className="text-muted-foreground mt-2">업로드된 파일들을 관리하고 마크다운에서 사용하세요</p>
        </div>
        
        <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Upload className="w-4 h-4 mr-2" />
              파일 업로드
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>파일 업로드</DialogTitle>
              <DialogDescription>
                이미지, 문서, 압축파일 등을 업로드할 수 있습니다.
              </DialogDescription>
            </DialogHeader>
            
            <FileUpload 
              onFilesUploaded={() => {
                queryClient.invalidateQueries({ queryKey: ['uploads'] });
                setIsUploadDialogOpen(false);
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">총 파일</p>
                <p className="text-2xl font-bold">{allFiles.length}</p>
              </div>
              <File className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">이미지</p>
                <p className="text-2xl font-bold">{fileList?.images.length || 0}</p>
              </div>
              <ImageIcon className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">문서</p>
                <p className="text-2xl font-bold">{fileList?.files.length || 0}</p>
              </div>
              <FileText className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">총 용량</p>
                <p className="text-2xl font-bold">{formatFileSize(totalSize)}</p>
              </div>
              <HardDrive className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filter */}
      <div className="flex gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="파일명으로 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* File Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">전체 ({allFiles.length})</TabsTrigger>
          <TabsTrigger value="images">이미지 ({fileList?.images.length || 0})</TabsTrigger>
          <TabsTrigger value="files">문서 ({fileList?.files.length || 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          <FileGrid files={allFiles} onCopyUrl={copyUrl} onCopyMarkdown={copyMarkdown} onDownload={downloadFile} onDelete={deleteFile} />
        </TabsContent>

        <TabsContent value="images" className="space-y-4">
          <FileGrid files={filteredFiles.images} onCopyUrl={copyUrl} onCopyMarkdown={copyMarkdown} onDownload={downloadFile} onDelete={deleteFile} />
        </TabsContent>

        <TabsContent value="files" className="space-y-4">
          <FileGrid files={filteredFiles.files} onCopyUrl={copyUrl} onCopyMarkdown={copyMarkdown} onDownload={downloadFile} onDelete={deleteFile} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface FileGridProps {
  files: UploadedFile[];
  onCopyUrl: (file: UploadedFile) => void;
  onCopyMarkdown: (file: UploadedFile) => void;
  onDownload: (file: UploadedFile) => void;
  onDelete: (file: UploadedFile) => void;
}

function FileGrid({ files, onCopyUrl, onCopyMarkdown, onDownload, onDelete }: FileGridProps) {
  if (files.length === 0) {
    return (
      <div className="text-center py-12">
        <File className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">파일이 없습니다</h3>
        <p className="text-muted-foreground">파일을 업로드해보세요!</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {files.map((file, index) => {
        const Icon = getFileIcon(file.mimetype);
        
        return (
          <Card key={index} className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <Icon className="w-8 h-8 text-muted-foreground" />
                <Badge variant="outline" className="text-xs">
                  {file.mimetype.split('/')[1].toUpperCase()}
                </Badge>
              </div>
            </CardHeader>
            
            <CardContent>
              <div className="space-y-3">
                {/* Preview for images */}
                {file.mimetype.startsWith('image/') && (
                  <div className="aspect-video rounded-lg overflow-hidden bg-muted">
                    <img 
                      src={file.url} 
                      alt={file.filename}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                )}
                
                <div>
                  <h4 className="font-medium truncate" title={file.filename}>
                    {file.filename}
                  </h4>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                    <span>{formatFileSize(file.size)}</span>
                    <span>•</span>
                    <span>{formatDate(file.created)}</span>
                  </div>
                </div>

                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => onCopyUrl(file)} title="URL 복사">
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onCopyMarkdown(file)} title="마크다운 복사">
                    <FileText className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onDownload(file)} title="다운로드">
                    <Download className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onDelete(file)} title="삭제">
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
} 