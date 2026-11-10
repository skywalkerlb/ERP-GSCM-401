import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';

export interface OnlineUser {
  userId: string;
  name: string;
  role: string;
  locationId: number | null;
  isMe: boolean;
}

interface PresencePayload {
  user_id: string;
  name: string;
  role: string;
  location_id: number | null;
  online_at: string;
}

/**
 * Supabase Presence: who is signed in right now. Call it once in a layout and pass the result down.
 * Pass the selected location so others can see where you are working.
 */
export function usePresence(locationId: number | null = null): { users: OnlineUser[] } {
  const { user, profile } = useAuth();
  const [users, setUsers] = useState<OnlineUser[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const userId = user?.id ?? null;
  const name = profile?.full_name ?? user?.email ?? 'Someone';
  const role = profile?.role ?? 'staff';
  const latest = useRef({ name, role, locationId });
  latest.current = { name, role, locationId };

  useEffect(() => {
    if (!isSupabaseConfigured || !userId) return;
    const channel = supabase.channel('glazed-presence', { config: { presence: { key: userId } } });
    channelRef.current = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresencePayload>();
        const byUser = new Map<string, OnlineUser>();
        for (const metas of Object.values(state)) {
          for (const m of metas) {
            if (!m.user_id) continue;
            byUser.set(m.user_id, { userId: m.user_id, name: m.name, role: m.role, locationId: m.location_id ?? null, isMe: m.user_id === userId });
          }
        }
        const list = [...byUser.values()].sort((a, b) => Number(b.isMe) - Number(a.isMe) || a.name.localeCompare(b.name));
        setUsers(list);
      })
      .subscribe(async (s) => {
        if (s === 'SUBSCRIBED') {
          const l = latest.current;
          await channel.track({ user_id: userId, name: l.name, role: l.role, location_id: l.locationId, online_at: new Date().toISOString() });
        }
      });

    return () => {
      channelRef.current = null;
      setUsers([]);
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  // Tell the others when your name, role or location changes.
  useEffect(() => {
    const channel = channelRef.current;
    if (!channel || !userId) return;
    void channel.track({ user_id: userId, name, role, location_id: locationId, online_at: new Date().toISOString() }).catch(() => undefined);
  }, [userId, name, role, locationId]);

  return { users };
}
