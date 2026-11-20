import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { USERNAME_DOMAIN } from '../_shared/identity.ts';

const appUrl = Deno.env.get('APP_URL');
const url = Deno.env.get('SUPABASE_URL')!;
const key = Deno.env.get('SUPABASE_ANON_KEY')!;
const cors = {
  'Access-Control-Allow-Origin': appUrl ? new URL(appUrl).origin : '',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-business-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin',
};
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'Use POST.' });
  if (!appUrl) return reply(503, { error: 'Business registration is unavailable. Ask the platform owner to configure APP_URL.' });
  if (req.headers.get('Origin') && req.headers.get('Origin') !== new URL(appUrl).origin) return reply(403, { error: 'This origin cannot create a business.' });
  try {
    const body = await req.json();
    if (!body || !['status', 'create'].includes(body.action)) return reply(400, { error: 'Choose a supported registration action.' });
    if (Deno.env.get('DEMO_MODE') === 'true') return body.action === 'status' ? reply(200, { available: false }) : reply(403, { error: 'Exit the demo before creating a business.' });
    const token = req.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    // Creation uses the verified caller JWT rather than a privileged service client.
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: token ? { Authorization: `Bearer ${token}` } : {} } });
    if (body.action === 'status') {
      const result = await client.rpc('business_registration_status');
      if (result.error) throw result.error;
      return reply(200, { available: Boolean(result.data) });
    }
    if (!token) return reply(401, { error: 'Sign in with your email account to continue.' });
    const identity = await client.auth.getUser(token);
    const user = identity.data.user;
    if (identity.error || !user) return reply(401, { error: 'Your session has expired. Sign in again.' });
    if (!user.email || user.email.toLowerCase().endsWith(`@${USERNAME_DOMAIN}`)) return reply(403, { error: 'Use an email account to create a business.' });
    for (const [field, max] of [['business_name', 120], ['location_name', 120], ['location_address', 500]] as const) {
      if (typeof body[field] !== 'string' || !body[field].trim() || body[field].length > max) return reply(400, { error: 'Enter a business name, shop name and address within the field limits.' });
    }
    if (typeof body.request_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.request_id)) return reply(400, { error: 'Refresh this page and try again.' });
    const result = await client.rpc('create_business', { p_name: body.business_name.trim(), p_location_name: body.location_name.trim(), p_location_address: body.location_address.trim(), p_request_id: body.request_id });
    if (result.error) return reply(result.error.code === '42501' ? 403 : 400, { error: 'Business creation could not finish. Check your details and registration availability, then retry.' });
    return reply(200, result.data);
  } catch {
    return reply(400, { error: 'Business creation could not finish. Check your details and connection, then retry.' });
  }
});
