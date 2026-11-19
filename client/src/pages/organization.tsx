import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Building2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/hooks/useOrganization';
import { MembersTab } from '@/components/organization/members-tab';
import { TeamsTab } from '@/components/organization/teams-tab';
import { SettingsTab } from '@/components/organization/settings-tab';
import { ROLE_LABELS } from '@/components/organization/messages';
import { myAiLineFor } from '@/lib/ai-gate';

function Notice({
  title,
  children,
  testId,
}: {
  title: string;
  children?: ReactNode;
  testId: string;
}) {
  return (
    <Card className="max-w-xl" data-testid={testId}>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      {children ? (
        <CardContent className="text-foreground-secondary">{children}</CardContent>
      ) : null}
    </Card>
  );
}

/** Organization management for owners and admins (issue #124 X1c). The server decides every rule. */
export default function OrganizationPage() {
  const { user } = useAuth();
  const userId: number | undefined = user?.id;
  const queryClient = useQueryClient();
  const { organization, isLoading, isError, isSignedOut, canManage, aiState } = useOrganization();
  // What this person may do with AI, said to every member (owners' and admins' names are not shown)
  const myAiLine = myAiLineFor(aiState, organization?.role) ?? '';

  const body = (() => {
    if (isLoading) {
      return (
        <p className="text-foreground-secondary" data-testid="organization-loading">
          조직 정보를 불러오는 중…
        </p>
      );
    }
    if (isSignedOut) {
      // A 401 that survived the token refresh: no organization data, and no claim that the account
      // has none.
      return (
        <Notice title="로그인이 만료되었습니다" testId="organization-signed-out">
          <p className="mb-3">조직 정보를 보려면 다시 로그인하세요.</p>
          <Button variant="outline" asChild>
            <a href="/login">로그인</a>
          </Button>
        </Notice>
      );
    }
    if (isError) {
      return (
        <Notice title="조직 정보를 불러오지 못했습니다" testId="organization-error">
          <p className="mb-3">잠시 후 다시 시도하세요.</p>
          <Button
            variant="outline"
            onClick={() =>
              queryClient.invalidateQueries({ queryKey: ['/api/organization', userId] })
            }
          >
            다시 시도
          </Button>
        </Notice>
      );
    }
    if (!organization || userId == null) {
      return (
        <Notice title="소속된 조직이 없습니다" testId="organization-none">
          계정이 어떤 조직에도 속해 있지 않습니다. 플랫폼 관리자에게 문의하세요.
        </Notice>
      );
    }
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1
            className="flex min-w-0 items-center gap-3 text-2xl font-bold text-foreground sm:text-3xl"
            data-testid="organization-name"
          >
            <Building2 className="h-7 w-7 shrink-0 text-highlight" />
            <span className="break-words">{organization.name}</span>
          </h1>
          <Badge data-testid="organization-role">{ROLE_LABELS[organization.role]}</Badge>
        </div>

        <p className="text-sm text-foreground-secondary" data-testid="organization-my-ai">
          {myAiLine}
        </p>

        {!canManage ? (
          <Notice title="조직은 소유자와 관리자가 관리합니다" testId="organization-members-only">
            구성원 목록과 설정은 조직의 소유자와 관리자만 볼 수 있습니다.
          </Notice>
        ) : (
          <Tabs defaultValue="members" className="w-full">
            <TabsList className="grid w-full max-w-md grid-cols-3">
              <TabsTrigger value="members">구성원</TabsTrigger>
              <TabsTrigger value="teams">팀</TabsTrigger>
              <TabsTrigger value="settings">설정</TabsTrigger>
            </TabsList>
            <TabsContent value="members" className="mt-4">
              <MembersTab
                userId={userId}
                callerRole={organization.role}
                organizationAiEnabled={organization.aiEnabled}
              />
            </TabsContent>
            <TabsContent value="teams" className="mt-4">
              <TeamsTab userId={userId} />
            </TabsContent>
            <TabsContent value="settings" className="mt-4">
              <SettingsTab userId={userId} organization={organization} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    );
  })();

  return <div className="mx-auto w-full max-w-5xl p-4 sm:p-6">{body}</div>;
}
