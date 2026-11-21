import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { MentionTextarea } from '@/components/wiki/mention-textarea';
import { contentToDraft, draftToContent, type PickedMention } from '@/lib/mention-draft';
import { UNKNOWN_MENTION_LABEL, splitMentions } from '@shared/comment-mentions';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { MessageCircle, Reply, Edit, Trash2, Send } from 'lucide-react';

interface Comment {
  id: number;
  content: string;
  author: string;
  authorUserId: number | null;
  pageId: number;
  parentId: number | null;
  createdAt: string;
  updatedAt: string;
  // The people named by mention tokens that may be shown to this viewer (others render neutrally).
  mentions?: Array<{ userId: number; name: string }>;
}

interface CommentsProps {
  pageId: number;
}

export function Comments({ pageId }: CommentsProps) {
  const [newComment, setNewComment] = useState('');
  const [newPicked, setNewPicked] = useState<PickedMention[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editPicked, setEditPicked] = useState<PickedMention[]>([]);
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [replyPicked, setReplyPicked] = useState<PickedMention[]>([]);
  const [highlightedId, setHighlightedId] = useState<number | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuth();

  // Fetch comments for this page
  const { data: comments = [], refetch } = useQuery<Comment[]>({
    queryKey: [`/api/pages/${pageId}/comments`],
    queryFn: async () => {
      const response = await fetch(`/api/pages/${pageId}/comments`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch comments');
      return response.json();
    },
  });

  // Create comment mutation
  const createCommentMutation = useMutation({
    mutationFn: async (data: { content: string; parentId?: number }) => {
      const response = await fetch(`/api/pages/${pageId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to create comment');
      return response.json();
    },
    onSuccess: () => {
      refetch();
      setNewComment('');
      setNewPicked([]);
      setReplyContent('');
      setReplyPicked([]);
      setReplyingTo(null);
      toast({
        title: 'Comment posted',
        description: 'Your comment has been added successfully',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to post comment',
        variant: 'destructive',
      });
    },
  });

  // Update comment mutation
  const updateCommentMutation = useMutation({
    mutationFn: async ({ id, content }: { id: number; content: string }) => {
      const response = await fetch(`/api/comments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content }),
      });
      if (!response.ok) throw new Error('Failed to update comment');
      return response.json();
    },
    onSuccess: () => {
      refetch();
      setEditingId(null);
      setEditContent('');
      setEditPicked([]);
      toast({
        title: 'Comment updated',
        description: 'Your comment has been updated successfully',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update comment',
        variant: 'destructive',
      });
    },
  });

  // Delete comment mutation
  const deleteCommentMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/comments/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to delete comment');
    },
    onSuccess: () => {
      refetch();
      toast({
        title: 'Comment deleted',
        description: 'Comment has been removed successfully',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to delete comment',
        variant: 'destructive',
      });
    },
  });

  const handleSubmitComment = () => {
    if (!newComment.trim()) return;
    createCommentMutation.mutate({ content: draftToContent(newComment, newPicked) });
  };

  const handleSubmitReply = (parentId: number) => {
    if (!replyContent.trim()) return;
    createCommentMutation.mutate({ content: draftToContent(replyContent, replyPicked), parentId });
  };

  const handleEditComment = (comment: Comment) => {
    const draft = contentToDraft(
      comment.content,
      new Map((comment.mentions ?? []).map((mention) => [mention.userId, mention.name]))
    );
    setEditingId(comment.id);
    setEditContent(draft.text);
    setEditPicked(draft.picked);
  };

  const handleSaveEdit = () => {
    if (!editContent.trim() || !editingId) return;
    updateCommentMutation.mutate({
      id: editingId,
      content: draftToContent(editContent, editPicked),
    });
  };

  const handleDeleteComment = (id: number) => {
    if (confirm('Are you sure you want to delete this comment?')) {
      deleteCommentMutation.mutate(id);
    }
  };

  // Determine if current user can edit/delete a comment
  const canModify = (comment: Comment): boolean => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return comment.authorUserId != null && comment.authorUserId === user.id;
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((word) => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getDisplayAuthor = (comment: Comment): string => {
    // Server-derived author; fall back for legacy comments without authorUserId
    return comment.author || 'Unknown User';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // A comment's text with each mention shown as the person's current name, as plain text. A person
  // the server did not name (unknown, or not readable here) shows as a neutral label.
  const renderContent = (comment: Comment) => {
    const names = new Map(
      (comment.mentions ?? []).map((mention) => [mention.userId, mention.name])
    );
    return splitMentions(comment.content).map((segment, index) =>
      segment.kind === 'text' ? (
        <span key={index}>{segment.text}</span>
      ) : (
        <span
          key={index}
          data-testid="comment-mention"
          className="rounded bg-highlight/10 px-1 font-medium text-highlight"
        >
          @{names.get(segment.userId) ?? UNKNOWN_MENTION_LABEL}
        </span>
      )
    );
  };

  // A link from a notification ends in `#comment-<id>`: scroll to that comment once it is listed.
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  useEffect(() => {
    const match = /^#comment-(\d+)$/.exec(hash);
    if (!match) return;
    const id = Number(match[1]);
    if (!comments.some((comment) => comment.id === id)) return;
    document.getElementById(`comment-${id}`)?.scrollIntoView({ block: 'center' });
    setHighlightedId(id);
    const timer = setTimeout(() => setHighlightedId(null), 4000);
    return () => clearTimeout(timer);
  }, [hash, comments]);

  // Organize comments into threads (parent comments with their replies)
  const parentComments = comments.filter((comment) => !comment.parentId);
  const getReplies = (parentId: number) =>
    comments.filter((comment) => comment.parentId === parentId);

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-2">
        <MessageCircle className="h-5 w-5 text-highlight" />
        <h3 className="text-lg font-semibold">Comments ({comments.length})</h3>
      </div>

      {/* New Comment Form — only show when authenticated */}
      {isAuthenticated ? (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center space-x-2">
              <Avatar>
                <AvatarFallback>{getInitials(user?.email || user?.name || 'U')}</AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium">{user?.email || user?.name || 'You'}</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <MentionTextarea
              testId="comment-input"
              pageId={pageId}
              placeholder="Write a comment... (type @ to mention someone)"
              value={newComment}
              picked={newPicked}
              onChange={(text, picked) => {
                setNewComment(text);
                setNewPicked(picked);
              }}
              className="min-h-[80px]"
            />
            <div className="flex justify-end">
              <Button
                onClick={handleSubmitComment}
                disabled={!newComment.trim() || createCommentMutation.isPending}
                size="sm"
              >
                <Send className="h-4 w-4 mr-2" />
                Post Comment
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-6 text-center text-muted-foreground">
            Sign in to leave a comment.
          </CardContent>
        </Card>
      )}

      {/* Comments List */}
      <div className="space-y-4">
        {parentComments.map((comment) => (
          <div key={comment.id} className="space-y-3">
            {/* Parent Comment */}
            <Card
              id={`comment-${comment.id}`}
              data-testid="comment-item"
              className={highlightedId === comment.id ? 'ring-2 ring-highlight' : undefined}
            >
              <CardContent className="pt-6">
                <div className="flex items-start space-x-3">
                  <Avatar>
                    <AvatarFallback>{getInitials(getDisplayAuthor(comment))}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {getDisplayAuthor(comment)}
                      </span>
                      {!comment.authorUserId && <span className="text-xs italic">(legacy)</span>}
                      <span>•</span>
                      <span>{formatDate(comment.createdAt)}</span>
                    </div>

                    {editingId === comment.id ? (
                      <div className="space-y-2">
                        <MentionTextarea
                          pageId={pageId}
                          value={editContent}
                          picked={editPicked}
                          onChange={(text, picked) => {
                            setEditContent(text);
                            setEditPicked(picked);
                          }}
                          className="min-h-[60px]"
                        />
                        <div className="flex space-x-2">
                          <Button size="sm" onClick={handleSaveEdit}>
                            Save
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">
                          {renderContent(comment)}
                        </p>
                        <div className="flex space-x-2">
                          {isAuthenticated && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setReplyingTo(comment.id)}
                            >
                              <Reply className="h-3 w-3 mr-1" />
                              Reply
                            </Button>
                          )}
                          {canModify(comment) && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleEditComment(comment)}
                              >
                                <Edit className="h-3 w-3 mr-1" />
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDeleteComment(comment.id)}
                              >
                                <Trash2 className="h-3 w-3 mr-1" />
                                Delete
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Reply Form */}
            {replyingTo === comment.id && (
              <div className="ml-12">
                <Card>
                  <CardContent className="pt-6">
                    <div className="space-y-3">
                      <MentionTextarea
                        testId="reply-input"
                        pageId={pageId}
                        placeholder="Write a reply..."
                        value={replyContent}
                        picked={replyPicked}
                        onChange={(text, picked) => {
                          setReplyContent(text);
                          setReplyPicked(picked);
                        }}
                        className="min-h-[60px]"
                      />
                      <div className="flex space-x-2">
                        <Button
                          size="sm"
                          onClick={() => handleSubmitReply(comment.id)}
                          disabled={!replyContent.trim() || createCommentMutation.isPending}
                        >
                          <Send className="h-4 w-4 mr-2" />
                          Reply
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setReplyingTo(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Replies */}
            {getReplies(comment.id).map((reply) => (
              <div key={reply.id} className="ml-12">
                <Card
                  id={`comment-${reply.id}`}
                  data-testid="comment-item"
                  className={highlightedId === reply.id ? 'ring-2 ring-highlight' : undefined}
                >
                  <CardContent className="pt-6">
                    <div className="flex items-start space-x-3">
                      <Avatar>
                        <AvatarFallback>{getInitials(getDisplayAuthor(reply))}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">
                            {getDisplayAuthor(reply)}
                          </span>
                          {!reply.authorUserId && <span className="text-xs italic">(legacy)</span>}
                          <span>•</span>
                          <span>{formatDate(reply.createdAt)}</span>
                        </div>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">
                          {renderContent(reply)}
                        </p>
                        {canModify(reply) && (
                          <div className="flex space-x-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEditComment(reply)}
                            >
                              <Edit className="h-3 w-3 mr-1" />
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteComment(reply.id)}
                            >
                              <Trash2 className="h-3 w-3 mr-1" />
                              Delete
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        ))}
      </div>

      {comments.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No comments yet. Be the first to comment!</p>
        </div>
      )}
    </div>
  );
}
