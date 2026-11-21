import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { noticeForRefusalCode, type AiRefusalCode } from '@/lib/ai-gate';

/**
 * What to do when the server refuses an AI request (403 ai_disabled / ai_not_granted): say why,
 * and ask for the organization again, so every AI entry point re-reads the caller's AI state and
 * goes away together, without a reload.
 */
export function useAiRefusal(): (code: AiRefusalCode) => void {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId: number | undefined = user?.id;
  return useCallback(
    (code: AiRefusalCode) => {
      toast({ title: noticeForRefusalCode(code), variant: 'destructive' });
      queryClient.invalidateQueries({ queryKey: ['/api/organization', userId] });
    },
    [toast, queryClient, userId]
  );
}
