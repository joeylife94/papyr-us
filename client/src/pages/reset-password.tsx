import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) {
      toast({
        title: '잘못된 링크',
        description: '유효하지 않은 비밀번호 재설정 링크입니다.',
        variant: 'destructive',
      });
      return;
    }

    if (password !== confirm) {
      toast({
        title: '비밀번호 불일치',
        description: '비밀번호와 확인 비밀번호가 일치하지 않습니다.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        toast({
          title: '비밀번호 재설정 완료',
          description: '새 비밀번호로 로그인하세요.',
        });
        navigate('/login');
      } else {
        toast({
          title: '재설정 실패',
          description: data.message || '요청 처리 중 오류가 발생했습니다.',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: '오류',
        description: '네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="w-full max-w-md p-8 space-y-4 bg-card text-card-foreground rounded-lg shadow-md text-center">
          <h2 className="text-2xl font-bold">잘못된 링크</h2>
          <p className="text-sm text-muted-foreground">
            유효하지 않은 비밀번호 재설정 링크입니다.
          </p>
          <Link to="/forgot-password" className="text-sm font-medium text-primary hover:underline">
            재설정 링크 다시 받기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="w-full max-w-md p-8 space-y-6 bg-card text-card-foreground rounded-lg shadow-md">
        <h2 className="text-2xl font-bold text-center">새 비밀번호 설정</h2>
        <p className="text-sm text-muted-foreground text-center">
          새 비밀번호는 8자 이상이며 영문, 숫자, 특수문자를 포함해야 합니다.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="password">새 비밀번호</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder="새 비밀번호"
              className="bg-input"
            />
          </div>
          <div>
            <Label htmlFor="confirm">비밀번호 확인</Label>
            <Input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
              placeholder="비밀번호 재입력"
              className="bg-input"
            />
          </div>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? '처리 중...' : '비밀번호 변경'}
          </Button>
        </form>
        <p className="text-sm text-center text-muted-foreground">
          <Link to="/login" className="font-medium text-primary hover:underline">
            로그인으로 돌아가기
          </Link>
        </p>
      </div>
    </div>
  );
}
