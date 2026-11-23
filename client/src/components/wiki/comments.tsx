import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { MentionTextarea } from '@/components/wiki/mention-textarea';
import { commentFailureMessage } from '@/lib/comment-errors';
import { contentToDraft, draftToContent, type PickedMention } from '@/lib/mention-draft';
import { UNKNOWN_MENTION_LABEL, splitMentions } from '@shared/comment-mentions';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { MessageCircle, Reply, Edit, Trash2, Send, CheckCircle2, RotateCcw } from 'lucide-react';

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
  // Block anchor and resolved state of a thread; replies carry their thread's (WP15).
  blockId?: string | null;
  blockExcerpt?: string | null;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  blockExists?: boolean;
}

/** The comments of a page; the page view and the panel share one cache entry. */
export function usePageComments(pageId: number | undefined) {
  return useQuery<Comment[]>({
    queryKey: [`/api/pages/${pageId}/comments`],
    enabled: !!pageId,
    queryFn: async () => {
      const response = await fetch(`/api/pages/${pageId}/comments`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch comments');
      return response.json();
    },
  });
}

/** Open threads of a page: top-level comments that are not resolved. */
export function openThreadsOf(comments: Comment[] | undefined): Comment[] {
  return (comments ?? []).filter((comment) => !comment.parentId && !comment.resolvedAt);
}

type ThreadFilter = 'open' | 'resolved' | 'all';
const FILTER_LABELS: Record<ThreadFilter, string> = {
  open: '열린 토론',
  resolved: '해결됨',
  all: '전체',
};

export interface CommentBlock {
  id: string;
  type?: string;
  content?: string;
}

interface CommentsProps {
  pageId: number;
  /** The page's blocks, to pick the block a new comment is about. */
  blocks?: CommentBlock[];
  /** The viewer may comment on the page (block comments, resolve and reopen are offered). */
  canComment?: boolean;
  /** A request from the editor to show the threads of one block; `nonce` makes each request new. */
  focusRequest?: { blockId: string; nonce: number } | null;
  /** Saves the page's pending edits first; false when that failed (a block comment is not sent). */
  beforeBlockComment?: () => Promise<boolean>;
}

const excerptOfBlock = (block: CommentBlock | undefined): string => {
  const text = (block?.content ?? '').replace(/\s+/g, ' ').trim();
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
};

export function Comments({
  pageId,
  blocks = [],
  canComment = false,
  focusRequest,
  beforeBlockComment,
}: CommentsProps) {
  const [newComment, setNewComment] = useState('');
  const [newPicked, setNewPicked] = useState<PickedMention[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editPicked, setEditPicked] = useState<PickedMention[]>([]);
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [replyPicked, setReplyPicked] = useState<PickedMention[]>([]);
  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const [filter, setFilter] = useState<ThreadFilter>('open');
  // Only the threads of this block are listed (set from the editor's marker); null lists all.
  const [blockFilter, setBlockFilter] = useState<string | null>(null);
  // The block a new comment is about ('' is the page as a whole).
  const [newBlockId, setNewBlockId] = useState('');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuth();

  // Fetch comments for this page
  const { data: comments = [], refetch } = usePageComments(pageId);

  // Create comment mutation
  const createCommentMutation = useMutation({
    mutationFn: async (data: { content: string; parentId?: number; blockId?: string }) => {
      const response = await fetch(`/api/pages/${pageId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error(await commentFailureMessage(response, 'Failed to post comment'));
      }
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
    // The text stays in the box: it is cleared only when the comment was posted.
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
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
      if (!response.ok) {
        throw new Error(await commentFailureMessage(response, 'Failed to update comment'));
      }
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
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Resolve or reopen a thread (whoever may comment on the page may).
  const threadStateMutation = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: 'resolve' | 'reopen' }) => {
      const response = await fetch(`/api/comments/${id}/${action}`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(await commentFailureMessage(response, '토론 상태를 바꾸지 못했습니다'));
      }
      return response.json();
    },
    onSuccess: (_data, { action }) => {
      refetch();
      toast({ title: action === 'resolve' ? '토론을 해결했습니다' : '토론을 다시 열었습니다' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
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

  const handleSubmitComment = async () => {
    if (!newComment.trim()) return;
    const blockId = newBlockId && canComment ? newBlockId : null;
    // A block comment needs the block to be saved: pending edits are saved first, and when that
    // fails nothing is posted and the text stays in the box.
    if (blockId && beforeBlockComment && !(await beforeBlockComment())) {
      toast({
        title: 'Error',
        description: '문서를 저장하지 못해 댓글을 보내지 않았습니다. 다시 시도해 주세요.',
        variant: 'destructive',
      });
      return;
    }
    createCommentMutation.mutate({
      content: draftToContent(newComment, newPicked).trim(),
      ...(blockId ? { blockId } : {}),
    });
  };

  const handleSubmitReply = (parentId: number) => {
    if (!replyContent.trim()) return;
    createCommentMutation.mutate({
      content: draftToContent(replyContent, replyPicked).trim(),
      parentId,
    });
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
      content: draftToContent(editContent, editPicked).trim(),
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
  const handledHash = useRef<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    const match = /^#comment-(\d+)$/.exec(hash);
    if (!match || handledHash.current === hash) return;
    const id = Number(match[1]);
    const target = comments.find((comment) => comment.id === id);
    if (!target) return;
    // Show the comment: the tab that holds its thread, the thread's block, the thread expanded.
    const root = target.parentId ? comments.find((c) => c.id === target.parentId) : target;
    if (!root) return;
    const tab: ThreadFilter = root.resolvedAt ? 'resolved' : 'open';
    if (filter !== 'all' && filter !== tab) {
      setFilter(tab);
      return;
    }
    if (blockFilter !== null && root.blockId !== blockFilter) {
      setBlockFilter(null);
      return;
    }
    if (root.resolvedAt && !expanded.has(root.id)) {
      setExpanded((current) => new Set(current).add(root.id));
      return;
    }
    const element = document.getElementById(`comment-${id}`);
    if (!element) return;
    handledHash.current = hash;
    element.scrollIntoView({ block: 'center' });
    setHighlightedId(id);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightedId(null), 4000);
  }, [hash, comments, filter, blockFilter, expanded]);
  useEffect(
    () => () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    },
    []
  );

  // The editor's marker or comment button asks for one block's threads.
  const panelRef = useRef<HTMLDivElement>(null);
  const lastFocusNonce = useRef<number | null>(null);
  useEffect(() => {
    if (!focusRequest || lastFocusNonce.current === focusRequest.nonce) return;
    lastFocusNonce.current = focusRequest.nonce;
    setBlockFilter(focusRequest.blockId);
    setFilter('open');
    setNewBlockId(focusRequest.blockId);
    panelRef.current?.scrollIntoView({ block: 'start' });
    panelRef.current?.focus({ preventScroll: true });
  }, [focusRequest]);

  // Organize comments into threads (parent comments with their replies)
  const allThreads = comments.filter((comment) => !comment.parentId);
  const threadCounts: Record<ThreadFilter, number> = {
    open: allThreads.filter((comment) => !comment.resolvedAt).length,
    resolved: allThreads.filter((comment) => comment.resolvedAt).length,
    all: allThreads.length,
  };
  const parentComments = allThreads.filter(
    (comment) =>
      (filter === 'all' || (filter === 'resolved') === !!comment.resolvedAt) &&
      (blockFilter === null || comment.blockId === blockFilter)
  );
  const blockById = new Map(blocks.map((block) => [block.id, block]));
  const getReplies = (parentId: number) =>
    comments.filter((comment) => comment.parentId === parentId);

  return (
    <div
      ref={panelRef}
      id="page-comments"
      tabIndex={-1}
      data-testid="comments-panel"
      aria-label="댓글"
      className="space-y-6 focus:outline-none"
    >
      <div className="flex items-center space-x-2">
        <MessageCircle className="h-5 w-5 text-highlight" />
        <h3 className="text-lg font-semibold">Comments ({comments.length})</h3>
      </div>

      <div role="tablist" aria-label="토론 보기" className="flex flex-wrap gap-1">
        {(Object.keys(FILTER_LABELS) as ThreadFilter[]).map((key) => (
          <Button
            key={key}
            role="tab"
            type="button"
            size="sm"
            variant={filter === key ? 'default' : 'outline'}
            aria-selected={filter === key}
            data-testid={`thread-filter-${key}`}
            onClick={() => setFilter(key)}
          >
            {FILTER_LABELS[key]} ({threadCounts[key]})
          </Button>
        ))}
      </div>

      {blockFilter !== null && (
        <div
          data-testid="block-filter"
          className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
        >
          <span className="text-muted-foreground">블록의 토론만 보는 중:</span>
          <span className="min-w-0 truncate font-medium">
            {excerptOfBlock(blockById.get(blockFilter)) || '선택한 블록'}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setBlockFilter(null);
              setNewBlockId('');
            }}
          >
            모두 보기
          </Button>
        </div>
      )}

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
            {canComment && blocks.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <label htmlFor="comment-block-select" className="text-muted-foreground">
                  댓글을 달 블록
                </label>
                <select
                  id="comment-block-select"
                  data-testid="comment-block-select"
                  value={newBlockId}
                  onChange={(event) => setNewBlockId(event.target.value)}
                  className="min-w-0 max-w-full flex-1 rounded-md border border-input bg-background px-2 py-1"
                >
                  <option value="">문서 전체</option>
                  {blocks
                    .filter((block) => excerptOfBlock(block) !== '' || block.id === newBlockId)
                    .map((block) => (
                      <option key={block.id} value={block.id}>
                        {excerptOfBlock(block) || '선택한 블록'}
                      </option>
                    ))}
                </select>
              </div>
            )}
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

                    {comment.blockId && (
                      <p
                        data-testid="thread-anchor"
                        className="truncate border-l-2 border-border pl-2 text-xs text-muted-foreground"
                      >
                        {comment.blockExists
                          ? comment.blockExcerpt || '(내용 없는 블록)'
                          : '원래 블록이 삭제되었습니다'}
                      </p>
                    )}

                    {comment.resolvedAt && (
                      <div
                        data-testid="thread-resolved"
                        className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        <span>
                          {comment.resolvedBy ?? 'Unknown User'} 님이{' '}
                          {formatDate(comment.resolvedAt)}에 해결함
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-expanded={expanded.has(comment.id)}
                          onClick={() =>
                            setExpanded((current) => {
                              const next = new Set(current);
                              if (!next.delete(comment.id)) next.add(comment.id);
                              return next;
                            })
                          }
                        >
                          {expanded.has(comment.id) ? '접기' : '펼치기'}
                        </Button>
                        {canComment && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            data-testid="reopen-thread"
                            disabled={threadStateMutation.isPending}
                            onClick={() =>
                              threadStateMutation.mutate({ id: comment.id, action: 'reopen' })
                            }
                          >
                            <RotateCcw className="h-3 w-3 mr-1" />
                            다시 열기
                          </Button>
                        )}
                      </div>
                    )}

                    {comment.resolvedAt && !expanded.has(comment.id) ? null : editingId ===
                      comment.id ? (
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
                        <div className="flex flex-wrap gap-x-2">
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
                          {canComment && !comment.resolvedAt && (
                            <Button
                              size="sm"
                              variant="ghost"
                              data-testid="resolve-thread"
                              disabled={threadStateMutation.isPending}
                              onClick={() =>
                                threadStateMutation.mutate({ id: comment.id, action: 'resolve' })
                              }
                            >
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              해결
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
            {replyingTo === comment.id && (!comment.resolvedAt || expanded.has(comment.id)) && (
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
            {(!comment.resolvedAt || expanded.has(comment.id)) &&
              getReplies(comment.id).map((reply) => (
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
                            {!reply.authorUserId && (
                              <span className="text-xs italic">(legacy)</span>
                            )}
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

      {comments.length > 0 && parentComments.length === 0 && (
        <p data-testid="no-threads" className="py-4 text-center text-sm text-muted-foreground">
          {filter === 'resolved' ? '해결된 토론이 없습니다.' : '열린 토론이 없습니다.'}
        </p>
      )}

      {comments.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No comments yet. Be the first to comment!</p>
        </div>
      )}
    </div>
  );
}
