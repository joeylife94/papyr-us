import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { useSignupPolicy } from '@/hooks/useSignupPolicy';
import {
  INVITATION_ROLE_LABELS,
  tokenFromHash,
} from '@/components/organization/invitation-options';

/**
 * The page behind an invitation link (issue #124 X1d). The token is in the URL fragment
 * (`/join#token=...`), which a browser never sends to the server, so it is in no server log and
 * no Referer header. It is moved out of the address bar into this tab's sessionStorage (so the
 * sign-in detour and a reload keep it) and sent only in POST bodies. Every token the server
 * cannot use (unknown, expired, used, revoked) is shown as one message.
 */

const STORAGE_KEY = 'papyr.invitation';

function readStoredToken(): string | null {
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    return stored && tokenFromHash(`#token=${stored}`) ? stored : null;
  } catch {
    return null;
  }
}

function storeToken(token: string | null) {
  try {
    if (token) window.sessionStorage.setItem(STORAGE_KEY, token);
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Without storage a reload on this page asks for the link again.
  }
}

interface Preview {
  organizationName: string;
  role: 'member' | 'admin';
  emailHint: string | null;
}

class InvalidInvitation extends Error {}

async function fetchPreview(token: string): Promise<Preview> {
  const response = await fetch('/api/invitations/preview', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (response.status === 404) throw new InvalidInvitation();
  if (!response.ok) throw new Error('preview failed');
  return response.json();
}

type Outcome =
  | 'joined'
  | 'registered'
  | 'already_member'
  | 'other_organization'
  | 'email_mismatch'
  | 'account_inactive'
  | 'invalid';

const OUTCOME_VIEWS: Record<Outcome, { title: string; body: string }> = {
  joined: {
    title: '조직에 참여했습니다',
    body: '새 구성원은 AI 사용 권한 없이 시작합니다. 필요하면 조직 소유자나 관리자에게 요청하세요.',
  },
  registered: {
    title: '가입하고 조직에 참여했습니다',
    body: '새 구성원은 AI 사용 권한 없이 시작합니다. 필요하면 조직 소유자나 관리자에게 요청하세요.',
  },
  already_member: {
    title: '이미 이 조직의 구성원입니다',
    body: '이 초대는 사용된 것으로 처리되었고, 계정에는 바뀐 것이 없습니다.',
  },
  other_organization: {
    title: '이 계정은 이미 다른 조직에 속해 있습니다',
    body: '계정은 한 조직에만 속할 수 있고, 초대로 조직을 옮기지 않습니다. 아무것도 바뀌지 않았고 초대도 사용되지 않았습니다. 이 초대를 쓰려면 소속이 없는 다른 계정으로 로그인하세요.',
  },
  email_mismatch: {
    title: '이 초대는 다른 이메일 주소로 보낸 것입니다',
    body: '초대를 받은 이메일 주소의 계정으로 로그인하거나 가입하세요. 초대는 사용되지 않았습니다.',
  },
  account_inactive: {
    title: '이 계정은 비활성화되어 있습니다',
    body: '관리자에게 문의하세요. 초대는 사용되지 않았습니다.',
  },
  invalid: {
    title: '초대 링크를 사용할 수 없습니다',
    body: '링크가 올바르지 않거나, 만료되었거나, 이미 사용되었거나, 취소되었습니다. 초대한 사람에게 새 링크를 요청하세요.',
  },
};

function isOutcome(value: string | null): value is Outcome {
  return value !== null && value in OUTCOME_VIEWS;
}

function Shell({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div
        className="w-full max-w-md space-y-6 rounded-lg bg-card p-6 text-card-foreground shadow-md sm:p-8"
        data-testid={testId}
      >
        {children}
      </div>
    </div>
  );
}

function OutcomeView({ outcome, signedIn }: { outcome: Outcome; signedIn: boolean }) {
  const view = OUTCOME_VIEWS[outcome];
  const ok = outcome === 'joined' || outcome === 'registered' || outcome === 'already_member';
  return (
    <Shell testId={`join-outcome-${outcome}`}>
      <h1 className="text-xl font-bold" role={ok ? 'status' : 'alert'}>
        {view.title}
      </h1>
      <p className="text-sm text-muted-foreground">{view.body}</p>
      {ok ? (
        // A full load: the account's organization is read again from scratch.
        <Button className="w-full" onClick={() => window.location.assign('/')}>
          시작하기
        </Button>
      ) : signedIn ? (
        <Button variant="outline" className="w-full" onClick={() => window.location.assign('/')}>
          홈으로
        </Button>
      ) : (
        <Button variant="outline" className="w-full" asChild>
          <Link to="/login">로그인</Link>
        </Button>
      )}
    </Shell>
  );
}

export default function JoinPage() {
  const location = useLocation();
  const { isAuthenticated, isLoading: authLoading, user, logout } = useAuth();
  const { mode } = useSignupPolicy();

  // Taken from the fragment once, then kept out of the address bar.
  const [token, setToken] = useState<string | null>(() => tokenFromHash(location.hash));
  const [outcome, setOutcome] = useState<Outcome | null>(() => {
    const fromQuery = new URLSearchParams(location.search).get('result');
    return isOutcome(fromQuery) ? fromQuery : null;
  });
  useEffect(() => {
    const fromHash = tokenFromHash(window.location.hash);
    if (fromHash) {
      storeToken(fromHash);
      setToken(fromHash);
      window.history.replaceState(null, '', window.location.pathname);
    } else if (!token && !outcome) {
      setToken(readStoredToken());
    }
    // Run once: the fragment is read on arrival only.
  }, []);
  useEffect(() => {
    // An outcome from a social sign-in means the token was already used.
    if (outcome) storeToken(null);
  }, [outcome]);

  const preview = useQuery<Preview>({
    queryKey: ['/api/invitations/preview', token],
    queryFn: () => fetchPreview(token as string),
    enabled: token !== null && outcome === null,
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
  });

  useEffect(() => {
    // A token the server cannot use is not kept for the next visit.
    if (preview.error instanceof InvalidInvitation) storeToken(null);
  }, [preview.error]);

  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (outcome) return <OutcomeView outcome={outcome} signedIn={isAuthenticated} />;

  if (token === null) return <OutcomeView outcome="invalid" signedIn={isAuthenticated} />;

  if (preview.isLoading || authLoading) {
    return (
      <Shell testId="join-loading">
        <p className="text-sm text-muted-foreground">초대를 확인하는 중…</p>
      </Shell>
    );
  }
  if (preview.error instanceof InvalidInvitation) {
    return <OutcomeView outcome="invalid" signedIn={isAuthenticated} />;
  }
  if (preview.isError || !preview.data) {
    return (
      <Shell testId="join-error">
        <h1 className="text-xl font-bold">초대를 확인하지 못했습니다</h1>
        <p className="text-sm text-muted-foreground">잠시 후 다시 시도하세요.</p>
        <Button variant="outline" onClick={() => preview.refetch()}>
          다시 시도
        </Button>
      </Shell>
    );
  }

  const invite = preview.data;
  const roleText = INVITATION_ROLE_LABELS[invite.role];
  const heading = (
    <div className="space-y-1">
      <h1 className="text-xl font-bold" data-testid="join-heading">
        {invite.organizationName} 조직에 초대되었습니다
      </h1>
      <p className="text-sm text-muted-foreground">
        역할: {roleText}
        {invite.emailHint ? ` · 초대받은 주소: ${invite.emailHint}` : ''}
      </p>
    </div>
  );

  const accept = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/invitations/accept', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok) {
        storeToken(null);
        setOutcome(body.status === 'already_member' ? 'already_member' : 'joined');
        return;
      }
      if (response.status === 401) {
        setMessage('로그인이 만료되었습니다. 다시 로그인한 뒤 수락하세요.');
      } else if (response.status === 404) {
        storeToken(null);
        setOutcome('invalid');
      } else if (body.code === 'account_in_other_organization') {
        setOutcome('other_organization');
      } else if (body.code === 'invitation_email_mismatch') {
        setOutcome('email_mismatch');
      } else if (body.code === 'account_inactive') {
        setOutcome('account_inactive');
      } else if (response.status === 429 || response.status === 503) {
        setMessage('요청이 너무 많거나 조직이 바쁩니다. 잠시 후 다시 시도하세요.');
      } else {
        setMessage('수락하지 못했습니다. 잠시 후 다시 시도하세요.');
      }
    } catch {
      setMessage('서버에 연결하지 못했습니다. 네트워크를 확인한 뒤 다시 시도하세요.');
    } finally {
      setBusy(false);
    }
  };

  if (isAuthenticated) {
    return (
      <Shell testId="join-signed-in">
        {heading}
        <p className="text-sm text-muted-foreground" data-testid="join-account">
          {user?.email} 계정으로 참여합니다. 이 계정이 다른 조직에 속해 있으면 조직은 옮겨지지
          않습니다.
        </p>
        {message ? (
          <p role="alert" className="text-sm text-destructive" data-testid="join-message">
            {message}
          </p>
        ) : null}
        <Button className="w-full" disabled={busy} onClick={accept} data-testid="join-accept">
          {busy ? '참여하는 중…' : '조직에 참여하기'}
        </Button>
        <Button variant="ghost" className="w-full" disabled={busy} onClick={() => logout()}>
          다른 계정으로 계속하기
        </Button>
      </Shell>
    );
  }

  const email = form.email;

  const register = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email,
          password: form.password,
          invitationToken: token,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.status === 201) {
        storeToken(null);
        setOutcome('registered');
      } else if (response.status === 404) {
        storeToken(null);
        setOutcome('invalid');
      } else if (body.code === 'invitation_email_mismatch') {
        setMessage('이 초대는 다른 이메일 주소로 보낸 것입니다. 초대받은 주소로 가입하세요.');
      } else if (body.code === 'signup_closed') {
        setMessage(
          '이 서비스는 새 계정을 만들 수 없습니다. 이미 계정이 있다면 로그인한 뒤 초대를 수락하세요.'
        );
      } else if (response.status === 409) {
        setMessage('이미 가입된 이메일입니다. 로그인한 뒤 초대를 수락하세요.');
      } else if (response.status === 429 || response.status === 503) {
        setMessage('요청이 너무 많거나 조직이 바쁩니다. 잠시 후 다시 시도하세요.');
      } else if (response.status === 400 && typeof body.message === 'string') {
        setMessage(body.message);
      } else {
        setMessage('가입하지 못했습니다. 잠시 후 다시 시도하세요.');
      }
    } catch {
      setMessage('서버에 연결하지 못했습니다. 네트워크를 확인한 뒤 다시 시도하세요.');
    } finally {
      setBusy(false);
    }
  };

  const social = async (provider: 'google' | 'github') => {
    setBusy(true);
    try {
      // The token waits in an httpOnly cookie that only the sign-in routes receive.
      await fetch('/api/auth/oauth-invitation', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
    } catch {
      // The sign-in below still works; the invitation is then not carried along.
    }
    window.location.href = `/api/auth/${provider}`;
  };

  return (
    <Shell testId="join-signed-out">
      {heading}
      {mode === 'closed' ? (
        <p className="text-sm text-muted-foreground" data-testid="join-closed">
          이 서비스는 새 계정을 만들 수 없습니다. 이미 계정이 있다면 로그인한 뒤 이 링크를 다시 열어
          초대를 수락하세요.
        </p>
      ) : (
        <form onSubmit={register} className="space-y-4" data-testid="join-register-form">
          <div>
            <Label htmlFor="join-name">이름</Label>
            <Input
              id="join-name"
              value={form.name}
              maxLength={100}
              required
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="bg-input"
            />
          </div>
          <div>
            <Label htmlFor="join-email">이메일</Label>
            <Input
              id="join-email"
              type="email"
              value={email}
              required
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="bg-input"
            />
          </div>
          <div>
            <Label htmlFor="join-password">비밀번호</Label>
            <Input
              id="join-password"
              type="password"
              value={form.password}
              required
              minLength={8}
              maxLength={128}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="bg-input"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              8자 이상, 영문자·숫자·특수문자를 각각 하나 이상 포함하세요.
            </p>
          </div>
          {message ? (
            <p role="alert" className="text-sm text-destructive" data-testid="join-message">
              {message}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={busy} data-testid="join-register">
            {busy ? '가입하는 중…' : '가입하고 참여하기'}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => social('google')}
            >
              Google로 가입
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => social('github')}
            >
              GitHub로 가입
            </Button>
          </div>
        </form>
      )}
      <p className="text-center text-sm text-muted-foreground">
        이미 계정이 있나요?{' '}
        <Link
          to="/login?redirect=%2Fjoin"
          className="font-medium text-highlight hover:underline"
          data-testid="join-login-link"
        >
          로그인한 뒤 수락하기
        </Link>
      </p>
    </Shell>
  );
}
