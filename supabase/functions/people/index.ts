import { createClient, type User } from 'npm:@supabase/supabase-js@2.119.0';

// Service credentials never leave this function. Every request verifies a user JWT and the
// authoritative profile role rather than trusting editable user metadata or client role claims.
const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const appUrl = Deno.env.get('APP_URL');
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const assignable = new Set(['admin', 'manager', 'cashier', 'baker', 'customer']);
const cors = {
  'Access-Control-Allow-Origin': appUrl ? new URL(appUrl).origin : '',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
};
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json' },
});

async function allUsers(): Promise<User[]> {
  const users: User[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 200) return users;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'Use POST.' });
  if (!appUrl) return reply(503, { error: 'Account management is not configured. Set the trusted APP_URL.' });
  // A fixed origin and redirect prevent a caller from sending invitation links to another host.
  if (req.headers.get('Origin') && req.headers.get('Origin') !== new URL(appUrl).origin) {
    return reply(403, { error: 'This origin cannot manage accounts.' });
  }
  const token = req.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return reply(401, { error: 'Sign in to continue.' });
  const { data: identity, error: authError } = await admin.auth.getUser(token);
  if (authError || !identity.user) return reply(401, { error: 'Your session has expired. Sign in again.' });
  const { data: caller, error: callerError } = await admin.from('profiles').select('role').eq('user_id', identity.user.id).single();
  if (callerError || caller?.role !== 'owner') return reply(403, { error: 'Only the owner can manage people.' });

  try {
    const body = await req.json();
    if (!body || typeof body !== 'object') return reply(400, { error: 'Provide an account action.' });
    const { action } = body;
    if (!['list','invite','resend','set-role'].includes(action)) return reply(400, { error: 'Choose a supported account action.' });
    if (action !== 'list' && Deno.env.get('DEMO_MODE') === 'true') {
      return reply(403, { error: 'Demo account changes are simulated in your browser. No real invitations are sent.' });
    }
    if (action === 'list') {
      const [users, profiles] = await Promise.all([allUsers(), admin.from('profiles').select('user_id,full_name,role,home_location_id')]);
      if (profiles.error) throw profiles.error;
      const byId = new Map((profiles.data ?? []).map(p => [p.user_id, p]));
      return reply(200, { users: users.map(u => ({
        ...byId.get(u.id), user_id: u.id, email: u.email ?? '',
        role: byId.get(u.id)?.role ?? 'customer',
        status: u.email_confirmed_at ? 'active' : u.invited_at ? 'invited' : 'unconfirmed',
      })) });
    }
    const redirectTo = new URL('/accept-invite', appUrl).toString();
    if (action === 'resend') {
      if (typeof body.user_id !== 'string') return reply(400, { error: 'Choose an account.' });
      const { data, error } = await admin.auth.admin.getUserById(body.user_id);
      if (error || !data.user?.email) return reply(404, { error: 'Account not found.' });
      const { data: profile, error: profileError } = await admin.from('profiles').select('role').eq('user_id', body.user_id).single();
      if (profileError || !profile || profile.role === 'owner') return reply(403, { error: 'This account cannot be invited.' });
      if (data.user.email_confirmed_at) return reply(400, { error: 'This account is already active. Use password recovery from sign in if needed.' });
      const invite = await admin.auth.admin.inviteUserByEmail(data.user.email, { redirectTo });
      if (invite.error) throw invite.error;
      return reply(200, { message: 'Invitation sent. Ask them to check their inbox.' });
    }
    if (!assignable.has(body.role)) return reply(400, { error: 'Choose admin, manager, cashier, baker or customer.' });
    const location = body.home_location_id ?? null;
    if (location !== null) {
      if (!Number.isSafeInteger(location) || location <= 0) return reply(400, { error: 'Choose a valid location.' });
      const { data, error } = await admin.from('locations').select('id').eq('id', location).eq('is_active', true).maybeSingle();
      if (error || !data) return reply(400, { error: 'Choose an active location.' });
    }
    let targetId: string;
    let target: User | undefined;
    if (action === 'invite') {
      if (typeof body.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) return reply(400, { error: 'Enter a valid email address.' });
      const email = body.email.trim().toLowerCase();
      target = (await allUsers()).find(u => u.email?.toLowerCase() === email);
      if (!target || !target.email_confirmed_at) {
        const result = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
        if (result.error) throw result.error;
        target = result.data.user;
      }
      targetId = target.id;
    } else {
      if (typeof body.user_id !== 'string') return reply(400, { error: 'Choose an account.' });
      targetId = body.user_id;
    }
    const { data: profile, error: profileError } = await admin.from('profiles').select('role').eq('user_id', targetId).single();
    if (profileError || !profile) return reply(409, { error: 'The account profile is missing. Apply the backend migrations before assigning access.' });
    if (profile.role === 'owner' || targetId === identity.user.id) return reply(403, { error: 'The owner account cannot be changed here.' });
    // Keep customer_id intact when promoting a customer. This preserves existing business records.
    const { error } = await admin.rpc('_set_account_access', {
      p_user: targetId, p_role: body.role, p_home_location: location,
    });
    if (error) throw error;
    return reply(200, { message: action === 'invite' && !target?.email_confirmed_at
      ? 'Access assigned. The invitation recipient can set a password from their email.'
      : 'Account access updated.' });
  } catch (error) {
    // No tokens or connection credentials in client responses or logs.
    console.error('People action failed', error instanceof Error ? error.name : 'backend_error');
    return reply(400, { error: 'Account management failed. Check the account details and backend configuration, then try again.' });
  }
});
