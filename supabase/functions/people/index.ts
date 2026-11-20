import { createClient, type User } from 'npm:@supabase/supabase-js@2.119.0';
import { USERNAME_DOMAIN } from '../_shared/identity.ts';

const appUrl = Deno.env.get('APP_URL');
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
const cors = {
  'Access-Control-Allow-Origin': appUrl ? new URL(appUrl).origin : '',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-business-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin',
};
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
async function findEmail(email: string): Promise<User | undefined> {
  for (let page = 1; ; page++) {
    const result = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (result.error) throw result.error;
    const user = result.data.users.find(user => user.email?.toLowerCase() === email);
    if (user || result.data.users.length < 200) return user;
  }
}
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'Use POST.' });
  if (!appUrl) return reply(503, { error: 'Account management needs APP_URL configuration.' });
  if (req.headers.get('Origin') && req.headers.get('Origin') !== new URL(appUrl).origin) return reply(403, { error: 'This origin cannot manage accounts.' });
  const token = req.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return reply(401, { error: 'Sign in to continue.' });
  const identity = await admin.auth.getUser(token);
  if (identity.error || !identity.data.user) return reply(401, { error: 'Your session expired. Sign in again.' });
  const business = req.headers.get('x-business-id') || '00000000-0000-4000-8000-000000000001';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(business)) return reply(400, { error: 'Choose a valid business.' });
  const base = { p_business_id: business, p_actor: identity.data.user.id };
  let invitationSent = false;
  try {
    const body = await req.json();
    if (!body || !['list', 'invite', 'resend', 'set-role', 'reset-password'].includes(body.action)) return reply(400, { error: 'Choose a supported account action.' });
    const directory = await admin.rpc('_tenant_people_directory', base);
    if (directory.error) return reply(403, { error: 'Your role cannot manage people in this business.' });
    const members = directory.data as Array<{ user_id: string; role: string; email: string; status: string }>;
    if (body.action === 'list') return reply(200, { users: members });
    if (Deno.env.get('DEMO_MODE') === 'true') return reply(403, { error: 'Demo access changes are simulated. No invitations are sent.' });
    if (body.action === 'reset-password') return reply(403, { error: 'Passwords belong to the account holder across businesses. Ask them to use password recovery from sign in.' });
    const redirectTo = new URL('accept-invite', `${appUrl.replace(/\/+$/, '')}/`);
    redirectTo.searchParams.set('business_id', business);
    if (body.action === 'resend') {
      const target = members.find(member => member.user_id === body.user_id);
      if (!target) return reply(404, { error: 'Membership not found.' });
      const authorized = await admin.rpc('_tenant_authorize_account_access', { ...base, p_user: target.user_id, p_role: target.role });
      if (authorized.error) return reply(403, { error: 'Your role cannot manage this membership.' });
      if (!target.email || target.status === 'active') return reply(400, { error: 'This account is already active or uses a username. Ask the account holder to sign in.' });
      const invite = await admin.auth.admin.inviteUserByEmail(target.email, { redirectTo: redirectTo.toString(), data: { registration_intent: 'business' } });
      if (invite.error) throw invite.error;
      return reply(200, { message: 'Invitation sent.' });
    }
    if (!['admin', 'manager', 'cashier', 'baker', 'customer'].includes(body.role)) return reply(400, { error: 'Choose a valid role.' });
    const location = body.home_location_id ?? null;
    if (location !== null && (!Number.isSafeInteger(location) || location <= 0)) return reply(400, { error: 'Choose a valid location.' });
    if (location !== null) {
      const selected = await admin.from('locations').select('id').eq('business_id', business).eq('id', location).eq('is_active', true).maybeSingle();
      if (selected.error || !selected.data) return reply(400, { error: 'Choose an active location in this business.' });
    }
    let target: User | undefined;
    let targetId: string;
    if (body.action === 'invite') {
      if (typeof body.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) || body.email.toLowerCase().endsWith(`@${USERNAME_DOMAIN}`)) return reply(400, { error: 'Enter a valid email address.' });
      const email = body.email.trim().toLowerCase();
      // Authorize the requested role before any global identity lookup or email.
      const initial = await admin.rpc('_tenant_authorize_account_access', { ...base, p_user: null, p_role: body.role });
      if (initial.error) return reply(403, { error: 'Your role cannot assign this access.' });
      target = await findEmail(email);
      const authorized = await admin.rpc('_tenant_authorize_account_access', { ...base, p_user: target?.id ?? null, p_role: body.role });
      if (authorized.error) return reply(403, { error: 'Your role cannot manage this membership.' });
      if (!target || !target.email_confirmed_at) {
        const invited = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: redirectTo.toString(), data: { registration_intent: 'business' } });
        if (invited.error) throw invited.error;
        target = invited.data.user;
        invitationSent = true;
      }
      if (!target) throw new Error('Invitation unavailable');
      targetId = target.id;
    } else {
      if (typeof body.user_id !== 'string' || !members.some(member => member.user_id === body.user_id)) return reply(404, { error: 'Membership not found.' });
      targetId = body.user_id;
    }
    const result = await admin.rpc('_tenant_set_account_access', { ...base, p_user: targetId, p_role: body.role, p_home_location: location });
    if (result.error) return reply(invitationSent ? 409 : 403, { error: invitationSent ? 'Invitation sent, but membership was not saved. Refresh People and retry the access change.' : 'Access was not saved. Check your permissions and the selected location.', invitation_sent: invitationSent });
    return reply(200, { message: invitationSent ? 'Invitation sent and access assigned.' : 'Business access updated.' });
  } catch {
    return reply(invitationSent ? 409 : 400, { error: invitationSent ? 'Invitation sent, but access could not be confirmed. Refresh People before retrying.' : 'Account management failed. Check the details and try again.', invitation_sent: invitationSent });
  }
});
