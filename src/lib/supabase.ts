import { createClient } from '@supabase/supabase-js';
import type { AppRole } from '@/hooks/useAuth';
import { appPath } from '@/lib/appUrl';
import { isProtectedProject } from '../../supabase/functions/_shared/protected-projects.mjs';

const realUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const realKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
const demoUrl = import.meta.env.VITE_DEMO_SUPABASE_URL?.trim();
const demoKey = import.meta.env.VITE_DEMO_SUPABASE_ANON_KEY?.trim();
const demoPassword = import.meta.env.VITE_DEMO_PASSWORD?.trim();
function separateDemoProject(): boolean {
  try {
    const target = new URL(demoUrl || '');
    return target.protocol === 'https:' && target.origin !== new URL(realUrl || 'http://localhost').origin && !isProtectedProject(target.hostname.replace(/\.supabase\.co$/, ''));
  } catch { return false; }
}
export const isDemoConfigured = Boolean(demoKey && demoPassword && separateDemoProject());
export const isDemo = isDemoConfigured && sessionStorage.getItem('glazed-demo-v1') === 'true';
const url = isDemo ? demoUrl : realUrl;
const anonKey = isDemo ? demoKey : realKey;
export const isSupabaseConfigured = Boolean(url && anonKey);
const options = { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true };
// A stalled demo backend must return control to the visitor so they can retry.
const demoFetch: typeof fetch = (input, init) => fetch(input, {
  ...init,
  signal: AbortSignal.any([AbortSignal.timeout(15_000), ...(init?.signal ? [init.signal] : [])]),
});
export const supabase = createClient(url || 'http://localhost:54321', anonKey || 'missing-anon-key', {
  auth: { ...options, storageKey: isDemo ? 'glazed-demo-auth-v1' : 'glazed-auth-v1', ...(isDemo ? { storage: sessionStorage } : {}) },
  realtime: { params: { eventsPerSecond: 10 } },
  ...(isDemo ? { global: { fetch: demoFetch } } : {}),
});
const demoEmails: Record<AppRole, string> = {
  owner: 'owner@example.com', admin: 'admin@example.com', manager: 'manager@example.com',
  cashier: 'cashier.provo@example.com', baker: 'baker@example.com', customer: 'ava@example.com',
};
const demoHomes: Record<AppRole, string> = {
  owner: '/', admin: '/', manager: '/', cashier: '/pos', baker: '/forecast', customer: '/shop',
};
export async function enterDemo(role: AppRole): Promise<void> {
  if (!isDemoConfigured) throw new Error('The demo is unavailable because its setup is incomplete. Ask the platform owner to finish demo setup.');
  if (!Object.hasOwn(demoEmails, role)) throw new Error('Choose a demo role from the list.');
  const client = createClient(demoUrl!, demoKey!, {
    auth: { ...options, storageKey: 'glazed-demo-auth-v1', storage: sessionStorage },
    global: { fetch: demoFetch },
  });
  try {
    // Visitors never supply credentials: these accounts belong only to the disposable demo project.
    const { data, error } = await client.auth.signInWithPassword({ email: demoEmails[role], password: demoPassword! });
    if (error || !data.session || !data.user) throw new Error('The demo account could not sign in. Try again, or ask the platform owner to check demo setup.');
    const { data: profile, error: profileError } = await client.from('profiles')
      .select('role').eq('user_id', data.user.id).single();
    if (profileError || profile?.role !== role) throw new Error('The selected demo role is not ready. Try another role or ask the platform owner to check demo setup.');
    sessionStorage.setItem('glazed-demo-v1', 'true');
    window.location.assign(appPath(demoHomes[role]));
  } catch (cause) {
    // Never globally sign out a shared demo identity or touch the visitor's real account session.
    try { await client.auth.signOut({ scope: 'local' }); } catch { /* Clear this tab even if offline. */ }
    sessionStorage.removeItem('glazed-demo-auth-v1');
    sessionStorage.removeItem('glazed-demo-v1');
    if (cause instanceof Error && (cause.name === 'TimeoutError' || cause.name === 'AbortError' || cause instanceof TypeError)) {
      throw new Error('Could not reach the demo server. Check your connection and try again.');
    }
    throw cause;
  }
}
export async function exitDemo(): Promise<void> {
  try { await supabase.auth.signOut({ scope: 'local' }); }
  finally {
    sessionStorage.removeItem('glazed-demo-v1');
    sessionStorage.removeItem('glazed-demo-auth-v1');
    window.location.assign(appPath('/login'));
  }
}
