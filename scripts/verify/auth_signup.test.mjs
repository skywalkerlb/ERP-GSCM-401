import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/hooks/useAuth.tsx', import.meta.url), 'utf8');
const js = ts.transpileModule(source.replace(/^import .*;$/gm, ''), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
function harness({ demo = false, session = null, profile = null, signupResult = { data: { session: null }, error: null } } = {}) {
  const exported = {}, effects = [], calls = [], states = [], timers = [], listeners = {};
  let stateIndex = 0, nextProfile = profile, profileFailure = null, clears = 0;
  vm.runInNewContext(js, {
    exports: exported,
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
    window: { location: { origin: 'https://glazed.example' }, setInterval: fn => { timers.push(fn); return 1; }, clearInterval: () => {}, addEventListener: (event, fn) => { listeners[event] = fn; }, removeEventListener: () => {} },
    document: { visibilityState: 'visible' },
    supabase: {
      channel: () => ({ on: (_event, filter, callback) => {
        listeners.realtime = callback; listeners.filter = filter;
        return { subscribe: () => ({}) };
      } }),
      removeChannel: async () => { calls.push('removeChannel'); },
      auth: { signUp: async input => { calls.push(input); return signupResult; } },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: nextProfile, error: profileFailure }) }) }) }),
    },
    setTimeout, Error,
  });
  const value = exported.AuthProvider({ children: null }).props.value;
  return { exported, value, effects, calls, states, timers, listeners, clears: () => clears,
    setProfile: next => { nextProfile = next; }, failProfile: error => { profileFailure = error; } };
}
const valid = { email: ' jane@example.com ', password: 'secret123', fullName: ' Jane Doe ' };
test('signup rejects invalid values before sending a request', async () => {
  const app = harness();
  for (const input of [{ ...valid, fullName: '   ' }, { ...valid, email: 'bad-email' }, { ...valid, password: 'short' }]) {
    assert.ok((await app.value.signUp(input)).error);
  }
  assert.equal(app.calls.length, 0);
});
test('signup normalizes name/email, uses deployed confirmation origin and requests no role', async () => {
  const app = harness();
  assert.equal((await app.value.signUp(valid)).needsConfirmation, true);
  assert.equal(app.calls[0].email, 'jane@example.com');
  assert.equal(app.calls[0].options.data.full_name, 'Jane Doe');
  assert.equal(app.calls[0].options.emailRedirectTo, 'https://glazed.example/login');
  assert.equal(Object.hasOwn(app.calls[0].options.data, 'role'), false);
});
test('signup supports immediate sessions and actionable backend failures', async () => {
  const immediate = harness({ signupResult: { data: { session: {} }, error: null } });
  assert.equal((await immediate.value.signUp(valid)).needsConfirmation, false);
  const failed = harness({ signupResult: { data: {}, error: { code: 'email_exists' } } });
  assert.match((await failed.value.signUp(valid)).error, /Sign in instead/);
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
  assert.equal(app.listeners.filter.filter, 'user_id=eq.user-1');
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
