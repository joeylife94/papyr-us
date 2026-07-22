import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import {
  Users,
  FileText,
  MessageSquare,
  CheckCircle,
  TrendingUp,
  Activity,
  Target,
} from 'lucide-react';

interface DashboardOverview {
  totalPages: number;
  totalComments: number;
  totalMembers: number;
  totalTasks: number;
  activeTeams: number;
  recentActivity: Array<{
    type: 'page' | 'comment';
    title?: string;
    content?: string;
    author: string;
    time: string;
  }>;
  teamStats: Array<{
    teamId: number;
    name: string;
    pages: number;
    comments: number;
    tasks: number;
  }>;
}

export default function DashboardPage() {
  const { data: overview, isLoading, isError } = useQuery<DashboardOverview>({
    queryKey: ['/api/dashboard/overview'],
    queryFn: async () => {
      const response = await fetch('/api/dashboard/overview');
      if (!response.ok) throw new Error('Failed to fetch dashboard overview');
      return response.json();
    },
  });

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">로딩 중...</div>
        </div>
      </div>
    );
  }

  if (isError || !overview) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center text-red-500">대시보드 데이터를 불러올 수 없습니다.</div>
      </div>
    );
  }

  const teamStats = overview.teamStats ?? [];
  const totalContributions = Math.max(
    overview.totalPages + overview.totalComments + overview.totalTasks,
    1
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">스터디 대시보드</h1>
          <p className="text-muted-foreground">접근 가능한 팀의 현황과 기여도를 확인하세요</p>
        </div>
        <Badge variant="secondary" className="text-sm">
          <Activity className="w-4 h-4 mr-2" />
          활성 팀 {overview.activeTeams}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">총 페이지</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview.totalPages}</div>
            <p className="text-xs text-muted-foreground">지식 베이스 구축</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">총 댓글</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview.totalComments}</div>
            <p className="text-xs text-muted-foreground">활발한 소통</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">활성 팀원</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview.totalMembers}</div>
            <p className="text-xs text-muted-foreground">참여 중인 멤버</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">전체 과제</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview.totalTasks}</div>
            <p className="text-xs text-muted-foreground">접근 가능한 팀 기준</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {teamStats.length === 0 ? (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>팀 현황</CardTitle>
              <CardDescription>현재 접근 가능한 팀이 없습니다.</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          teamStats.map((team) => {
            const teamTotal = team.pages + team.comments + team.tasks;
            return (
              <Card key={team.teamId}>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Target className="w-5 h-5 mr-2" />
                    {team.name}
                  </CardTitle>
                  <CardDescription>실제 팀 데이터 기준 기여 현황</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">전체 기여도</span>
                    <span className="text-sm text-muted-foreground">{teamTotal}개</span>
                  </div>
                  <Progress value={(teamTotal / totalContributions) * 100} className="h-2" />
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold text-blue-600">{team.pages}</div>
                      <div className="text-xs text-muted-foreground">페이지</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-green-600">{team.comments}</div>
                      <div className="text-xs text-muted-foreground">댓글</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-purple-600">{team.tasks}</div>
                      <div className="text-xs text-muted-foreground">과제</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <TrendingUp className="w-5 h-5 mr-2" />
            최근 활동
          </CardTitle>
          <CardDescription>접근 가능한 팀의 최근 기여 활동</CardDescription>
        </CardHeader>
        <CardContent>
          {(overview.recentActivity ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">표시할 최근 활동이 없습니다.</p>
          ) : (
            <div className="space-y-4">
              {overview.recentActivity.map((activity, index) => (
                <div key={index} className="flex items-start space-x-3 p-3 rounded-lg border">
                  {activity.type === 'page' ? (
                    <FileText className="w-5 h-5 text-blue-500" />
                  ) : (
                    <MessageSquare className="w-5 h-5 text-green-500" />
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{activity.author}</span>
                    <p className="text-sm text-muted-foreground mt-1">
                      {activity.type === 'page' ? activity.title : activity.content}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(activity.time).toLocaleString('ko-KR')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
