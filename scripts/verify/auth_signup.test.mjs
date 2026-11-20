import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';

const identity = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../../supabase/functions/_shared/identity.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: identity });
const source = readFileSync(new URL('../../src/hooks/useAuth.tsx', import.meta.url), 'utf8');
const js = ts.transpileModule(source.replace(/^import .*;$/gm, ''), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
function harness({ business = null, demo = false, session = null, profile = { user_id: 'new-user', role: 'customer' }, signupResult = { data: { session: { user: { id: 'new-user' } }, user: { id: 'new-user' } }, error: null } } = {}) {
  const exported = {}, effects = [], calls = [], states = [], timers = [], listeners = {};
  let stateIndex = 0, nextProfile = profile, profileFailure = null, clears = 0;
  vm.runInNewContext(js, {
    exports: exported, ...identity, selectedBusiness: () => business, selectBusiness: () => {},
    require: () => ({ jsx: (type, props) => ({ type, props }) }),
    createContext: () => ({ Provider: 'AuthProvider' }),
    useCallback: fn => fn, useRef: current => ({ current }), useMemo: fn => fn(),
    useEffect: fn => effects.push(fn),
    useState: initial => {
      const index = stateIndex++;
      return [index === 0 ? session : initial, value => states.push({ index, value })];
    },
    isSupabaseConfigured: true, isDemo: demo,
    queryClient: { clear: () => { clears++; } },
    window: { location: { origin: 'https://glazed.example', pathname: '/login' }, setInterval: fn => { timers.push(fn); return 1; }, clearInterval: () => {}, addEventListener: (event, fn) => { listeners[event] = fn; }, removeEventListener: () => {} },
    document: { visibilityState: 'visible' },
    supabase: {
      rpc: async () => ({ data: [{ business_id: "00000000-0000-4000-8000-000000000001", name: "Glazed", slug: "glazed", ...nextProfile }], error: null }),
      channel: (name, options) => { listeners.channel = { name, options }; return { on: (event, filter, callback) => {
        listeners.event = event;
        listeners.realtime = callback; listeners.filter = filter;
        return { subscribe: () => ({}) };
      } }; },
      removeChannel: async () => { calls.push('removeChannel'); },
      auth: { signUp: async input => { calls.push(input); return signupResult; }, signInWithPassword: async input => { calls.push(input); return signupResult; } },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: nextProfile, error: profileFailure }) }) }) }),
    },
    setTimeout, Error,
  });
  const value = exported.AuthProvider({ children: null }).props.value;
  return { exported, value, effects, calls, states, timers, listeners, clears: () => clears,
    setProfile: next => { nextProfile = next; }, failProfile: error => { profileFailure = error; } };
}
const valid = { username: ' Jane_Doe ', password: 'secret123' };
test('signup rejects invalid usernames and passwords before sending a request', async () => {
  const app = harness();
  for (const username of ['', 'ab', 'a'.repeat(31), 'jane@example.com', 'jane doe', 'a-b', 'éclair']) {
    assert.ok((await app.value.signUp({ ...valid, username })).error);
  }
  assert.ok((await app.value.signUp({ ...valid, password: 'short' })).error);
  assert.equal(app.calls.length, 0);
});
test('signup normalizes username, requests no role or email callback and loads immediate profile', async () => {
  const app = harness();
  assert.equal((await app.value.signUp(valid)).profile.role, 'customer');
  assert.equal(app.calls[0].email, 'jane_doe@users.glazed.invalid');
  assert.equal(app.calls[0].options.data.username, 'jane_doe');
  assert.equal(Object.hasOwn(app.calls[0].options, 'emailRedirectTo'), false);
  assert.equal(Object.hasOwn(app.calls[0].options.data, 'role'), false);
  assert.equal(app.states.filter(s => s.index === 0).at(-1).value.user.id, 'new-user');
});
test('signup reports configuration, duplicate and profile failures without a check-email step', async () => {
  const misconfigured = harness({ signupResult: { data: { session: null }, error: null } });
  assert.match((await misconfigured.value.signUp(valid)).error, /finish account setup/);
  const failed = harness({ signupResult: { data: {}, error: { code: 'email_exists' } } });
  assert.match((await failed.value.signUp(valid)).error, /Sign in instead/);
  const profileFailure = harness(); profileFailure.failProfile({ code: '42501' });
  assert.match((await profileFailure.value.signUp(valid)).error, /profile could not be loaded/);
  assert.equal(profileFailure.states.filter(s => s.index === 0).at(-1).value.user.id, 'new-user');
});
test('username login normalizes case and existing email login is preserved', async () => {
  for (const [input, expected] of [[' Jane_Doe ', 'jane_doe@users.glazed.invalid'], [' legacy@example.com ', 'legacy@example.com']]) {
    const app = harness();
    assert.equal((await app.value.signIn(input, 'secret123')).profile.role, 'customer');
    assert.equal(app.calls[0].email, expected);
  }
  const app = harness();
  assert.ok((await app.value.signIn('bad name', 'secret123')).error);
  assert.equal(app.calls.length, 0);
});
test('demo mode never creates real signup accounts', async () => {
  const app = harness({ demo: true });
  assert.match((await app.value.signUp(valid)).error, /Exit the demo/);
  assert.equal(app.calls.length, 0);
});
const tick = () => new Promise(resolve => setImmediate(resolve));
test('focus and polling refresh access and discard cached privileged data on role change or failure', async () => {
  const app = harness({ session: { user: { id: 'user-1' } }, profile: { user_id: 'user-1', role: 'manager' } });
  const cleanup = app.effects[1]();
  await tick();
  const afterInitial = app.clears();
  app.listeners.focus();
  await tick();
  assert.equal(app.clears(), afterInitial, 'unchanged access keeps the cache');
  app.setProfile({ user_id: 'user-1', role: 'customer' });
  assert.equal(app.listeners.channel.name, 'account:user-1:access');
  assert.equal(app.listeners.channel.options.config.private, true);
  assert.equal(app.listeners.event, 'broadcast');
  assert.equal(app.listeners.filter.event, 'access-change');
  app.listeners.realtime({ new: { role: 'owner' } });
  await tick();
  assert.equal(app.clears(), afterInitial + 1);
  assert.equal(app.states.filter(s => s.index === 1).at(-1).value.role, 'customer');
  app.timers[0]();
  await tick();
  assert.equal(app.clears(), afterInitial + 1, 'polling unchanged access keeps the cache');
  app.failProfile({ code: '42501' });
  app.listeners.focus();
  await tick();
  assert.equal(app.states.filter(s => s.index === 1).at(-1).value, null);
  assert.equal(app.clears(), afterInitial + 2);
  cleanup();
  assert.ok(app.calls.includes('removeChannel'));
});

test('customer signup for another business creates no original-business profile through metadata', async () => {
  const app = harness({ business: { business_id: '00000000-0000-4000-8000-000000000002', slug: 'second-shop' } });
  await app.value.signUp(valid);
  assert.equal(app.calls[0].options.data.registration_intent, 'business');
  assert.equal(Object.hasOwn(app.calls[0].options.data, 'role'), false);
});
