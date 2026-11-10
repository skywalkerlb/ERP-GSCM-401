import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/lib/supabase.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source.replace(/^import .*;$/gm, '').replaceAll('import.meta.env', '__env'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
function harness({ configured = true, demoUrl = 'https://demo.supabase.co', profileRole, authError, profileError, missingSession = false, initialDemo = false } = {}) {
  const calls = [], redirects = [], configs = [], requests = [];
  const values = new Map([['glazed-auth-v1', 'real-session'], ...(initialDemo ? [['glazed-demo-v1', 'true'], ['glazed-demo-auth-v1', 'demo-session']] : [])]);
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  let selectedRole;
  const emails = { 'owner@example.com': 'owner', 'admin@example.com': 'admin', 'manager@example.com': 'manager', 'cashier.provo@example.com': 'cashier', 'baker@example.com': 'baker', 'ava@example.com': 'customer' };
  const client = {
    auth: {
      signInWithPassword: async input => {
        calls.push({ action: 'signIn', input }); selectedRole = emails[input.email]; storage.setItem('glazed-demo-auth-v1', 'new-demo-session');
        if (authError instanceof Error) throw authError;
        return { data: { user: { id: 'demo-user' }, session: missingSession ? null : {} }, error: authError };
      },
      signOut: async options => { calls.push({ action: 'signOut', options }); return { error: null }; },
    },
    from: table => ({ select: selection => ({ eq: (field, value) => ({ single: async () => {
      calls.push({ action: 'profile', table, selection, field, value });
      return { data: { role: profileRole ?? selectedRole }, error: profileError };
    } }) }) }),
  };
  const exported = {};
  vm.runInNewContext(js, {
    exports: exported, createClient: (url, key, options) => { configs.push({ url, key, options }); return client; },
    __env: { VITE_SUPABASE_URL: 'https://real.supabase.co', VITE_SUPABASE_ANON_KEY: 'real-public-key', ...(configured ? { VITE_DEMO_SUPABASE_URL: demoUrl, VITE_DEMO_SUPABASE_ANON_KEY: 'demo-public-key', VITE_DEMO_PASSWORD: 'demo-only-password' } : {}) },
    URL, Error, TypeError, AbortSignal, sessionStorage: storage,
    fetch: async (input, init) => { requests.push({ input, init }); return new Response('{}'); },
    window: { location: { assign: destination => redirects.push(destination) } },
  });
  return { ...exported, values, calls, redirects, configs, requests };
}
for (const [role, email, destination] of [
  ['owner', 'owner@example.com', '/'], ['admin', 'admin@example.com', '/'], ['manager', 'manager@example.com', '/'],
  ['cashier', 'cashier.provo@example.com', '/pos'], ['baker', 'baker@example.com', '/forecast'], ['customer', 'ava@example.com', '/shop'],
]) test(`${role} enters with configured demo credentials and lands at ${destination}`, async () => {
  const app = harness();
  await app.enterDemo(role);
  assert.equal(app.calls[0].input.email, email);
  assert.equal(app.calls[0].input.password, 'demo-only-password');
  assert.equal(app.calls[1].field, 'user_id'); assert.equal(app.calls[1].value, 'demo-user');
  assert.equal(app.values.get('glazed-demo-v1'), 'true'); assert.deepEqual(app.redirects, [destination]);
  assert.equal(app.values.get('glazed-auth-v1'), 'real-session');
  assert.equal(app.configs.at(-1).url, 'https://demo.supabase.co');
});
test('unconfigured demo fails before any sign-in', async () => {
  const app = harness({ configured: false });
  await assert.rejects(app.enterDemo('manager'), /setup is incomplete/); assert.equal(app.calls.length, 0);
});
for (const demoUrl of ['https://real.supabase.co/', 'https://eaphbcbklbcadokfcewc.supabase.co', 'invalid', 'http://demo.supabase.co']) test(`unsafe demo target rejected: ${demoUrl}`, async () => {
  const app = harness({ demoUrl }); assert.equal(app.isDemoConfigured, false);
  await assert.rejects(app.enterDemo('manager')); assert.equal(app.calls.length, 0);
});
for (const scenario of [{ profileRole: 'customer' }, { profileError: { code: 'PGRST205' } }, { authError: { code: 'invalid_credentials' } }, { missingSession: true }, { authError: new TypeError('fetch failed') }]) test(`failed entry clears tab demo state and leaves real login intact: ${JSON.stringify(scenario)}`, async () => {
  const app = harness(scenario); await assert.rejects(app.enterDemo('manager'));
  assert.equal(app.values.has('glazed-demo-auth-v1'), false); assert.equal(app.values.has('glazed-demo-v1'), false);
  assert.equal(app.values.get('glazed-auth-v1'), 'real-session'); assert.equal(app.redirects.length, 0);
  assert.equal(app.calls.at(-1).action, 'signOut'); assert.equal(app.calls.at(-1).options.scope, 'local');
});
test('invalid role cannot access arbitrary demo identity', async () => {
  const app = harness(); await assert.rejects(app.enterDemo('toString'), /Choose a demo role/); assert.equal(app.calls.length, 0);
});
test('demo requests use bounded fetch and respect cancellation without changing real client fetch', async () => {
  const app = harness(); await app.enterDemo('manager');
  assert.equal(app.configs[0].options.global, undefined);
  const controller = new AbortController(); controller.abort();
  await app.configs.at(-1).options.global.fetch('https://demo.supabase.co/test', { signal: controller.signal });
  assert.equal(app.requests[0].init.signal.aborted, true);
});
test('exit clears only the demo tab session and returns to normal login', async () => {
  const app = harness({ initialDemo: true }); await app.exitDemo();
  assert.equal(app.values.has('glazed-demo-v1'), false); assert.equal(app.values.has('glazed-demo-auth-v1'), false);
  assert.equal(app.values.get('glazed-auth-v1'), 'real-session'); assert.deepEqual(app.redirects, ['/login']);
  assert.equal(app.calls.at(-1).options.scope, 'local');
});
