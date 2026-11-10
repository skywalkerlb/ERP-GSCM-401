// Reset only an explicitly identified, separate disposable demo project.
// Credentials must be supplied in the process environment, never in frontend code.
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
const require = createRequire(new URL('../seed/package.json', import.meta.url));
const postgres = require('postgres');
const { DEMO_PROJECT_REF: ref, DEMO_DATABASE_URL: db, DEMO_SUPABASE_SERVICE_ROLE_KEY: key, DEMO_PASSWORD: password } = process.env;
if (!ref || ref === 'eaphbcbklbcadokfcewc' || !/^[a-z]{20}$/.test(ref) || !db || !key || !password) {
  throw new Error('Set DEMO_PROJECT_REF, DEMO_DATABASE_URL, DEMO_SUPABASE_SERVICE_ROLE_KEY and DEMO_PASSWORD for a separate disposable demo project.');
}
const connection = new URL(db);
if (!(connection.hostname === `db.${ref}.supabase.co` || (connection.hostname.endsWith('.pooler.supabase.com') && connection.username === `postgres.${ref}`))) {
  throw new Error('Demo database connection must match DEMO_PROJECT_REF. No reset performed.');
}
const url = `https://${ref}.supabase.co`;
const seed = spawnSync(fileURLToPath(new URL('../seed/node_modules/.bin/tsx', import.meta.url)), ['scripts/seed/run.ts', 'seed'], {
  stdio: 'inherit', env: { ...process.env, DATABASE_URL: db, SUPABASE_URL: url, VITE_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key, DEMO_PASSWORD: password },
});
if (seed.error) throw seed.error;
if (seed.status !== 0) process.exit(seed.status || 1);
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const sql = postgres(db, { max: 1 });
try {
  for (const role of ['owner', 'admin']) {
    const email = `${role}@example.com`;
    let user;
    for (let page = 1; ; page++) {
      const { data, error } = await client.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      user = data.users.find(u => u.email === email);
      if (user || data.users.length < 200) break;
    }
    if (!user) {
      const { data, error } = await client.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) throw error;
      user = data.user;
    } else {
      const { error } = await client.auth.admin.updateUserById(user.id, { password, email_confirm: true });
      if (error) throw error;
    }
    await sql`insert into profiles(user_id,full_name,role) values (${user.id},${"Demo " + role},${role}::app_role) on conflict(user_id) do update set role=excluded.role`;
  }
  console.log('Isolated demo data and six role accounts are ready. Configure DEMO_MODE=true on its People function.');
} finally { await sql.end(); }
