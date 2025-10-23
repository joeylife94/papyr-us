import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Share2, Copy, Trash2, Plus, Eye, MessageSquare, Edit, Shield, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface PublicLink {
  id: number;
  token: string;
  permission: 'viewer' | 'commenter' | 'editor';
  expiresAt?: string;
  createdAt: string;
  accessCount: number;
}

interface PageShareDialogProps {
  pageId: number;
  pageTitle: string;
  trigger?: React.ReactNode;
}

export function PageShareDialog({ pageId, pageTitle, trigger }: PageShareDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [links, setLinks] = useState<PublicLink[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const { toast } = useToast();

  // New link form state
  const [newLinkPermission, setNewLinkPermission] = useState<'viewer' | 'commenter' | 'editor'>(
    'viewer'
  );
  const [newLinkPassword, setNewLinkPassword] = useState('');
  const [newLinkExpires, setNewLinkExpires] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadLinks();
    }
  }, [isOpen, pageId]);

  const loadLinks = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/pages/${pageId}/share`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setLinks(data);
      } else {
        toast({
          title: 'Error',
          description: 'Failed to load share links',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Failed to load links:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const createLink = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/pages/${pageId}/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          permission: newLinkPermission,
          password: newLinkPassword || undefined,
          expiresAt: newLinkExpires || undefined,
        }),
      });

      if (response.ok) {
        const newLink = await response.json();
        setLinks([...links, newLink]);

        // Reset form
        setNewLinkPermission('viewer');
        setNewLinkPassword('');
        setNewLinkExpires('');

        toast({
          title: 'Success',
          description: 'Share link created successfully',
        });
      } else {
        const error = await response.json();
        toast({
          title: 'Error',
          description: error.message || 'Failed to create share link',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Failed to create link:', error);
      toast({
        title: 'Error',
        description: 'Failed to create share link',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const deleteLink = async (token: string) => {
    setIsLoading(true);
    try {
      const authToken = localStorage.getItem('token');
      const response = await fetch(`/api/pages/${pageId}/share/${token}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (response.ok) {
        setLinks(links.filter((l) => l.token !== token));
        toast({
          title: 'Success',
          description: 'Share link deleted successfully',
        });
      } else {
        toast({
          title: 'Error',
          description: 'Failed to delete share link',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Failed to delete link:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/share/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
    toast({
      title: 'Copied!',
      description: 'Share link copied to clipboard',
    });
  };

  const getPermissionIcon = (permission: string) => {
    switch (permission) {
      case 'viewer':
        return <Eye className="h-4 w-4" />;
      case 'commenter':
        return <MessageSquare className="h-4 w-4" />;
      case 'editor':
        return <Edit className="h-4 w-4" />;
      default:
        return <Eye className="h-4 w-4" />;
    }
  };

  const getPermissionLabel = (permission: string) => {
    switch (permission) {
      case 'viewer':
        return 'Can view';
      case 'commenter':
        return 'Can comment';
      case 'editor':
        return 'Can edit';
      default:
        return 'Unknown';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <Share2 className="h-4 w-4 mr-2" />
            Share
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Share "{pageTitle}"</DialogTitle>
          <DialogDescription>
            Create shareable links with different permission levels
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Create New Link Section */}
          <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
            <div className="flex items-center gap-2 mb-2">
              <Plus className="h-5 w-5" />
              <h3 className="font-semibold">Create New Link</h3>
            </div>

            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="permission">Permission Level</Label>
                <Select
                  value={newLinkPermission}
                  onValueChange={(value: any) => setNewLinkPermission(value)}
                >
                  <SelectTrigger id="permission">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">
                      <div className="flex items-center gap-2">
                        <Eye className="h-4 w-4" />
                        <span>Viewer - Can view only</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="commenter">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4" />
                        <span>Commenter - Can view and comment</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="editor">
                      <div className="flex items-center gap-2">
                        <Edit className="h-4 w-4" />
                        <span>Editor - Can view and edit</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="password">Password (optional)</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Leave empty for no password"
                  value={newLinkPassword}
                  onChange={(e) => setNewLinkPassword(e.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="expires">Expiration Date (optional)</Label>
                <Input
                  id="expires"
                  type="datetime-local"
                  value={newLinkExpires}
                  onChange={(e) => setNewLinkExpires(e.target.value)}
                />
              </div>

              <Button onClick={createLink} disabled={isLoading} className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Create Share Link
              </Button>
            </div>
          </div>

          {/* Existing Links Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              <h3 className="font-semibold">Active Share Links</h3>
              <span className="text-sm text-muted-foreground">({links.length})</span>
            </div>

            {isLoading && links.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : links.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border rounded-lg bg-muted/20">
                No share links created yet
              </div>
            ) : (
              <div className="space-y-2">
                {links.map((link) => (
                  <div
                    key={link.token}
                    className="flex items-center justify-between gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {getPermissionIcon(link.permission)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <code className="text-sm font-mono bg-muted px-2 py-1 rounded truncate">
                            /share/{link.token}
                          </code>
                          <span className="text-xs text-muted-foreground">
                            {getPermissionLabel(link.permission)}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {link.accessCount} views • Created{' '}
                          {new Date(link.createdAt).toLocaleDateString()}
                          {link.expiresAt && (
                            <span className="text-orange-500">
                              {' '}
                              • Expires {new Date(link.expiresAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyLink(link.token)}
                        className="h-8"
                      >
                        {copiedToken === link.token ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteLink(link.token)}
                        disabled={isLoading}
                        className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
