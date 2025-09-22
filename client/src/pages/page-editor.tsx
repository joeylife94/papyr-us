import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Save, Eye, ArrowLeft, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { WikiPage, InsertWikiPage, Block } from '@shared/schema';
import { MarkdownRenderer } from '@/components/wiki/markdown-renderer';
import { BlockEditor } from '@/components/blocks/block-editor';
import { getUserId, getUserName } from '@/lib/user';

const pageFormSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  content: z.string().min(1, 'Content is required'),
  folder: z.string().min(1, 'Folder is required'),
  tags: z.string(),
  author: z.string().min(1, 'Author is required'),
});

type PageFormData = z.infer<typeof pageFormSchema>;

interface PageEditorProps {
  pageId?: string; // If provided, we're editing; if not, we're creating
  initialFolder?: string;
  teamName?: string;
}

export default function PageEditor({ pageId, initialFolder = 'docs', teamName }: PageEditorProps) {
  // Extract teamName from URL if not provided as prop
  const currentLocation = window.location;
  const urlTeamName =
    teamName ||
    (currentLocation.pathname.includes('/teams/')
      ? currentLocation.pathname.split('/teams/')[1]?.split('/')[0]
      : undefined);
  const [, navigate] = useLocation();
  const [isPreview, setIsPreview] = useState(false);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Check if we have template data from navigation state
  const location = window.location;
  const templateData = (location as any).state?.template;

  const { data: existingPage } = useQuery<WikiPage>({
    queryKey: [`/api/pages/${pageId}`],
    enabled: !!pageId,
  });

  const { data: folders = [] } = useQuery<string[]>({
    queryKey: ['/api/folders'],
  });

  const form = useForm<PageFormData>({
    resolver: zodResolver(pageFormSchema),
    defaultValues: {
      title: '',
      content: '',
      folder: initialFolder,
      tags: '',
      author: 'User',
    },
  });

  // Update form when existing page loads or template data is available
  useEffect(() => {
    if (existingPage) {
      form.reset({
        title: existingPage.title,
        content: existingPage.content,
        folder: existingPage.folder,
        tags: existingPage.tags.join(', '),
        author: existingPage.author,
      });

      // Load blocks if available, otherwise convert content to blocks
      if (
        existingPage.blocks &&
        Array.isArray(existingPage.blocks) &&
        existingPage.blocks.length > 0
      ) {
        setBlocks(existingPage.blocks as Block[]);
      } else {
        // Convert existing content to blocks
        const defaultBlock: Block = {
          id: `block_${Date.now()}`,
          type: 'paragraph',
          content: existingPage.content,
          properties: {},
          order: 0,
          children: [],
        };
        setBlocks([defaultBlock]);
      }
    } else if (templateData) {
      // Apply template data
      form.reset({
        title: templateData.title || '',
        content: templateData.content || '',
        folder: initialFolder,
        tags: templateData.tags?.join(', ') || '',
        author: 'User',
      });

      // Convert template content to blocks
      const defaultBlock: Block = {
        id: `block_${Date.now()}`,
        type: 'paragraph',
        content: templateData.content || '',
        properties: {},
        order: 0,
        children: [],
      };
      setBlocks([defaultBlock]);
    }
  }, [existingPage, templateData, initialFolder, form]);

  const createPageMutation = useMutation({
    mutationFn: async (data: InsertWikiPage) => {
      const pageData = urlTeamName ? { ...data, teamId: urlTeamName } : data;
      const response = await fetch(`/api/pages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(pageData),
      });
      if (!response.ok) throw new Error('Failed to create page');
      return response.json();
    },
    onSuccess: (newPage: WikiPage) => {
      queryClient.invalidateQueries({ queryKey: ['/api/pages'] });
      queryClient.invalidateQueries({ queryKey: [`/api/folders/${newPage.folder}/pages`] });
      toast({
        title: 'Page created',
        description: 'Your new page has been created successfully.',
      });
      navigate(`/page/${newPage.slug}`);
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to create page. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const updatePageMutation = useMutation({
    mutationFn: async (data: Partial<WikiPage>) => {
      const response = await fetch(`/api/pages/${pageId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to update page');
      return response.json();
    },
    onSuccess: (updatedPage: WikiPage) => {
      queryClient.invalidateQueries({ queryKey: [`/api/pages/${pageId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/pages'] });
      queryClient.invalidateQueries({ queryKey: [`/api/folders/${updatedPage.folder}/pages`] });
      toast({
        title: 'Page updated',
        description: 'Your changes have been saved successfully.',
      });
      navigate(`/page/${updatedPage.slug}`);
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update page. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: PageFormData) => {
    const slug = data.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const tags = data.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

    // Convert blocks to content for backward compatibility
    const content = blocks.map((block) => block.content).join('\n\n');

    if (pageId) {
      // Update existing page
      updatePageMutation.mutate({
        title: data.title,
        content,
        blocks,
        folder: data.folder,
        tags,
        author: data.author,
      });
    } else {
      // Create new page
      createPageMutation.mutate({
        title: data.title,
        slug,
        content,
        blocks,
        folder: data.folder,
        tags,
        author: data.author,
      });
    }
  };

  const getFolderDisplayName = (folder: string) => {
    switch (folder) {
      case 'docs':
        return 'Documentation';
      case 'team1':
        return 'Team Alpha';
      case 'team2':
        return 'Team Beta';
      default:
        return folder.charAt(0).toUpperCase() + folder.slice(1);
    }
  };

  const currentContent = form.watch('content');
  const isLoading = createPageMutation.isPending || updatePageMutation.isPending;

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="sm" onClick={() => window.history.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              {pageId
                ? urlTeamName
                  ? `${urlTeamName} 팀 문서 수정`
                  : 'Edit Page'
                : urlTeamName
                  ? `${urlTeamName} 팀 새 문서 작성`
                  : 'Create New Page'}
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              {pageId
                ? urlTeamName
                  ? '팀 문서를 수정합니다'
                  : 'Update your existing page'
                : urlTeamName
                  ? '팀에 새로운 문서를 추가합니다'
                  : 'Add a new page to your wiki'}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            variant={isPreview ? 'outline' : 'default'}
            size="sm"
            onClick={() => setIsPreview(false)}
          >
            Edit
          </Button>
          <Button
            variant={isPreview ? 'default' : 'outline'}
            size="sm"
            onClick={() => setIsPreview(true)}
          >
            <Eye className="h-4 w-4 mr-2" />
            Preview
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Editor Form */}
        <Card className={isPreview ? 'lg:block hidden' : ''}>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Plus className="h-5 w-5 mr-2" />
              Page Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input placeholder="Page title..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="folder"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Folder</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a folder" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {folders.map((folder) => (
                            <SelectItem key={folder} value={folder}>
                              {getFolderDisplayName(folder)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="tags"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tags</FormLabel>
                      <FormControl>
                        <Input placeholder="tag1, tag2, tag3..." {...field} />
                      </FormControl>
                      <p className="text-sm text-slate-500">Separate tags with commas</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="author"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Author</FormLabel>
                      <FormControl>
                        <Input placeholder="Your name..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="content"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Content (Block Editor)</FormLabel>
                      <FormControl>
                        <div className="border rounded-md">
                          <BlockEditor
                            blocks={blocks}
                            onChange={setBlocks}
                            teamName={urlTeamName}
                            pageId={pageId ? parseInt(pageId) : undefined}
                            userId={getUserId()}
                            userName={getUserName()}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end space-x-2">
                  <Button type="button" variant="outline" onClick={() => window.history.back()}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isLoading}>
                    <Save className="h-4 w-4 mr-2" />
                    {isLoading
                      ? pageId
                        ? 'Updating...'
                        : 'Creating...'
                      : pageId
                        ? 'Update Page'
                        : 'Create Page'}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Preview */}
        <Card className={!isPreview ? 'lg:block hidden' : ''}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center">
                <Eye className="h-5 w-5 mr-2" />
                Preview
              </span>
              <div className="flex flex-wrap gap-1">
                {form
                  .watch('tags')
                  .split(',')
                  .map((tag) => tag.trim())
                  .filter((tag) => tag.length > 0)
                  .map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="border-b pb-4">
                <h1 className="text-2xl font-bold mb-2">
                  {form.watch('title') || 'Untitled Page'}
                </h1>
                <div className="flex items-center space-x-4 text-sm text-slate-500">
                  <span>By {form.watch('author') || 'Unknown'}</span>
                  <Badge variant="secondary">{getFolderDisplayName(form.watch('folder'))}</Badge>
                </div>
              </div>

              <div className="prose prose-slate dark:prose-invert max-w-none">
                {currentContent ? (
                  <MarkdownRenderer content={currentContent} />
                ) : (
                  <p className="text-slate-500 italic">
                    Start writing content to see the preview...
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
