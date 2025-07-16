import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { 
  Save, 
  X, 
  Eye, 
  EyeOff, 
  Tag, 
  Plus, 
  Trash2,
  FileText,
  Settings,
  Palette
} from 'lucide-react';

interface TemplateCategory {
  id: number;
  name: string;
  displayName: string;
  description?: string;
  icon?: string;
  color?: string;
  order: number;
  isActive: boolean;
}

interface Template {
  id?: number;
  title: string;
  description?: string;
  content: string;
  categoryId: number;
  tags: string[];
  author: string;
  isPublic: boolean;
  usageCount?: number;
  rating?: number;
  thumbnail?: string;
  metadata?: any;
  createdAt?: string;
  updatedAt?: string;
}

interface TemplateEditorProps {
  template?: Template;
  onSave?: (template: Template) => void;
  onCancel?: () => void;
}

export function TemplateEditor({ template, onSave, onCancel }: TemplateEditorProps) {
  const [formData, setFormData] = useState<Template>({
    title: '',
    description: '',
    content: '',
    categoryId: 1,
    tags: [],
    author: '',
    isPublic: true,
    ...template
  });
  
  const [newTag, setNewTag] = useState('');
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  // Fetch categories
  const { data: categories = [] } = useQuery({
    queryKey: ['template-categories'],
    queryFn: async () => {
      const response = await fetch('/papyr-us/api/template-categories');
      if (!response.ok) throw new Error('Failed to fetch categories');
      return response.json();
    },
  });

  // Save template mutation
  const saveMutation = useMutation({
    mutationFn: async (templateData: Template) => {
      if (templateData.id) {
        // Update existing template
        return await apiRequest('PUT', `/papyr-us/api/templates/${templateData.id}`, templateData);
      } else {
        // Create new template
        return await apiRequest('POST', '/papyr-us/api/templates', templateData);
      }
    },
    onSuccess: (data) => {
      toast({
        title: template?.id ? "템플릿 업데이트" : "템플릿 생성",
        description: "템플릿이 성공적으로 저장되었습니다.",
      });
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      if (onSave) {
        onSave(data);
      } else {
        navigate('/papyr-us/templates');
      }
    },
    onError: (error) => {
      toast({
        title: "오류",
        description: "템플릿 저장 중 오류가 발생했습니다.",
        variant: "destructive"
      });
    }
  });

  const handleInputChange = (field: keyof Template, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleAddTag = () => {
    if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, newTag.trim()]
      }));
      setNewTag('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  const handleSave = () => {
    if (!formData.title.trim()) {
      toast({
        title: "제목 필요",
        description: "템플릿 제목을 입력해주세요.",
        variant: "destructive"
      });
      return;
    }

    if (!formData.content.trim()) {
      toast({
        title: "내용 필요",
        description: "템플릿 내용을 입력해주세요.",
        variant: "destructive"
      });
      return;
    }

    saveMutation.mutate(formData);
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      navigate('/papyr-us/templates');
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              {template?.id ? '템플릿 편집' : '새 템플릿 생성'}
            </h1>
            <p className="text-muted-foreground">
              {template?.id ? '기존 템플릿을 수정합니다.' : '새로운 템플릿을 만듭니다.'}
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              onClick={() => setIsPreviewMode(!isPreviewMode)}
              className="flex items-center space-x-2"
            >
              {isPreviewMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              <span>{isPreviewMode ? '편집' : '미리보기'}</span>
            </Button>
            <Button variant="outline" onClick={handleCancel}>
              <X className="h-4 w-4 mr-2" />
              취소
            </Button>
            <Button 
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="flex items-center space-x-2"
            >
              <Save className="h-4 w-4" />
              <span>{saveMutation.isPending ? '저장 중...' : '저장'}</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <FileText className="h-5 w-5" />
                <span>기본 정보</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="title">제목 *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => handleInputChange('title', e.target.value)}
                  placeholder="템플릿 제목을 입력하세요"
                />
              </div>
              
              <div>
                <Label htmlFor="description">설명</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  placeholder="템플릿에 대한 설명을 입력하세요"
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor="category">카테고리</Label>
                <Select
                  value={formData.categoryId.toString()}
                  onValueChange={(value) => handleInputChange('categoryId', parseInt(value))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="카테고리를 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id.toString()}>
                        {category.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Content Editor */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <FileText className="h-5 w-5" />
                <span>템플릿 내용 *</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isPreviewMode ? (
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <div dangerouslySetInnerHTML={{ __html: formData.content }} />
                </div>
              ) : (
                <Textarea
                  value={formData.content}
                  onChange={(e) => handleInputChange('content', e.target.value)}
                  placeholder="템플릿 내용을 마크다운으로 작성하세요..."
                  rows={20}
                  className="font-mono text-sm"
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Tags */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Tag className="h-5 w-5" />
                <span>태그</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex space-x-2">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="새 태그"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                />
                <Button size="sm" onClick={handleAddTag}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              
              <div className="flex flex-wrap gap-2">
                {formData.tags.map((tag, index) => (
                  <Badge key={index} variant="secondary" className="flex items-center space-x-1">
                    <span>{tag}</span>
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-1 hover:text-red-500"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Settings className="h-5 w-5" />
                <span>설정</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="author">작성자</Label>
                <Input
                  id="author"
                  value={formData.author}
                  onChange={(e) => handleInputChange('author', e.target.value)}
                  placeholder="작성자 이름"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="public">공개 템플릿</Label>
                  <p className="text-sm text-muted-foreground">
                    다른 사용자들이 이 템플릿을 사용할 수 있습니다
                  </p>
                </div>
                <Switch
                  id="public"
                  checked={formData.isPublic}
                  onCheckedChange={(checked) => handleInputChange('isPublic', checked)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Template Info */}
          {template?.id && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Palette className="h-5 w-5" />
                  <span>템플릿 정보</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">사용 횟수:</span>
                  <span>{template.usageCount || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">평점:</span>
                  <span>{template.rating || 0}/5</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">생성일:</span>
                  <span>{template.createdAt ? new Date(template.createdAt).toLocaleDateString() : '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">수정일:</span>
                  <span>{template.updatedAt ? new Date(template.updatedAt).toLocaleDateString() : '-'}</span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
} 