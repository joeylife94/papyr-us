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
      <Alert className="fixed bottom-4 right-4 w-auto max-w-md bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-700 z-50">
        <Loader2 className="h-4 w-4 animate-spin text-yellow-600 dark:text-yellow-400" />
        <AlertDescription className="ml-2 text-yellow-800 dark:text-yellow-200">
          재연결 중... (시도 {reconnectAttempt}/5)
        </AlertDescription>
      </Alert>
    );
  }

  // Error state
  if (reconnectError) {
    return (
      <Alert className="fixed bottom-4 right-4 w-auto max-w-md bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-700 z-50">
        <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
        <AlertDescription className="ml-2 text-red-800 dark:text-red-200">
          {reconnectError}
        </AlertDescription>
      </Alert>
    );
  }

  // Disconnected state
  if (!isConnected) {
    return (
      <Alert className="fixed bottom-4 right-4 w-auto max-w-md bg-gray-50 border-gray-200 dark:bg-gray-900/20 dark:border-gray-700 z-50">
        <WifiOff className="h-4 w-4 text-gray-600 dark:text-gray-400" />
        <AlertDescription className="ml-2 text-gray-800 dark:text-gray-200">
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
      <div className="flex items-center gap-1.5 text-xs text-yellow-600 dark:text-yellow-400">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>재연결 중</span>
      </div>
    );
  }

  if (isConnected) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
        <CheckCircle className="h-3 w-3" />
        <span>연결됨</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
      <WifiOff className="h-3 w-3" />
      <span>오프라인</span>
    </div>
  );
}
