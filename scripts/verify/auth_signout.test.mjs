import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';

// Exercise the actual provider callback rather than duplicating its sign-out logic.
const source = readFileSync(new URL('../../src/hooks/useAuth.tsx', import.meta.url), 'utf8');
const js = ts.transpileModule(source.replace(/^import .*;$/gm, ''), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
function harness({ demo = false, signOutError = null, exitError = null } = {}) {
  const calls = [], stateChanges = [];
  let stateIndex = 0;
  const exported = {};
  vm.runInNewContext(js, {
    exports: exported,
    require: name => {
      assert.equal(name, 'react/jsx-runtime');
      return { jsx: (type, props) => ({ type, props }) };
    },
    createContext: () => ({ Provider: 'AuthProvider' }),
    useCallback: fn => fn,
    useEffect: () => {},
    useMemo: fn => fn(),
    useState: initial => {
      const index = stateIndex++;
      return [initial, next => stateChanges.push({ index, next })];
    },
    isSupabaseConfigured: true,
    isDemo: demo,
    exitDemo: async () => { calls.push('exitDemo'); if (exitError) throw exitError; },
    supabase: { auth: { signOut: async (...args) => {
      calls.push({ name: 'supabase.auth.signOut', args });
      return { error: signOutError };
    } } },
    Error, setTimeout,
  });
  const provider = exported.AuthProvider({ children: 'child' });
  assert.equal(typeof provider.props.value.signOut, 'function');
  return { signOut: provider.props.value.signOut, calls, stateChanges };
}
test('demo navbar sign-out delegates to tab-local exit and never globally signs out shared accounts', async () => {
  const app = harness({ demo: true });
  await app.signOut();
  assert.deepEqual(app.calls, ['exitDemo']);
  assert.equal(app.stateChanges.length, 0);
});
test('real account sign-out keeps the existing Supabase behavior and clears auth state', async () => {
  const app = harness();
  await app.signOut();
  assert.equal(app.calls.length, 1);
  assert.equal(app.calls[0].name, 'supabase.auth.signOut');
  assert.equal(app.calls[0].args.length, 0);
  assert.deepEqual(app.stateChanges, [{ index: 0, next: null }, { index: 1, next: null }, { index: 2, next: null }]);
});
test('failed real account sign-out propagates its error without clearing displayed auth state', async () => {
  const failure = new Error('Sign out failed');
  const app = harness({ signOutError: failure });
  await assert.rejects(app.signOut(), error => error === failure);
  assert.equal(app.calls.length, 1);
  assert.equal(app.stateChanges.length, 0);
});
test('demo exit error never falls back to global account sign-out', async () => {
  const failure = new Error('Exit failed');
  const app = harness({ demo: true, exitError: failure });
  await assert.rejects(app.signOut(), error => error === failure);
  assert.deepEqual(app.calls, ['exitDemo']);
});
