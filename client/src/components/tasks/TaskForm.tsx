import React, { useState } from 'react';
import { Button } from '../ui/button';
import { DialogFooter } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Textarea } from '../ui/textarea';
import {
  isTaskTeamSelectionLocked,
  resolveTaskFormTeamId,
  type TaskTeamOption,
} from '../../lib/task-team-scope';

export interface TaskFormTask {
  title: string;
  description: string | null;
  status: 'todo' | 'in_progress' | 'review' | 'done';
  priority: number;
  assignedTo: number | null;
  teamId: string;
  dueDate: string | null;
  estimatedHours: number | null;
  tags: string[];
}

export interface TaskFormMember {
  id: number;
  name: string;
}

interface TaskFormProps {
  task?: TaskFormTask;
  onSubmit: (data: Record<string, unknown>) => void;
  members: TaskFormMember[];
  teams: TaskTeamOption[];
  effectiveTeamId?: string;
  onCancel: () => void;
}

export function TaskForm({
  task,
  onSubmit,
  members,
  teams,
  effectiveTeamId,
  onCancel,
}: TaskFormProps) {
  const resolvedTeamId = resolveTaskFormTeamId(task?.teamId, effectiveTeamId, teams);
  const teamSelectionLocked = isTaskTeamSelectionLocked(effectiveTeamId);

  const [formData, setFormData] = useState({
    title: task?.title || '',
    description: task?.description || '',
    status: task?.status || 'todo',
    priority: task?.priority || 3,
    assignedTo: task?.assignedTo || null,
    teamId: resolvedTeamId,
    dueDate: task?.dueDate ? task.dueDate.split('T')[0] : '',
    estimatedHours: task?.estimatedHours || '',
    tags: task?.tags || [],
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!formData.teamId) return;

    onSubmit({
      ...formData,
      estimatedHours: formData.estimatedHours ? parseInt(String(formData.estimatedHours), 10) : null,
      assignedTo: formData.assignedTo ? parseInt(String(formData.assignedTo), 10) : null,
    });
  };

  const selectableTeams = teamSelectionLocked
    ? [
        teams.find((team) => String(team.id) === resolvedTeamId) || {
          id: resolvedTeamId,
          name: resolvedTeamId,
        },
      ].filter((team) => Boolean(team.id))
    : teams;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="title">제목</Label>
          <Input
            id="title"
            value={formData.title}
            onChange={(event) => setFormData({ ...formData, title: event.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="teamId">팀</Label>
          <Select
            value={formData.teamId}
            disabled={teamSelectionLocked || selectableTeams.length === 0}
            onValueChange={(value) => setFormData({ ...formData, teamId: value, assignedTo: null })}
          >
            <SelectTrigger>
              <SelectValue placeholder="팀 선택" />
            </SelectTrigger>
            <SelectContent>
              {selectableTeams.map((team) => (
                <SelectItem key={String(team.id)} value={String(team.id)}>
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">설명</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(event) => setFormData({ ...formData, description: event.target.value })}
          rows={3}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="status">상태</Label>
          <Select
            value={formData.status}
            onValueChange={(value) =>
              setFormData({
                ...formData,
                status: value as 'todo' | 'in_progress' | 'review' | 'done',
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todo">할 일</SelectItem>
              <SelectItem value="in_progress">진행 중</SelectItem>
              <SelectItem value="review">검토</SelectItem>
              <SelectItem value="done">완료</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="priority">우선순위</Label>
          <Select
            value={String(formData.priority)}
            onValueChange={(value) => setFormData({ ...formData, priority: parseInt(value, 10) })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">매우 높음</SelectItem>
              <SelectItem value="2">높음</SelectItem>
              <SelectItem value="3">보통</SelectItem>
              <SelectItem value="4">낮음</SelectItem>
              <SelectItem value="5">매우 낮음</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="assignedTo">담당자</Label>
          <Select
            value={formData.assignedTo ? String(formData.assignedTo) : 'unassigned'}
            onValueChange={(value) =>
              setFormData({
                ...formData,
                assignedTo: value === 'unassigned' ? null : parseInt(value, 10),
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="담당자 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">미배정</SelectItem>
              {members.map((member) => (
                <SelectItem key={member.id} value={String(member.id)}>
                  {member.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="dueDate">마감일</Label>
          <Input
            id="dueDate"
            type="date"
            value={formData.dueDate}
            onChange={(event) => setFormData({ ...formData, dueDate: event.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="estimatedHours">예상 시간 (시간)</Label>
          <Input
            id="estimatedHours"
            type="number"
            value={formData.estimatedHours}
            onChange={(event) =>
              setFormData({ ...formData, estimatedHours: Number(event.target.value) })
            }
            min="0"
          />
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          취소
        </Button>
        <Button type="submit" disabled={!formData.teamId}>
          {task ? '수정' : '생성'}
        </Button>
      </DialogFooter>
    </form>
  );
}
