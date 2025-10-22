import React from 'react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Task {
  id: number;
  title: string;
  description: string | null;
  status: 'todo' | 'in_progress' | 'review' | 'done';
  priority: number;
  assignedTo: number | null;
  teamId: string;
  dueDate: string | null;
  estimatedHours: number | null;
  actualHours: number | null;
  progress: number;
  tags: string[];
  linkedPageId: number | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

interface TaskChartsProps {
  tasks: Task[];
}

export function TaskCharts({ tasks }: TaskChartsProps) {
  // Status distribution
  const statusData = React.useMemo(() => {
    const statusCount: Record<string, number> = {};
    tasks.forEach((task) => {
      statusCount[task.status] = (statusCount[task.status] || 0) + 1;
    });
    return Object.entries(statusCount).map(([status, count]) => ({
      name:
        status === 'todo'
          ? '할 일'
          : status === 'in_progress'
            ? '진행 중'
            : status === 'review'
              ? '검토'
              : '완료',
      value: count,
      status,
    }));
  }, [tasks]);

  // Priority distribution
  const priorityData = React.useMemo(() => {
    const priorityCount: Record<string, number> = {};
    tasks.forEach((task) => {
      const priority = task.priority <= 2 ? 'high' : task.priority === 3 ? 'medium' : 'low';
      priorityCount[priority] = (priorityCount[priority] || 0) + 1;
    });
    return Object.entries(priorityCount).map(([priority, count]) => ({
      name: priority === 'low' ? '낮음' : priority === 'medium' ? '보통' : '높음',
      value: count,
      priority,
    }));
  }, [tasks]);

  // Tasks by assignee
  const assigneeData = React.useMemo(() => {
    const assigneeCount: Record<string, number> = {};
    tasks.forEach((task) => {
      const assignee = task.assignedTo || '미할당';
      assigneeCount[assignee] = (assigneeCount[assignee] || 0) + 1;
    });
    return Object.entries(assigneeCount)
      .map(([assignee, count]) => ({
        name: assignee,
        tasks: count,
      }))
      .sort((a, b) => b.tasks - a.tasks)
      .slice(0, 10);
  }, [tasks]);

  // Tasks over time (last 30 days)
  const timelineData = React.useMemo(() => {
    const today = new Date();
    const days: Record<string, { created: number; completed: number }> = {};

    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      days[dateStr] = { created: 0, completed: 0 };
    }

    tasks.forEach((task) => {
      const createdDate = new Date(task.createdAt).toISOString().split('T')[0];
      if (days[createdDate]) {
        days[createdDate].created++;
      }
      if (task.status === 'done' && task.updatedAt) {
        const completedDate = new Date(task.updatedAt).toISOString().split('T')[0];
        if (days[completedDate]) {
          days[completedDate].completed++;
        }
      }
    });

    return Object.entries(days).map(([date, counts]) => ({
      date: new Date(date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }),
      생성: counts.created,
      완료: counts.completed,
    }));
  }, [tasks]);

  // Completion rate by priority
  const completionByPriority = React.useMemo(() => {
    const stats: Record<string, { total: number; completed: number }> = {
      low: { total: 0, completed: 0 },
      medium: { total: 0, completed: 0 },
      high: { total: 0, completed: 0 },
    };

    tasks.forEach((task) => {
      const priority = task.priority <= 2 ? 'high' : task.priority === 3 ? 'medium' : 'low';
      stats[priority].total++;
      if (task.status === 'done') {
        stats[priority].completed++;
      }
    });

    return Object.entries(stats).map(([priority, stat]) => ({
      name: priority === 'low' ? '낮음' : priority === 'medium' ? '보통' : '높음',
      완료율: stat.total > 0 ? Math.round((stat.completed / stat.total) * 100) : 0,
      완료: stat.completed,
      전체: stat.total,
    }));
  }, [tasks]);

  const COLORS = {
    todo: '#3B82F6',
    in_progress: '#F59E0B',
    review: '#A855F7',
    done: '#10B981',
    low: '#6B7280',
    medium: '#F59E0B',
    high: '#EF4444',
  };

  return (
    <Tabs defaultValue="overview" className="w-full">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="overview">개요</TabsTrigger>
        <TabsTrigger value="status">상태</TabsTrigger>
        <TabsTrigger value="priority">우선순위</TabsTrigger>
        <TabsTrigger value="timeline">타임라인</TabsTrigger>
      </TabsList>

      {/* Overview */}
      <TabsContent value="overview" className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>전체 태스크</CardDescription>
              <CardTitle className="text-3xl">{tasks.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>진행 중</CardDescription>
              <CardTitle className="text-3xl text-amber-500">
                {tasks.filter((t) => t.status === 'in_progress').length}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>완료</CardDescription>
              <CardTitle className="text-3xl text-green-500">
                {tasks.filter((t) => t.status === 'done').length}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>완료율</CardDescription>
              <CardTitle className="text-3xl">
                {tasks.length > 0
                  ? Math.round(
                      (tasks.filter((t) => t.status === 'done').length / tasks.length) * 100
                    )
                  : 0}
                %
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>담당자별 태스크</CardTitle>
              <CardDescription>상위 10명</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={assigneeData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="tasks" fill="#3B82F6" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>우선순위별 완료율</CardTitle>
              <CardDescription>우선순위별 진행 상황</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={completionByPriority}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="완료" fill="#10B981" />
                  <Bar dataKey="전체" fill="#E5E7EB" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      {/* Status Distribution */}
      <TabsContent value="status">
        <Card>
          <CardHeader>
            <CardTitle>상태별 태스크 분포</CardTitle>
            <CardDescription>현재 태스크의 상태 분포</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={120}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[entry.status as keyof typeof COLORS]}
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4 flex justify-center gap-4">
              {statusData.map((entry) => (
                <div key={entry.status} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: COLORS[entry.status as keyof typeof COLORS] }}
                  />
                  <span className="text-sm">
                    {entry.name}: {entry.value}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Priority Distribution */}
      <TabsContent value="priority">
        <Card>
          <CardHeader>
            <CardTitle>우선순위별 태스크 분포</CardTitle>
            <CardDescription>우선순위에 따른 태스크 분류</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <PieChart>
                <Pie
                  data={priorityData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={120}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {priorityData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[entry.priority as keyof typeof COLORS]}
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4 flex justify-center gap-4">
              {priorityData.map((entry) => (
                <div key={entry.priority} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: COLORS[entry.priority as keyof typeof COLORS] }}
                  />
                  <span className="text-sm">
                    {entry.name}: {entry.value}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Timeline */}
      <TabsContent value="timeline">
        <Card>
          <CardHeader>
            <CardTitle>태스크 타임라인</CardTitle>
            <CardDescription>최근 30일간 생성/완료된 태스크</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={timelineData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="생성" stroke="#3B82F6" strokeWidth={2} />
                <Line type="monotone" dataKey="완료" stroke="#10B981" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
