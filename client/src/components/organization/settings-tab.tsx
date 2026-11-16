import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import type { CurrentOrganization } from '@/hooks/useOrganization';
import { OrganizationApiError, organizationRequest } from './api';
import { organizationErrorText } from './messages';

interface Props {
  userId: number;
  organization: CurrentOrganization;
}

const AI_WARNING = '켜면 문서 내용이 외부 AI 제공자(OpenAI)로 전송됩니다.';

export function SettingsTab({ userId, organization }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  // null until the person types: an untouched field follows the organization's current name.
  const [draft, setDraft] = useState<string | null>(null);
  const name = draft ?? organization.name;
  const [nameError, setNameError] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [confirmAiOn, setConfirmAiOn] = useState(false);

  // Every part of the app that reads the organization (the AI entry points included) asks again.
  const refreshOrganization = () =>
    queryClient.invalidateQueries({ queryKey: ['/api/organization', userId] });

  const afterRefusal = (error: unknown) => {
    if (error instanceof OrganizationApiError && (error.status === 403 || error.status === 401)) {
      refreshOrganization();
    }
  };

  const nameMutation = useMutation({
    mutationFn: (next: string) =>
      organizationRequest<CurrentOrganization>('/api/organization', {
        method: 'PATCH',
        body: { name: next },
      }),
    onSuccess: (result) => {
      setDraft(null);
      refreshOrganization();
      toast({ title: '조직 이름을 바꿨습니다', description: result.name });
    },
    onError: (error) => {
      afterRefusal(error);
      setNameError(organizationErrorText(error));
    },
  });

  const aiMutation = useMutation({
    mutationFn: (aiEnabled: boolean) =>
      organizationRequest<CurrentOrganization>('/api/organization', {
        method: 'PATCH',
        body: { aiEnabled },
      }),
    onSuccess: (result) => {
      refreshOrganization();
      toast({
        title: result.aiEnabled ? 'AI 기능을 켰습니다' : 'AI 기능을 껐습니다',
        description: result.aiEnabled
          ? '이 조직의 문서 내용이 AI 기능 사용 시 외부 AI 제공자로 전송됩니다.'
          : '이 조직의 문서 내용은 외부 AI 제공자로 전송되지 않습니다.',
      });
    },
    onError: (error) => {
      afterRefusal(error);
      setAiError(organizationErrorText(error));
    },
  });

  const trimmed = name.trim();
  const unchanged = trimmed === organization.name;

  const saveName = () => {
    setNameError(null);
    if (trimmed.length === 0) {
      setNameError('조직 이름을 입력하세요.');
      return;
    }
    if (trimmed.length > 100) {
      setNameError('조직 이름은 100자 이하여야 합니다.');
      return;
    }
    nameMutation.mutate(trimmed);
  };

  const toggleAi = (next: boolean) => {
    setAiError(null);
    if (next) {
      setConfirmAiOn(true);
    } else {
      aiMutation.mutate(false);
    }
  };

  return (
    <div className="max-w-xl space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">조직 이름</h2>
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            saveName();
          }}
          noValidate
        >
          <Label htmlFor="organization-name">이름</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="organization-name"
              value={name}
              maxLength={200}
              autoComplete="off"
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? 'organization-name-error' : undefined}
              onChange={(event) => {
                setDraft(event.target.value);
                setNameError(null);
              }}
              data-testid="organization-name-input"
            />
            <Button
              type="submit"
              disabled={unchanged || nameMutation.isPending}
              data-testid="organization-name-save"
            >
              {nameMutation.isPending ? '저장 중…' : '저장'}
            </Button>
          </div>
          {nameError ? (
            <p
              id="organization-name-error"
              className="text-sm text-destructive"
              role="alert"
              data-testid="organization-name-error"
            >
              {nameError}
            </p>
          ) : null}
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">AI 기능</h2>
        <div className="flex items-start justify-between gap-4 rounded-md border border-border p-4">
          <div className="space-y-1">
            <Label htmlFor="organization-ai">이 조직에서 AI 기능 사용</Label>
            <p className="text-sm text-foreground-secondary">{AI_WARNING}</p>
            <p className="text-sm text-foreground-secondary">
              현재: {organization.aiEnabled ? '켜짐' : '꺼짐'}
            </p>
          </div>
          <Switch
            id="organization-ai"
            checked={organization.aiEnabled}
            disabled={aiMutation.isPending}
            onCheckedChange={toggleAi}
            data-testid="organization-ai-switch"
          />
        </div>
        {aiError ? (
          <p className="text-sm text-destructive" role="alert" data-testid="organization-ai-error">
            {aiError}
          </p>
        ) : null}
      </section>

      <AlertDialog open={confirmAiOn} onOpenChange={setConfirmAiOn}>
        <AlertDialogContent data-testid="confirm-ai-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>AI 기능을 켤까요?</AlertDialogTitle>
            <AlertDialogDescription>{AI_WARNING}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction data-testid="confirm-ai-on" onClick={() => aiMutation.mutate(true)}>
              켜기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
