import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { useSignupPolicy } from '@/hooks/useSignupPolicy';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();
  const { mode } = useSignupPolicy();
  const [policyRefusal, setPolicyRefusal] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, email, password }),
      });

      if (response.ok) {
        toast({
          title: 'Registration Successful',
          description: 'You can now log in with your new account.',
        });
        navigate('/login');
      } else {
        const errorData = await response.json();
        console.error('Failed to register:', errorData);
        // The sign-up policy (SIGNUP_MODE) turned this sign-up away: say why in the app's words.
        const policyText =
          errorData.code === 'signup_requires_invitation'
            ? '이 워크스페이스는 초대를 받은 사람만 가입할 수 있습니다. 초대 링크를 받았다면 그 링크를 여세요.'
            : errorData.code === 'signup_closed'
              ? '이 워크스페이스는 새 계정을 만들 수 없습니다.'
              : null;
        if (policyText) setPolicyRefusal(policyText);
        toast({
          title: 'Registration Failed',
          description: policyText || errorData.message || 'An unknown error occurred.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Failed to register:', error);
      toast({
        title: 'Registration Failed',
        description: 'An unexpected error occurred. Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="w-full max-w-md p-8 space-y-6 bg-card text-card-foreground rounded-lg shadow-md">
        <h2 className="text-2xl font-bold text-center">Register</h2>
        {mode === 'invite_only' ? (
          <p
            className="rounded-md border border-border bg-raised p-3 text-sm text-foreground-secondary"
            data-testid="register-invite-only"
          >
            이 워크스페이스는 초대를 받은 사람만 가입할 수 있습니다. 초대 링크를 받았다면 그 링크를
            여세요.
          </p>
        ) : null}
        {mode === 'closed' ? (
          <p
            className="rounded-md border border-border bg-raised p-3 text-sm text-foreground-secondary"
            data-testid="register-closed"
          >
            이 워크스페이스는 새 계정을 만들 수 없습니다. 이미 계정이 있다면 로그인하세요. 소속된
            조직이 없는 계정은 로그인한 뒤 초대 링크로 조직에 참여할 수 있습니다.
          </p>
        ) : null}
        {policyRefusal ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
            data-testid="register-refused"
          >
            {policyRefusal}
          </p>
        ) : null}
        {mode === 'closed' ? null : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="bg-input"
              />
            </div>
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
              Register
            </Button>
          </form>
        )}
        <p className="text-sm text-center text-muted-foreground">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-highlight hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
