import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { BookOpen, FolderOpen, Users, RefreshCw, Star, Eye, FileText, Plus, Edit, Trash2 } from 'lucide-react';
import { TemplateEditor } from '@/components/templates/template-editor';

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

const iconMap: Record<string, React.ComponentType<any>> = {
  BookOpen,
  FolderOpen,
  Users,
  RefreshCw,
};

const TemplatesPage: React.FC = () => {
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const navigate = useNavigate();

  // Fetch template categories
  const { data: categories = [] } = useQuery<TemplateCategory[]>({
    queryKey: ['template-categories'],
    queryFn: async () => {
      const response = await fetch('/api/template-categories');
      if (!response.ok) throw new Error('Failed to fetch categories');
      return response.json();
    },
  });

  // Fetch templates
  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ['templates', selectedCategory],
    queryFn: async () => {
      const url = selectedCategory 
        ? `/api/templates?categoryId=${selectedCategory}`
        : '/api/templates';
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch templates');
      return response.json();
    },
  });

  // Filter templates by selected category
  const filteredTemplates = selectedCategory 
    ? templates.filter(t => t.categoryId === selectedCategory)
    : templates;

  const handleTemplateSelect = async (template: Template) => {
    try {
      // Increment usage count
      await fetch(`/api/templates/${template.id}/use`, {
        method: 'POST',
      });

      // Navigate to page editor with template content
      navigate('/page-editor', {
        state: {
          template: {
            title: template.title,
            content: template.content,
            tags: template.tags,
          }
        }
      });
    } catch (error) {
      console.error('Error selecting template:', error);
    }
  };

  const handleEditTemplate = (template: Template) => {
    setEditingTemplate(template);
    setShowEditor(true);
  };

  const handleCreateTemplate = () => {
    setEditingTemplate(null);
    setShowEditor(true);
  };

  const handleSaveTemplate = (template: Template) => {
    setShowEditor(false);
    setEditingTemplate(null);
  };

  const handleCancelEdit = () => {
    setShowEditor(false);
    setEditingTemplate(null);
  };

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`w-4 h-4 ${i < rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
      />
    ));
  };

  const getCategoryIcon = (iconName?: string) => {
    const IconComponent = iconName ? iconMap[iconName] : FileText;
    return IconComponent ? <IconComponent className="w-5 h-5" /> : <FileText className="w-5 h-5" />;
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
        <h1 className="text-3xl font-bold mb-2">템플릿 갤러리</h1>
        <p className="text-muted-foreground">
          다양한 템플릿을 선택하여 새로운 페이지를 빠르게 시작하세요
        </p>
          </div>
          <Button onClick={handleCreateTemplate} className="flex items-center space-x-2">
            <Plus className="h-4 w-4" />
            <span>새 템플릿</span>
          </Button>
        </div>
      </div>

      {/* Category Tabs */}
      <Tabs 
        value={selectedCategory?.toString() || "all"} 
        onValueChange={(value) => setSelectedCategory(value === "all" ? null : parseInt(value))}
        className="mb-8"
      >
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="all">전체</TabsTrigger>
          {categories.map((category) => (
            <TabsTrigger key={category.id} value={category.id.toString()}>
              <div className="flex items-center gap-2">
                {getCategoryIcon(category.icon)}
                <span className="hidden sm:inline">{category.displayName}</span>
              </div>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="all" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                category={categories.find(c => c.id === template.categoryId)}
                onSelect={handleTemplateSelect}
                onEdit={handleEditTemplate}
                renderStars={renderStars}
                getCategoryIcon={getCategoryIcon}
              />
            ))}
          </div>
        </TabsContent>

        {categories.map((category) => (
          <TabsContent key={category.id} value={category.id.toString()} className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredTemplates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  category={category}
                  onSelect={handleTemplateSelect}
                  onEdit={handleEditTemplate}
                  renderStars={renderStars}
                  getCategoryIcon={getCategoryIcon}
                />
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* Template Editor Modal */}
      {showEditor && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden">
            <TemplateEditor
              template={editingTemplate || undefined}
              onSave={handleSaveTemplate}
              onCancel={handleCancelEdit}
            />
          </div>
        </div>
      )}
    </div>
  );
};

interface TemplateCardProps {
  template: Template;
  category?: TemplateCategory;
  onSelect: (template: Template) => void;
  onEdit?: (template: Template) => void;
  renderStars: (rating: number) => React.ReactNode;
  getCategoryIcon: (iconName?: string) => React.ReactNode;
}

const TemplateCard: React.FC<TemplateCardProps> = ({
  template,
  category,
  onSelect,
  onEdit,
  renderStars,
  getCategoryIcon,
}) => {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg mb-2">{template.title}</CardTitle>
            <CardDescription className="line-clamp-2">
              {template.description}
            </CardDescription>
          </div>
          {category && (
            <Badge variant="secondary" className="ml-2">
              <div className="flex items-center gap-1">
                {getCategoryIcon(category.icon)}
                <span className="hidden sm:inline">{category.displayName}</span>
              </div>
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col">
        {/* Tags */}
        <div className="flex flex-wrap gap-1 mb-4">
          {template.tags.slice(0, 3).map((tag) => (
            <Badge key={tag} variant="outline" className="text-xs">
              {tag}
            </Badge>
          ))}
          {template.tags.length > 3 && (
            <Badge variant="outline" className="text-xs">
              +{template.tags.length - 3}
            </Badge>
          )}
        </div>

        {/* Stats */}
        <div className="flex items-center justify-between text-sm text-muted-foreground mb-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <Eye className="w-4 h-4" />
            <span>{template.usageCount || 0}</span>
            </div>
            <div className="flex items-center gap-1">
            {renderStars(template.rating || 0)}
            </div>
          </div>
          <div className="text-xs">
          {template.createdAt ? new Date(template.createdAt).toLocaleDateString() : '-'}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsPreviewOpen(true)}
            className="flex-1"
          >
            <Eye className="w-4 h-4 mr-2" />
            미리보기
          </Button>
          {onEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(template)}
              className="flex-1"
            >
              <Edit className="w-4 h-4 mr-2" />
              편집
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => onSelect(template)}
            className="flex-1"
          >
            <FileText className="w-4 h-4 mr-2" />
            사용하기
          </Button>
        </div>
      </CardContent>

      {/* Preview Modal */}
      {isPreviewOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">{template.title}</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsPreviewOpen(false)}
              >
                ✕
              </Button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[calc(80vh-80px)]">
              <pre className="whitespace-pre-wrap text-sm font-mono">
                {template.content}
              </pre>
            </div>
            <div className="p-4 border-t flex gap-2">
              <Button
                variant="outline"
                onClick={() => setIsPreviewOpen(false)}
                className="flex-1"
              >
                닫기
              </Button>
              <Button
                onClick={() => {
                  setIsPreviewOpen(false);
                  onSelect(template);
                }}
                className="flex-1"
              >
                이 템플릿 사용하기
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

export default TemplatesPage; 