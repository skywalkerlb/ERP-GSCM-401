import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';

const compile = (path, suffix = '') => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8').replace(/^import .*;$/gm, '') + suffix, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const helpers = {};
vm.runInNewContext(compile('../../src/hooks/useAuth.tsx'), { exports: helpers, createContext: () => ({}), require: () => ({}) });
const pages = compile('../../src/app/AuthPages.tsx', '\nexport const internals = { SignInForm, AuthFrame };');
const guard = compile('../../src/components/RequireRole.tsx');
function mount(name, { auth = {}, error = null, search = '', hash = '', guardProps = null } = {}) {
  const state = [], calls = [], exported = {}; let index = 0;
  vm.runInNewContext(guardProps ? guard : pages, {
    exports: exported,
    require: () => ({ jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' }),
    useState: initial => { const i = index++; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial; return [state[i], next => { state[i] = next; }]; },
    useAuth: () => ({ session: null, profile: null, loading: false, profileError: null,
      signOut: async () => { calls.push(['signOut']); if (error) throw error; },
      refreshProfile: async () => { calls.push(['refreshProfile']); },
      signUp: async input => { calls.push(['signUp', input]); return error ? { error: helpers.friendlyAuthError(error) } : { needsConfirmation: true }; }, ...auth }),
    useLocation: () => ({ state: null, pathname: '/private', search: '' }), useNavigate: () => to => { calls.push(['navigate', to]); }, homeFor: role => role === 'customer' ? '/shop' : '/',
    ...Object.fromEntries(['Link', 'Navigate', 'Alert', 'Button', 'Card', 'Logo', 'Skeleton', 'SkeletonLines', 'TextField', 'Select', 'ThemeToggle', 'EmptyState'].map(x => [x, x])),
    friendlyAuthError: helpers.friendlyAuthError, signupFieldErrors: helpers.signupFieldErrors,
    isDemo: false, isDemoConfigured: false, URLSearchParams, window: { location: { origin: 'https://glazed.example', search, hash } },
    supabase: { auth: Object.fromEntries(['resend', 'resetPasswordForEmail', 'updateUser'].map(method => [method, async (...args) => { calls.push([method, ...args]); return { error }; }])) },
  });
  const component = guardProps ? exported.RequireRole : exported[name] ?? exported.internals[name];
  return { render: () => { index = 0; return component(guardProps ?? {}); }, calls };
}
function nodes(tree) { return !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children), ...nodes(tree.props?.action)]; }
function find(app, type, key, value) { const n = nodes(app.render()).find(n => n.type === type && (!key || n.props[key] === value)); assert.ok(n, `Missing ${type} ${value ?? ''}`); return n; }
function field(app, label, value) { find(app, 'TextField', 'label', label).props.onChange({ target: { value } }); }
const tick = () => new Promise(resolve => setImmediate(resolve));
async function submit(app) { await find(app, 'form').props.onSubmit({ preventDefault() {} }); await tick(); }
const message = (app, title) => find(app, 'Alert', 'title', title).props.children;

test('confirmation resend sends trimmed email/current-origin callback and exposes rate-limit failure', async () => {
  for (const error of [null, { code: 'over_email_send_rate_limit' }]) {
    const app = mount('SignInForm', { error }); field(app, 'Email', ' jane@example.com ');
    find(app, 'Button', 'children', 'Resend confirmation email').props.onClick(); await tick();
    assert.equal(app.calls[0][0], 'resend'); assert.equal(app.calls[0][1].email, 'jane@example.com');
    assert.equal(app.calls[0][1].options.emailRedirectTo, 'https://glazed.example/login');
    assert.match(message(app, error ? 'Could not sign in' : 'Check your email'), error ? /Wait a minute/ : /If your account needs confirmation/);
  }
});
test('recovery uses correct redirect, preserves email privacy and reports network failure', async () => {
  for (const error of [null, { message: 'Network fetch failed' }]) {
    const app = mount('PasswordRecoveryPage', { error }); field(app, 'Email', ' jane@example.com '); await submit(app);
    assert.equal(app.calls[0][0], 'resetPasswordForEmail'); assert.equal(app.calls[0][1], 'jane@example.com');
    assert.equal(app.calls[0][2].redirectTo, 'https://glazed.example/update-password');
    assert.match(message(app, error ? 'Could not send the link' : 'Check your email'), error ? /Check your connection/ : /If an account exists/);
  }
});
test('invited and recovering users save matching password then sign out', async () => {
  const app = mount('PasswordUpdatePage', { auth: { session: {} } });
  field(app, 'New password', 'new-password'); field(app, 'Confirm password', 'new-password'); await submit(app);
  assert.equal(app.calls[0][0], 'updateUser'); assert.equal(app.calls[0][1].password, 'new-password');
  assert.equal(app.calls[1][0], 'signOut'); message(app, 'Password saved');
});
test('password mismatch avoids update; server failure retains retry form', async () => {
  const app = mount('PasswordUpdatePage', { auth: { session: {} }, error: { message: 'Network fetch failed' } });
  field(app, 'New password', 'new-password'); field(app, 'Confirm password', 'different'); await submit(app);
  assert.equal(app.calls.length, 0); assert.match(message(app, 'Could not save password'), /do not match/);
  field(app, 'Confirm password', 'new-password'); await submit(app);
  assert.equal(app.calls.length, 1); assert.match(message(app, 'Could not save password'), /Check your connection/);
});
test('missing/expired email links block password updates even when another session exists', () => {
  for (const options of [{}, { auth: { session: {} }, hash: '#error=access_denied&error_code=otp_expired' }]) {
    const app = mount('PasswordUpdatePage', options); message(app, 'Open your email link');
    assert.equal(nodes(app.render()).filter(n => n.type === 'form').length, 0);
  }
});
test('expired confirmation is visible instead of redirecting an existing session', () => {
  const app = mount('LoginPage', { auth: { session: {}, profile: { role: 'customer' } }, search: '?error_code=otp_expired' });
  assert.equal(nodes(app.render()).filter(n => n.type === 'Navigate').length, 0);
  assert.match(message(mount('AuthFrame', { hash: '#error=access_denied' }), 'This email link could not be used'), /Request a new confirmation/);
});
test('explicit sign in still navigates after expired-link guidance', async () => {
  const app = mount('SignInForm', { search: '?error_code=otp_expired', auth: { signIn: async () => ({ profile: { role: 'customer' } }) } });
  field(app, 'Email', 'jane@example.com'); field(app, 'Password', 'secret123'); await submit(app);
  assert.equal(app.calls.at(-1)[0], 'navigate'); assert.equal(app.calls.at(-1)[1], '/shop');
});
test('signup places all validation errors on fields without an account request', async () => {
  const app = mount('PortalSignupPage'); field(app, 'Full name', '   '); field(app, 'Email', 'broken'); field(app, 'Password', 'short'); await submit(app);
  for (const label of ['Full name', 'Email', 'Password']) assert.ok(find(app, 'TextField', 'label', label).props.error);
  assert.equal(app.calls.length, 0);
});
test('signup confirmation notice handles obfuscated duplicates and explicit errors', async () => {
  for (const error of [null, { code: 'email_exists' }]) {
    const app = mount('PortalSignupPage', { error }); field(app, 'Full name', 'Jane Doe'); field(app, 'Email', 'jane@example.com'); field(app, 'Password', 'secret123'); await submit(app);
    assert.match(message(app, error ? 'Could not create the account' : 'Check your email'), error ? /Sign in instead/ : /If you already have an account/);
    assert.equal(app.calls[0][0], 'signUp');
  }
});
test('missing-profile retry and signout work; signout failure offers useful recovery', async () => {
  const app = mount('RequireRole', { auth: { session: {} }, guardProps: { children: 'private' }, error: new Error('offline') });
  await find(app, 'Button', 'children', 'Retry account setup').props.onClick(); assert.equal(app.calls[0][0], 'refreshProfile');
  await find(app, 'Button', 'children', 'Sign out').props.onClick(); assert.equal(app.calls[1][0], 'signOut');
  assert.match(find(app, 'EmptyState').props.description, /Could not sign out/);
});
