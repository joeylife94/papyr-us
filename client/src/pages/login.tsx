import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, socialLogin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    const token = query.get('token');
    if (token) {
      socialLogin(token);
      navigate('/');
    }
  }, [location, socialLogin, navigate]);

  const handleSocialLogin = (provider: 'google' | 'github') => {
    window.location.href = `/api/auth/${provider}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(email, password);
      navigate('/');
      toast({
        title: 'Login Successful',
        description: 'Welcome back!',
      });
    } catch (error) {
      console.error('Failed to login:', error);
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
          <Link to="/register" className="font-medium text-primary hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
