import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { USERNAME_DOMAIN } from '../_shared/identity.ts';

const appUrl = Deno.env.get('APP_URL');
const code = Deno.env.get('OWNER_SETUP_CODE');
const configured = Boolean(code && code.length>=16 && code.length<=256);
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const cors = {
  'Access-Control-Allow-Origin': appUrl ? new URL(appUrl).origin : '',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin',
};
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
async function matchesCode(candidate: string): Promise<boolean> {
  // Compare fixed-length digests; never send or log either value.
  const hash = async (value: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  const [a,b] = await Promise.all([hash(candidate),hash(code!)]);
  let difference = 0;
  for (let i=0;i<a.length;i++) difference |= a[i]^b[i];
  return difference===0;
}
Deno.serve(async (req: Request) => {
  if (req.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
  if (req.method!=='POST') return reply(405,{error:'Use POST.'});
  if (!appUrl) return reply(503,{error:'Business setup is unavailable. Ask the platform owner to configure APP_URL.'});
  if (req.headers.get('Origin') && req.headers.get('Origin')!==new URL(appUrl).origin) return reply(403,{error:'This origin cannot set up the business.'});
  try {
    const body = await req.json();
    if (!body || !['status','locations','complete'].includes(body.action)) return reply(400,{error:'Choose a supported setup action.'});
    if (Deno.env.get('DEMO_MODE')==='true') return body.action==='status' ? reply(200,{available:false}) : reply(403,{error:'Exit the demo before setting up your business.'});
    if (body.action==='status') {
      const result = await admin.rpc('_business_setup_status');
      if (result.error) throw result.error;
      return reply(200,{available:Boolean(result.data) && configured});
    }
    if (!configured) return reply(503,{error:'Business setup is unavailable. Ask the platform owner to configure the private setup code.'});
    const token = req.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return reply(401,{error:'Sign in with your email account to continue.'});
    const identity = await admin.auth.getUser(token);
    const user = identity.data.user;
    if (identity.error || !user) return reply(401,{error:'Your session has expired. Sign in again.'});
    if (!user.email || !user.email_confirmed_at || user.email.toLowerCase().endsWith(`@${USERNAME_DOMAIN}`)) return reply(403,{error:'Use an email account to set up the business.'});
    const attempt = await admin.rpc('_business_setup_attempt',{p_actor:user.id});
    if (attempt.error) throw attempt.error;
    if (!attempt.data) return reply(429,{error:'Too many setup attempts. Wait 15 minutes and try again.'});
    if (typeof body.setup_code!=='string' || body.setup_code.length>256 || !await matchesCode(body.setup_code)) return reply(403,{error:'The setup code is incorrect. Ask the platform owner for the private code.'});
    if (body.action==='locations') {
      const status = await admin.rpc('_business_setup_status');
      if (status.error) throw status.error;
      if (!status.data) return reply(409,{error:'Business setup is already complete. Ask the owner for an invitation.'});
      const result = await admin.from('locations').select('id,name,address').eq('is_active',true).order('name');
      if (result.error) throw result.error;
      return reply(200,{locations:result.data});
    }
    if (typeof body.business_name!=='string' || !body.business_name.trim() || body.business_name.length>120) return reply(400,{error:'Enter a business name up to 120 characters.'});
    if (body.location_id!=null && (!Number.isSafeInteger(body.location_id) || body.location_id<=0)) return reply(400,{error:'Choose a valid location.'});
    for (const [field,max] of [['location_name',120],['location_address',500]] as const) {
      if (body[field]!=null && (typeof body[field]!=='string' || body[field].length>max)) return reply(400,{error:'Check the shop name and address lengths.'});
    }
    const result = await admin.rpc('_complete_business_setup',{
      p_actor:user.id,p_business_name:body.business_name,p_location_id:body.location_id??null,
      p_location_name:body.location_name??null,p_location_address:body.location_address??null,
    });
    if (result.error) return reply(result.error.code==='23505'?409:400,{error:'Business setup could not finish. It may already be complete; refresh, check the business and location details, and try again.'});
    return reply(200,result.data);
  } catch {
    return reply(400,{error:'Business setup could not finish. Check your details and backend configuration, then try again.'});
  }
});
