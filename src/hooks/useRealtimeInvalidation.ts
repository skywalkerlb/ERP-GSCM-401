import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { keysForTopic } from '@/lib/realtimeTopics';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import { useAuth } from './useAuth';

export type ConnectionStatus = 'connecting' | 'live' | 'offline';

/** A row of `app_events`. */
export interface AppEvent {
  id: number;
  topic: string;
  entity: string | null;
  entity_id: number | null;
  location_id: number | null;
  customer_id: number | null;
  actor_id: string | null;
  summary: string | null;
  at: string;
}

/**
 * One Supabase channel on INSERTs into `app_events`. Each event refreshes the query keys for its topic
 * (see src/lib/realtimeTopics.ts) and, when someone else caused it, shows a toast with its summary.
 * Call it once in a layout. The queryClient also refetches every 30 seconds as a fallback.
 */
export function useRealtimeInvalidation(options: { toasts?: boolean } = {}): { status: ConnectionStatus } {
  const { toasts = true } = options;
  const queryClient = useQueryClient();
  const toast = useToast();
  const { user, profile } = useAuth();
  const businessId = profile?.business_id;
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const lastToast = useRef(0);
  const userId = user?.id ?? null;
  const customer = profile?.role === 'customer';

  useEffect(() => {
    if (!isSupabaseConfigured || !userId || !businessId) return;
    setStatus('connecting');
    const channel = supabase
      .channel(`business:${businessId}:${customer ? `customer:${userId}` : 'events'}`, { config: { private: true } })
      .on('broadcast', { event: 'app-event' }, (message) => {
        const event = message.payload as AppEvent & { business_id?: string };
        if (event.business_id !== businessId) return;
        for (const queryKey of keysForTopic(event.topic)) {
          void queryClient.invalidateQueries({ queryKey });
        }
        const now = Date.now();
        if (toasts && event.summary && event.actor_id && event.actor_id !== userId && now - lastToast.current > 800) {
          lastToast.current = now;
          toastRef.current.info(event.summary);
        }
      })
      .subscribe((s) => {
        if (s === 'SUBSCRIBED') setStatus('live');
        else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') setStatus('offline');
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, businessId, customer, queryClient, toasts]);

  return { status };
}
