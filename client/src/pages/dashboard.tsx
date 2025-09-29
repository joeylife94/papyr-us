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
  Calendar,
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
    teamId: string;
    name: string;
    pages: number;
    comments: number;
    tasks: number;
  }>;
}

interface TeamProgressStats {
  id: number;
  teamId: string;
  memberId: number | null;
  memberName?: string;
  memberRole?: string;
  pagesCreated: number;
  commentsWritten: number;
  tasksCompleted: number;
  lastActiveAt: string;
  updatedAt: string;
}

export default function DashboardPage() {
  // Fetch dashboard overview data
  const { data: overview, isLoading: overviewLoading } = useQuery<DashboardOverview>({
    queryKey: ['/api/dashboard/overview'],
    queryFn: async () => {
      const response = await fetch('/api/dashboard/overview');
      if (!response.ok) {
        throw new Error('Failed to fetch dashboard overview');
      }
      return response.json();
    },
  });

  // Fetch team progress stats
  const { data: team1Stats, isLoading: team1Loading } = useQuery<TeamProgressStats[]>({
    queryKey: ['/api/dashboard/team/team1'],
    queryFn: async () => {
      const response = await fetch('/api/dashboard/team/team1');
      if (!response.ok) {
        throw new Error('Failed to fetch team1 stats');
      }
      return response.json();
    },
  });

  const { data: team2Stats, isLoading: team2Loading } = useQuery<TeamProgressStats[]>({
    queryKey: ['/api/dashboard/team/team2'],
    queryFn: async () => {
      const response = await fetch('/api/dashboard/team/team2');
      if (!response.ok) {
        throw new Error('Failed to fetch team2 stats');
      }
      return response.json();
    },
  });

  const isLoadingAny = overviewLoading || team1Loading || team2Loading;

  const totalContributions = overview
    ? overview.totalPages + overview.totalComments + overview.totalTasks
    : 0;
  const team1Total =
    team1Stats?.reduce(
      (sum, stat) => sum + stat.pagesCreated + stat.commentsWritten + stat.tasksCompleted,
      0
    ) || 0;
  const team2Total =
    team2Stats?.reduce(
      (sum, stat) => sum + stat.pagesCreated + stat.commentsWritten + stat.tasksCompleted,
      0
    ) || 0;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">스터디 대시보드</h1>
          <p className="text-muted-foreground">팀 전체의 진도 현황과 기여도를 한눈에 확인하세요</p>
        </div>
        <Badge variant="secondary" className="text-sm">
          <Activity className="w-4 h-4 mr-2" />
          실시간 업데이트
        </Badge>
      </div>

      {isLoadingAny && (
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">로딩 중...</div>
        </div>
      )}

      {!isLoadingAny && !overview && (
        <div className="text-center text-red-500">대시보드 데이터를 불러올 수 없습니다.</div>
      )}

      {/* Overview Cards */}
      {!isLoadingAny && overview && (
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
              <CardTitle className="text-sm font-medium">완료 과제</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{overview.totalTasks}</div>
              <p className="text-xs text-muted-foreground">달성한 목표</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Team Progress */}
      {!isLoadingAny && overview && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Team Alpha */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Target className="w-5 h-5 mr-2 text-orange-500" />
                Team Alpha
              </CardTitle>
              <CardDescription>프론트엔드 개발팀</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">전체 기여도</span>
                <span className="text-sm text-muted-foreground">{team1Total}개</span>
              </div>
              <Progress value={(team1Total / totalContributions) * 100} className="h-2" />

              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-blue-600">
                    {team1Stats?.find((s) => !s.memberId)?.pagesCreated || 0}
                  </div>
                  <div className="text-xs text-muted-foreground">페이지</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-600">
                    {team1Stats?.find((s) => !s.memberId)?.commentsWritten || 0}
                  </div>
                  <div className="text-xs text-muted-foreground">댓글</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-purple-600">
                    {team1Stats?.find((s) => !s.memberId)?.tasksCompleted || 0}
                  </div>
                  <div className="text-xs text-muted-foreground">과제</div>
                </div>
              </div>

              {/* Member breakdown */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium">팀원별 기여도</h4>
                {team1Stats
                  ?.filter((s) => s.memberId)
                  .map((member) => (
                    <div key={member.id} className="flex justify-between items-center text-sm">
                      <span>{member.memberName}</span>
                      <span className="text-muted-foreground">
                        {member.pagesCreated + member.commentsWritten + member.tasksCompleted}개
                      </span>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>

          {/* Team Beta */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Target className="w-5 h-5 mr-2 text-teal-500" />
                Team Beta
              </CardTitle>
              <CardDescription>백엔드 개발팀</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">전체 기여도</span>
                <span className="text-sm text-muted-foreground">{team2Total}개</span>
              </div>
              <Progress value={(team2Total / totalContributions) * 100} className="h-2" />

              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-blue-600">
                    {team2Stats?.find((s) => !s.memberId)?.pagesCreated || 0}
                  </div>
                  <div className="text-xs text-muted-foreground">페이지</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-600">
                    {team2Stats?.find((s) => !s.memberId)?.commentsWritten || 0}
                  </div>
                  <div className="text-xs text-muted-foreground">댓글</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-purple-600">
                    {team2Stats?.find((s) => !s.memberId)?.tasksCompleted || 0}
                  </div>
                  <div className="text-xs text-muted-foreground">과제</div>
                </div>
              </div>

              {/* Member breakdown */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium">팀원별 기여도</h4>
                {team2Stats
                  ?.filter((s) => s.memberId)
                  .map((member) => (
                    <div key={member.id} className="flex justify-between items-center text-sm">
                      <span>{member.memberName}</span>
                      <span className="text-muted-foreground">
                        {member.pagesCreated + member.commentsWritten + member.tasksCompleted}개
                      </span>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Recent Activity */}
      {!isLoadingAny && overview && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <TrendingUp className="w-5 h-5 mr-2" />
              최근 활동
            </CardTitle>
            <CardDescription>팀원들의 최근 기여 활동</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {overview.recentActivity.map((activity, index) => (
                <div key={index} className="flex items-start space-x-3 p-3 rounded-lg border">
                  <div className="flex-shrink-0">
                    {activity.type === 'page' ? (
                      <FileText className="w-5 h-5 text-blue-500" />
                    ) : (
                      <MessageSquare className="w-5 h-5 text-green-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium">{activity.author}</span>
                      <Badge variant="outline" className="text-xs">
                        {activity.type === 'page' ? '페이지' : '댓글'}
                      </Badge>
                    </div>
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
