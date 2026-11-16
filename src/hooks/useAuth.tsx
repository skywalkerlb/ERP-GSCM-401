import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase, isDemo, exitDemo } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';
import { USERNAME_PATTERN, normalizeUsername, usernameEmail } from '../../supabase/functions/_shared/identity';

export type AppRole = 'owner' | 'admin' | 'manager' | 'cashier' | 'baker' | 'customer';
export interface Profile {
  user_id: string;
  full_name: string | null;
  role: AppRole;
  home_location_id: number | null;
  customer_id: number | null;
}
export interface AuthResult { error?: string }
export function signupFieldErrors(input: { username: string; password: string }): Partial<Record<'username' | 'password', string>> {
  return {
    ...(!USERNAME_PATTERN.test(normalizeUsername(input.username)) ? { username: 'Use 3–30 letters, numbers or underscores.' } : {}),
    ...(input.password.length < 6 ? { password: 'Use a password with at least 6 characters.' } : {}),
  };
}
export function validateSignup(input: { username: string; password: string }): string | null {
  return Object.values(signupFieldErrors(input))[0] ?? null;
}
export interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  profileError: string | null;
  loading: boolean;
  signIn: (identifier: string, password: string) => Promise<AuthResult & { profile?: Profile | null }>;
  signUp: (input: { username: string; password: string }) => Promise<AuthResult & { profile?: Profile | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<Profile | null>;
}
const AuthContext = createContext<AuthContextValue | null>(null);

/** Return actionable errors without treating backend failures as an unassigned role. */
export function friendlyAuthError(error: unknown): string {
  const value = error as { code?: string; message?: string } | null;
  const message = value?.message ?? '';
  switch (value?.code) {
    case 'invalid_credentials': return 'That username or email and password do not match. Check both or reset your password.';
    case 'email_not_confirmed': return 'Account setup is incomplete. Ask the platform owner to finish account setup, then try signing in again.';
    case 'user_already_exists': case 'email_exists': return 'That account already exists. Sign in instead or choose another username.';
    case 'over_request_rate_limit': case 'over_email_send_rate_limit': return 'Too many attempts. Wait a minute and try again.';
    case 'weak_password': return 'Use a password with at least 6 characters.';
    case 'PGRST205': case '42P01': return 'Account setup is unavailable. Ask the platform owner to finish backend setup, then try again.';
    case '42501': return 'Your account profile could not be loaded. Ask the platform owner to check your access.';
  }
  const m = message.toLowerCase();
  if (m.includes('invalid login')) return 'That username or email and password do not match. Check both or reset your password.';
  if (m.includes('email not confirmed')) return 'Account setup is incomplete. Ask the platform owner to finish account setup, then try signing in again.';
  if (m.includes('already registered')) return 'That account already exists. Sign in instead or choose another username.';
  if (m.includes('rate limit')) return 'Too many attempts. Wait a minute and try again.';
  if (m.includes('fetch') || m.includes('network')) return 'Could not reach the server. Check your connection and try again.';
  return 'The request could not be completed. Try again, or ask the platform owner for help.';
}

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles')
    .select('user_id, full_name, role, home_location_id, customer_id').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}
async function fetchProfileWithRetry(userId: string): Promise<Profile | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const profile = await fetchProfile(userId);
    if (profile) return profile;
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [sessionChecked, setSessionChecked] = useState(!isSupabaseConfigured);
  const [checkedUserId, setCheckedUserId] = useState<string | null>(null);
  const userId = session?.user.id ?? null;
  const currentProfile = useRef<Profile | null>(null);
  const currentUserId = useRef(userId);
  currentUserId.current = userId;
  const applyProfile = useCallback((next: Profile | null) => {
    const previous = currentProfile.current;
    if (previous?.user_id !== next?.user_id || previous?.role !== next?.role || previous?.home_location_id !== next?.home_location_id || previous?.customer_id !== next?.customer_id) queryClient.clear();
    currentProfile.current = next;
    setProfile(next);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    let eventReceived = false;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      eventReceived = true;
      if (active) { setSession(next); setSessionChecked(true); }
    });
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active || eventReceived) return;
      setSession(data.session);
      if (error) setProfileError(friendlyAuthError(error));
    }).catch((error: unknown) => {
      if (active) setProfileError(friendlyAuthError(error));
    }).finally(() => { if (active) setSessionChecked(true); });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    let active = true;
    applyProfile(null);
    setProfileError(null);
    if (!userId) { setCheckedUserId(null); return; }
    let inFlight = false;
    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const next = await fetchProfileWithRetry(userId);
        if (!active) return;
        applyProfile(next);
        setProfileError(null);
        if (!next) setProfileError('You are signed in, but your account has no role yet. Ask the platform owner to set it up.');
      } catch (error) {
        if (active) { applyProfile(null); setProfileError(friendlyAuthError(error)); }
      } finally {
        inFlight = false;
        if (active) setCheckedUserId(userId);
      }
    };
    void refresh();
    const onFocus = () => { void refresh(); };
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 30_000);
    window.addEventListener('focus', onFocus);
    // Treat realtime payloads only as invalidation signals; read access through RLS again.
    const channel = supabase.channel(`account-access-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `user_id=eq.${userId}` }, onFocus)
      .subscribe();
    return () => { active = false; window.clearInterval(interval); window.removeEventListener('focus', onFocus); void supabase.removeChannel(channel); };
  }, [userId, applyProfile]);

  const signIn = useCallback<AuthContextValue['signIn']>(async (identifier, password) => {
    const value = identifier.trim();
    if (!value || !password) return { error: 'Enter your username and password.' };
    if (!value.includes('@') && !USERNAME_PATTERN.test(normalizeUsername(value))) return { error: 'Enter your username or existing account email.' };
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: value.includes('@') ? value : usernameEmail(value), password });
      if (error) return { error: friendlyAuthError(error) };
      const next = data.user ? await fetchProfileWithRetry(data.user.id) : null;
      setSession(data.session);
      applyProfile(next);
      setCheckedUserId(data.user?.id ?? null);
      setProfileError(next ? null : 'You are signed in, but your account has no role yet. Ask the platform owner to set it up.');
      return { profile: next };
    } catch (error) { return { error: friendlyAuthError(error) }; }
  }, [applyProfile]);
  const signUp = useCallback<AuthContextValue['signUp']>(async ({ username, password }) => {
    const invalid = validateSignup({ username, password });
    if (invalid) return { error: invalid };
    if (isDemo) return { error: 'Exit the demo before creating your account.' };
    try {
      const normalized = normalizeUsername(username);
      const { data, error } = await supabase.auth.signUp({ email: usernameEmail(normalized), password,
        options: { data: { username: normalized, full_name: normalized } } });
      if (error) return { error: friendlyAuthError(error) };
      if (!data.session || !data.user) return { error: 'Account setup is incomplete. Ask the platform owner to finish account setup, then try signing in again.' };
      // Establish the session even if profile loading fails, so account setup can be retried.
      setSession(data.session);
      const next = await fetchProfileWithRetry(data.user.id);
      applyProfile(next);
      setCheckedUserId(data.user.id);
      setProfileError(next ? null : 'Your account was created, but its profile is unavailable. Try signing in again.');
      return next ? { profile: next } : { error: 'Your account was created, but its profile is unavailable. Try signing in again.' };
    } catch (error) { return { error: friendlyAuthError(error) }; }
  }, [applyProfile]);
  const signOut = useCallback(async () => {
    if (isDemo) { await exitDemo(); return; }
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    queryClient.clear();
    setSession(null); setProfile(null); currentProfile.current = null; setProfileError(null);
  }, []);
  const refreshProfile = useCallback(async () => {
    if (!userId) return null;
    try {
      const next = await fetchProfile(userId);
      if (currentUserId.current !== userId) return null;
      applyProfile(next); setProfileError(next ? null : 'Your account profile is missing. Ask an administrator to finish account setup.'); return next;
    } catch (error) { if (currentUserId.current === userId) { applyProfile(null); setProfileError(friendlyAuthError(error)); } return null; }
  }, [userId, applyProfile]);
  const value = useMemo<AuthContextValue>(() => ({ session, user: session?.user ?? null, profile,
    profileError, loading: !sessionChecked || Boolean(userId && checkedUserId !== userId),
    signIn, signUp, signOut, refreshProfile,
  }), [session, profile, profileError, sessionChecked, userId, checkedUserId, signIn, signUp, signOut, refreshProfile]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>.');
  return ctx;
}
