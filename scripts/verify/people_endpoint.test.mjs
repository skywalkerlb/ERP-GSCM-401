import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../../supabase/functions/people/index.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source.replace(/^import .*from 'npm:.*';$/m, ''), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

function harness({ role = 'owner', demo = false, targetRole = 'customer', confirmed = true } = {}) {
  let handler;
  const calls = [];
  const users = [
    { id: 'caller', email: 'owner@example.invalid', email_confirmed_at: '2026-11-10' },
    { id: 'target', email: 'staff@example.invalid', email_confirmed_at: confirmed ? '2026-11-10' : null },
  ];
  const profiles = [
    { user_id: 'caller', role, full_name: 'Owner', home_location_id: null },
    { user_id: 'target', role: targetRole, full_name: 'Staff', home_location_id: null },
  ];
  function from(table) {
    let filters = [];
    const query = {
      select() { return query; },
      eq(key, value) { filters.push([key, value]); return query; },
      single() { return Promise.resolve(result(true)); },
      maybeSingle() { return Promise.resolve(result(true)); },
      then(resolve, reject) { return Promise.resolve(result(false)).then(resolve, reject); },
    };
    function result(single) {
      const rows = table === 'profiles' ? profiles : [{ id: 1, is_active: true }];
      const data = rows.filter(row => filters.every(([k, v]) => row[k] === v));
      return { data: single ? data[0] ?? null : data, error: null };
    }
    return query;
  }
  const client = {
    from,
    rpc: async (name, args) => { calls.push({ name, args }); return { error: null }; },
    auth: {
      getUser: async token => ({ data: { user: token === 'valid' ? users[0] : null }, error: token === 'valid' ? null : Error('invalid') }),
      admin: {
        listUsers: async () => ({ data: { users }, error: null }),
        getUserById: async id => ({ data: { user: users.find(u => u.id === id) }, error: null }),
        inviteUserByEmail: async (email, opts) => {
          calls.push({ name: 'invite', email, opts });
          return { data: { user: users.find(u => u.email === email) ?? { id: 'new', email } }, error: null };
        },
      },
    },
  };
  vm.runInNewContext(js, {
    createClient: () => client,
    Deno: {
      env: { get: key => ({ APP_URL: 'https://glazed.example', SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-only', DEMO_MODE: String(demo) })[key] },
      serve: fn => { handler = fn; },
    },
    Request, Response, URL, console,
  });
  async function request(body, { token = 'valid', origin = 'https://glazed.example' } = {}) {
    const headers = { 'Content-Type': 'application/json', Origin: origin };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await handler(new Request('https://example.supabase.co/functions/v1/people', { method: 'POST', headers, body: JSON.stringify(body) }));
    return { status: response.status, body: await response.json() };
  }
  return { request, calls };
}

test('missing and invalid JWTs cannot manage people', async () => {
  const h = harness();
  assert.equal((await h.request({ action: 'list' }, { token: null })).status, 401);
  assert.equal((await h.request({ action: 'list' }, { token: 'invalid' })).status, 401);
  assert.equal(h.calls.length, 0);
});
for (const role of ['admin', 'manager', 'cashier', 'baker', 'customer']) {
  test(`${role} cannot access owner endpoint`, async () => {
    const h = harness({ role });
    assert.equal((await h.request({ action: 'invite', email: 'staff@example.invalid', role: 'admin' })).status, 403);
    assert.equal(h.calls.length, 0);
  });
}
test('foreign origins cannot invoke account management', async () => {
  assert.equal((await harness().request({ action: 'list' }, { origin: 'https://attacker.example' })).status, 403);
});
test('owner list includes authoritative profile and account status', async () => {
  const result = await harness({ confirmed: false }).request({ action: 'list' });
  assert.equal(result.status, 200);
  assert.equal(result.body.users[1].role, 'customer');
  assert.equal(result.body.users[1].status, 'unconfirmed');
});
test('owner role assignment is rejected', async () => {
  const h = harness();
  assert.equal((await h.request({ action: 'set-role', user_id: 'target', role: 'owner' })).status, 400);
  assert.equal(h.calls.length, 0);
});
test('existing owner cannot be modified', async () => {
  const h = harness({ targetRole: 'owner' });
  assert.equal((await h.request({ action: 'set-role', user_id: 'target', role: 'admin' })).status, 403);
  assert.equal(h.calls.length, 0);
});
test('demo rejects every mutation even for owner JWT', async () => {
  const h = harness({ demo: true });
  for (const action of ['invite','resend','set-role']) assert.equal((await h.request({ action })).status, 403);
  assert.equal(h.calls.length, 0);
});
test('existing confirmed customer is promoted without duplicate invite', async () => {
  const h = harness();
  assert.equal((await h.request({ action: 'invite', email: 'staff@example.invalid', role: 'manager', home_location_id: 1 })).status, 200);
  assert.deepEqual(h.calls.map(c => c.name), ['_set_account_access']);
  assert.equal(h.calls[0].args.p_user, 'target');
  assert.equal(h.calls[0].args.p_role, 'manager');
});
test('existing unconfirmed account receives the invitation', async () => {
  const h = harness({ confirmed: false });
  assert.equal((await h.request({ action: 'invite', email: 'staff@example.invalid', role: 'admin' })).status, 200);
  assert.deepEqual(h.calls.map(c => c.name), ['invite', '_set_account_access']);
  assert.equal(h.calls[0].opts.redirectTo, 'https://glazed.example/accept-invite');
});
test('negative location IDs cannot reach access assignment', async () => {
  const h = harness();
  assert.equal((await h.request({ action: 'set-role', user_id: 'target', role: 'manager', home_location_id: -1 })).status, 400);
  assert.equal(h.calls.length, 0);
});
test('active accounts use password recovery rather than invitation resend', async () => {
  const h = harness();
  assert.equal((await h.request({ action: 'resend', user_id: 'target' })).status, 400);
  assert.equal(h.calls.length, 0);
});
