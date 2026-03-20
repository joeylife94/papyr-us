import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  Workflow,
  Plus,
  Play,
  Pause,
  Trash2,
  Edit,
  Clock,
  Zap,
  CheckCircle,
  XCircle,
} from 'lucide-react';

interface WorkflowData {
  id: number;
  name: string;
  description?: string;
  isActive: boolean;
  trigger: any;
  actions: any[];
  conditions?: any[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export default function AutomationPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowData | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newWorkflow, setNewWorkflow] = useState({
    name: '',
    description: '',
    triggerType: 'page_created',
    actionType: 'send_notification',
  });

  // Fetch workflows
  const { data: workflows, isLoading } = useQuery<WorkflowData[]>({
    queryKey: ['/api/workflows'],
  });

  // Toggle workflow
  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const response = await fetch(`/api/workflows/${id}/toggle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isActive }),
      });
      if (!response.ok) throw new Error('Failed to toggle workflow');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/workflows'] });
      toast({
        title: '워크플로우 업데이트됨',
        description: '워크플로우 상태가 변경되었습니다.',
      });
    },
    onError: () => {
      toast({
        title: '오류',
        description: '워크플로우 업데이트에 실패했습니다.',
        variant: 'destructive',
      });
    },
  });

  // Delete workflow
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/workflows/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete workflow');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/workflows'] });
      setSelectedWorkflow(null);
      toast({
        title: '워크플로우 삭제됨',
        description: '워크플로우가 성공적으로 삭제되었습니다.',
      });
    },
  });

  // Create workflow
  const createMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      description: string;
      triggerType: string;
      actionType: string;
    }) => {
      const response = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          description: data.description,
          trigger: { type: data.triggerType },
          actions: [{ type: data.actionType, config: {} }],
          conditions: [],
          isActive: false,
        }),
      });
      if (!response.ok) throw new Error('Failed to create workflow');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/workflows'] });
      setShowCreateDialog(false);
      setNewWorkflow({
        name: '',
        description: '',
        triggerType: 'page_created',
        actionType: 'send_notification',
      });
      toast({
        title: '워크플로우 생성됨',
        description: '새 워크플로우가 생성되었습니다.',
      });
    },
    onError: () => {
      toast({
        title: '오류',
        description: '워크플로우 생성에 실패했습니다.',
        variant: 'destructive',
      });
    },
  });

  const getTriggerLabel = (trigger: any) => {
    const type = trigger?.type || 'unknown';
    const labels: Record<string, string> = {
      page_created: '페이지 생성 시',
      page_updated: '페이지 업데이트 시',
      page_deleted: '페이지 삭제 시',
      task_created: '태스크 생성 시',
      task_status_changed: '태스크 상태 변경 시',
      task_assigned: '태스크 할당 시',
      task_due_soon: '태스크 기한 임박 시',
      comment_added: '댓글 추가 시',
      tag_added: '태그 추가 시',
      scheduled: '예약 실행',
    };
    return labels[type] || type;
  };

  const getActionLabels = (actions: any[]) => {
    const labels: Record<string, string> = {
      send_notification: '알림 전송',
      create_task: '태스크 생성',
      update_task: '태스크 업데이트',
      send_email: '이메일 전송',
      create_page: '페이지 생성',
      add_comment: '댓글 추가',
      add_tag: '태그 추가',
      assign_task: '태스크 할당',
      move_page: '페이지 이동',
      run_ai_summary: 'AI 요약 실행',
      webhook: '웹훅 호출',
    };
    return actions.map((a) => labels[a.type] || a.type);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Zap className="h-8 w-8 text-amber-500" />
            자동화 워크플로우
          </h1>
          <p className="text-muted-foreground mt-2">반복 작업을 자동화하고 팀 생산성을 높이세요</p>
        </div>
        <Button className="gap-2" onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4" />
          워크플로우 만들기
        </Button>
      </div>

      {/* Workflow List */}
      {workflows && workflows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Workflow className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">워크플로우가 없습니다</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
              첫 번째 자동화 워크플로우를 만들어 반복 작업을 자동화하세요.
            </p>
            <Button onClick={() => setShowCreateDialog(true)}>워크플로우 만들기</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {workflows?.map((workflow) => (
            <Card key={workflow.id} className="hover:border-primary/50 transition-colors">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <CardTitle>{workflow.name}</CardTitle>
                      <Badge variant={workflow.isActive ? 'default' : 'secondary'}>
                        {workflow.isActive ? (
                          <>
                            <Play className="h-3 w-3 mr-1" />
                            활성화
                          </>
                        ) : (
                          <>
                            <Pause className="h-3 w-3 mr-1" />
                            비활성화
                          </>
                        )}
                      </Badge>
                    </div>
                    {workflow.description && (
                      <CardDescription>{workflow.description}</CardDescription>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={workflow.isActive}
                      onCheckedChange={(checked) =>
                        toggleMutation.mutate({ id: workflow.id, isActive: checked })
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSelectedWorkflow(workflow)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm('정말 이 워크플로우를 삭제하시겠습니까?')) {
                          deleteMutation.mutate(workflow.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {/* Trigger */}
                  <div className="flex items-start gap-2">
                    <Badge variant="outline" className="bg-blue-50 dark:bg-blue-950">
                      트리거
                    </Badge>
                    <span className="text-sm">{getTriggerLabel(workflow.trigger)}</span>
                  </div>

                  {/* Conditions */}
                  {workflow.conditions && workflow.conditions.length > 0 && (
                    <div className="flex items-start gap-2">
                      <Badge variant="outline" className="bg-amber-50 dark:bg-amber-950">
                        조건
                      </Badge>
                      <span className="text-sm">{workflow.conditions.length}개 조건</span>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-start gap-2">
                    <Badge variant="outline" className="bg-green-50 dark:bg-green-950">
                      액션
                    </Badge>
                    <div className="flex flex-wrap gap-1">
                      {getActionLabels(workflow.actions).map((label, idx) => (
                        <Badge key={idx} variant="secondary" className="text-xs">
                          {label}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Meta */}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      생성: {new Date(workflow.createdAt).toLocaleDateString('ko-KR')}
                    </span>
                    <span>작성자: {workflow.createdBy}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Example Workflows */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>워크플로우 예시</CardTitle>
          <CardDescription>다음과 같은 자동화를 설정할 수 있습니다</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex gap-3 p-3 rounded-lg border">
              <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
              <div>
                <h4 className="font-medium text-sm mb-1">태스크 자동 알림</h4>
                <p className="text-xs text-muted-foreground">
                  태스크 기한 1일 전 자동으로 담당자에게 알림 전송
                </p>
              </div>
            </div>
            <div className="flex gap-3 p-3 rounded-lg border">
              <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
              <div>
                <h4 className="font-medium text-sm mb-1">페이지 자동 정리</h4>
                <p className="text-xs text-muted-foreground">
                  특정 태그가 추가되면 자동으로 해당 폴더로 페이지 이동
                </p>
              </div>
            </div>
            <div className="flex gap-3 p-3 rounded-lg border">
              <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
              <div>
                <h4 className="font-medium text-sm mb-1">AI 자동 요약</h4>
                <p className="text-xs text-muted-foreground">
                  새 페이지 생성 시 AI가 자동으로 요약을 댓글로 추가
                </p>
              </div>
            </div>
            <div className="flex gap-3 p-3 rounded-lg border">
              <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
              <div>
                <h4 className="font-medium text-sm mb-1">외부 연동</h4>
                <p className="text-xs text-muted-foreground">
                  태스크 완료 시 Slack, Discord 등 외부 서비스에 웹훅 전송
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Create Workflow Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>새 워크플로우 만들기</DialogTitle>
            <DialogDescription>
              자동화 워크플로우를 설정하세요. 트리거 조건과 실행할 액션을 선택합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="wf-name">워크플로우 이름</Label>
              <Input
                id="wf-name"
                placeholder="예: 새 페이지 알림"
                value={newWorkflow.name}
                onChange={(e) => setNewWorkflow({ ...newWorkflow, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wf-desc">설명 (선택)</Label>
              <Textarea
                id="wf-desc"
                placeholder="이 워크플로우가 하는 일을 설명하세요"
                value={newWorkflow.description}
                onChange={(e) => setNewWorkflow({ ...newWorkflow, description: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>트리거</Label>
              <Select
                value={newWorkflow.triggerType}
                onValueChange={(v) => setNewWorkflow({ ...newWorkflow, triggerType: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="page_created">페이지 생성 시</SelectItem>
                  <SelectItem value="page_updated">페이지 업데이트 시</SelectItem>
                  <SelectItem value="page_deleted">페이지 삭제 시</SelectItem>
                  <SelectItem value="task_created">태스크 생성 시</SelectItem>
                  <SelectItem value="task_status_changed">태스크 상태 변경 시</SelectItem>
                  <SelectItem value="task_assigned">태스크 할당 시</SelectItem>
                  <SelectItem value="task_due_soon">태스크 기한 임박 시</SelectItem>
                  <SelectItem value="comment_added">댓글 추가 시</SelectItem>
                  <SelectItem value="tag_added">태그 추가 시</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>액션</Label>
              <Select
                value={newWorkflow.actionType}
                onValueChange={(v) => setNewWorkflow({ ...newWorkflow, actionType: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="send_notification">알림 전송</SelectItem>
                  <SelectItem value="create_task">태스크 생성</SelectItem>
                  <SelectItem value="create_page">페이지 생성</SelectItem>
                  <SelectItem value="add_comment">댓글 추가</SelectItem>
                  <SelectItem value="add_tag">태그 추가</SelectItem>
                  <SelectItem value="move_page">페이지 이동</SelectItem>
                  <SelectItem value="run_ai_summary">AI 요약 실행</SelectItem>
                  <SelectItem value="webhook">웹훅 호출</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              취소
            </Button>
            <Button
              onClick={() => createMutation.mutate(newWorkflow)}
              disabled={!newWorkflow.name.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? '생성 중...' : '워크플로우 생성'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
