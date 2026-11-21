import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Get redirect URL from query params (set by ProtectedRoute or http.ts 401 handler)
  const query = new URLSearchParams(location.search);
  const redirectTo = query.get('redirect') || '/';
  // Set by the social sign-in callbacks (?error=account_deactivated) and by a 403 on password
  // sign-in: the account exists but an administrator has turned it off.
  const [isDeactivated, setIsDeactivated] = useState(query.get('error') === 'account_deactivated');

  // Set by the social sign-in callbacks when the sign-up policy turned a new account away.
  const refusalText = ((code: string | null) => {
    switch (code) {
      case 'signup_requires_invitation':
        return '이 워크스페이스는 초대를 받은 사람만 가입할 수 있습니다. 초대 링크를 받았다면 그 링크를 여세요.';
      case 'signup_closed':
        return '이 워크스페이스는 새 계정을 만들 수 없습니다.';
      case 'invitation_invalid':
        return '초대 링크를 사용할 수 없습니다. 링크가 만료되었거나 이미 사용되었을 수 있습니다. 초대한 사람에게 새 링크를 요청하세요.';
      case 'invitation_email_mismatch':
        return '이 초대는 다른 이메일 주소로 보낸 것입니다. 초대받은 주소의 계정으로 로그인하세요.';
      default:
        return null;
    }
  })(query.get('error'));

  const handleSocialLogin = (provider: 'google' | 'github') => {
    window.location.href = `/api/auth/${provider}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsDeactivated(false);
    try {
      await login(email, password);
      navigate(redirectTo);
      toast({
        title: 'Login Successful',
        description: 'Welcome back!',
      });
    } catch (error) {
      console.error('Failed to login:', error);
      if ((error as { status?: number })?.status === 403) {
        setIsDeactivated(true);
        return;
      }
      toast({
        title: 'Login Failed',
        description: 'Please check your credentials and try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="w-full max-w-md p-8 space-y-6 bg-card text-card-foreground rounded-lg shadow-md">
        <h2 className="text-2xl font-bold text-center">Login</h2>

        {isDeactivated && (
          <p
            role="alert"
            data-testid="login-account-deactivated"
            className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
          >
            This account has been deactivated. Contact an administrator to restore access.
          </p>
        )}

        {refusalText && (
          <p
            role="alert"
            data-testid="login-signup-refused"
            className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {refusalText}
          </p>
        )}

        <div className="space-y-4">
          <Button variant="outline" className="w-full" onClick={() => handleSocialLogin('google')}>
            Continue with Google
          </Button>
          <Button variant="outline" className="w-full" onClick={() => handleSocialLogin('github')}>
            Continue with GitHub
          </Button>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="px-2 bg-card text-muted-foreground">Or continue with</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="bg-input"
            />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="bg-input"
            />
          </div>
          <Button type="submit" className="w-full">
            Login with Email
          </Button>
        </form>

        <p className="text-sm text-center text-muted-foreground">
          Don't have an account?{' '}
          <Link to="/register" className="font-medium text-highlight hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
