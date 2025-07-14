import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { MessageCircle, Reply, Edit, Trash2, Send } from "lucide-react";

interface Comment {
  id: number;
  content: string;
  author: string;
  pageId: number;
  parentId: number | null;
  createdAt: string;
  updatedAt: string;
}

interface CommentsProps {
  pageId: number;
}

export function Comments({ pageId }: CommentsProps) {
  const [newComment, setNewComment] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [authorName, setAuthorName] = useState("Anonymous User");
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch comments for this page
  const { data: comments = [], refetch } = useQuery<Comment[]>({
    queryKey: [`/api/pages/${pageId}/comments`],
    queryFn: async () => {
      const response = await fetch(`/api/pages/${pageId}/comments`);
      if (!response.ok) throw new Error("Failed to fetch comments");
      return response.json();
    },
  });

  // Create comment mutation
  const createCommentMutation = useMutation({
    mutationFn: async (data: { content: string; author: string; parentId?: number }) => {
      const response = await fetch(`/api/pages/${pageId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to create comment");
      return response.json();
    },
    onSuccess: () => {
      refetch();
      setNewComment("");
      setReplyContent("");
      setReplyingTo(null);
      toast({
        title: "Comment posted",
        description: "Your comment has been added successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to post comment",
        variant: "destructive",
      });
    },
  });

  // Update comment mutation
  const updateCommentMutation = useMutation({
    mutationFn: async ({ id, content }: { id: number; content: string }) => {
      const response = await fetch(`/api/comments/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!response.ok) throw new Error("Failed to update comment");
      return response.json();
    },
    onSuccess: () => {
      refetch();
      setEditingId(null);
      setEditContent("");
      toast({
        title: "Comment updated",
        description: "Your comment has been updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update comment",
        variant: "destructive",
      });
    },
  });

  // Delete comment mutation
  const deleteCommentMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/comments/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete comment");
    },
    onSuccess: () => {
      refetch();
      toast({
        title: "Comment deleted",
        description: "Comment has been removed successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete comment",
        variant: "destructive",
      });
    },
  });

  const handleSubmitComment = () => {
    if (!newComment.trim()) return;
    createCommentMutation.mutate({
      content: newComment,
      author: authorName,
    });
  };

  const handleSubmitReply = (parentId: number) => {
    if (!replyContent.trim()) return;
    createCommentMutation.mutate({
      content: replyContent,
      author: authorName,
      parentId,
    });
  };

  const handleEditComment = (comment: Comment) => {
    setEditingId(comment.id);
    setEditContent(comment.content);
  };

  const handleSaveEdit = () => {
    if (!editContent.trim() || !editingId) return;
    updateCommentMutation.mutate({
      id: editingId,
      content: editContent,
    });
  };

  const handleDeleteComment = (id: number) => {
    if (confirm("Are you sure you want to delete this comment?")) {
      deleteCommentMutation.mutate(id);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Organize comments into threads (parent comments with their replies)
  const parentComments = comments.filter(comment => !comment.parentId);
  const getReplies = (parentId: number) => 
    comments.filter(comment => comment.parentId === parentId);

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-2">
        <MessageCircle className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">
          Comments ({comments.length})
        </h3>
      </div>

      {/* New Comment Form */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center space-x-2">
            <input
              type="text"
              placeholder="Your name"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              className="px-3 py-1 border rounded text-sm max-w-xs"
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder="Write a comment..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
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

      {/* Comments List */}
      <div className="space-y-4">
        {parentComments.map((comment) => (
          <div key={comment.id} className="space-y-3">
            {/* Parent Comment */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start space-x-3">
                  <Avatar>
                    <AvatarFallback>
                      {getInitials(comment.author)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {comment.author}
                      </span>
                      <span>•</span>
                      <span>{formatDate(comment.createdAt)}</span>
                    </div>
                    
                    {editingId === comment.id ? (
                      <div className="space-y-2">
                        <Textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="min-h-[60px]"
                        />
                        <div className="flex space-x-2">
                          <Button size="sm" onClick={handleSaveEdit}>
                            Save
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => setEditingId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">
                          {comment.content}
                        </p>
                        <div className="flex space-x-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setReplyingTo(comment.id)}
                          >
                            <Reply className="h-3 w-3 mr-1" />
                            Reply
                          </Button>
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
                      <Textarea
                        placeholder="Write a reply..."
                        value={replyContent}
                        onChange={(e) => setReplyContent(e.target.value)}
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
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => setReplyingTo(null)}
                        >
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
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-start space-x-3">
                      <Avatar>
                        <AvatarFallback>
                          {getInitials(reply.author)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">
                            {reply.author}
                          </span>
                          <span>•</span>
                          <span>{formatDate(reply.createdAt)}</span>
                        </div>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">
                          {reply.content}
                        </p>
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