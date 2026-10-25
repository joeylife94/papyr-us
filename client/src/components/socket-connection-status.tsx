import { useSocket } from '@/lib/socket';
import { AlertCircle, CheckCircle, Loader2, WifiOff } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useFeatureFlags } from '@/features/FeatureFlagsContext';

/**
 * SocketConnectionStatus - Real-time Socket.IO connection status indicator
 *
 * Displays:
 * - ✅ Connected (green)
 * - 🔄 Reconnecting with attempt count (yellow)
 * - ❌ Disconnected with error message (red)
 */
export default function SocketConnectionStatus() {
  const { flags } = useFeatureFlags();
  const enabled = flags.FEATURE_COLLABORATION;
  const { isConnected, isReconnecting, reconnectAttempt, reconnectError } = useSocket({ enabled });

  if (!enabled) return null;

  // Don't show anything if connected and no errors
  if (isConnected && !reconnectError) {
    return null;
  }

  // Reconnecting state
  if (isReconnecting) {
    return (
      <Alert className="fixed bottom-4 right-4 w-auto max-w-md bg-warning/10 border-warning/30 z-50">
        <Loader2 className="h-4 w-4 animate-spin text-warning" />
        <AlertDescription className="ml-2 text-warning">
          재연결 중... (시도 {reconnectAttempt}/5)
        </AlertDescription>
      </Alert>
    );
  }

  // Error state
  if (reconnectError) {
    return (
      <Alert className="fixed bottom-4 right-4 w-auto max-w-md bg-destructive/10 border-destructive/30 z-50">
        <AlertCircle className="h-4 w-4 text-destructive" />
        <AlertDescription className="ml-2 text-destructive">{reconnectError}</AlertDescription>
      </Alert>
    );
  }

  // Disconnected state
  if (!isConnected) {
    return (
      <Alert className="fixed bottom-4 right-4 w-auto max-w-md bg-muted border-border z-50">
        <WifiOff className="h-4 w-4 text-foreground-secondary" />
        <AlertDescription className="ml-2 text-foreground">
          실시간 협업 연결이 끊어졌습니다
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}

/**
 * Simple inline connection indicator (for editor toolbars, etc.)
 */
export function ConnectionIndicator() {
  const { flags } = useFeatureFlags();
  const enabled = flags.FEATURE_COLLABORATION;
  const { isConnected, isReconnecting } = useSocket({ enabled });

  if (!enabled) return null;

  if (isReconnecting) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-warning">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>재연결 중</span>
      </div>
    );
  }

  if (isConnected) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-success">
        <CheckCircle className="h-3 w-3" />
        <span>연결됨</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <WifiOff className="h-3 w-3" />
      <span>오프라인</span>
    </div>
  );
}
