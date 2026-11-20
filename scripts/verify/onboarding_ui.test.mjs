import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
const compile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8').replace(/^import .*;$/gm, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function mount({ session = { user: { email: 'owner@example.com' } }, available = true, demo = false, locations = [], failure = null, refresh = { role: 'owner' }, signupError = null, profile = null } = {}) {
  const exported = {}, state = [], calls = []; let index = 0;
  vm.runInNewContext(compile('../../src/app/CreateBusinessPage.tsx'), {
    exports: exported, Error, crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000002' }, sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} }, appPath: path => path, selectBusiness: business => calls.push(['selectBusiness', business]), window: { location: { assign: path => calls.push(['navigate', path]) } },
    require: () => ({ jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' }),
    useState: initial => { const i = index++; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial; return [state[i], value => { state[i] = value; }]; },
    useQuery: () => ({ data: { available }, isPending: false }),
    useNavigate: () => (...args) => calls.push(['navigate', ...args]),
    useAuth: () => ({ session, profile, loading: false, signIn: async (...args) => { calls.push(['signIn', ...args]); return {}; }, signOut: async () => {}, refreshProfile: async () => { calls.push(['refreshProfile']); return refresh; } }),
    onboardingAction: async input => { calls.push(['onboarding', input]); if (failure) throw new Error(failure); return { business_id: 'business-new', name: 'My donuts', slug: 'my-donuts' }; },
    supabase: { auth: { signUp: async input => { calls.push(['signUp', input]); return { data: { session: {} }, error: signupError }; } } },
    friendlyAuthError: error => error.message, usernameFromEmail: email => email.endsWith('@user.glazed.invalid') ? 'legacy' : null,
    isDemo: demo,
    ...Object.fromEntries(['AuthFrame','Link','Alert','Button','Select','Skeleton','TextField'].map(name => [name, name])),
  });
  return { calls, render() { index = 0; return exported.default(); } };
}
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children), ...nodes(tree.props?.action)];
const find = (app, type, label) => { const node = nodes(app.render()).find(node => node.type === type && (!label || node.props.label === label || node.props.children === label)); assert.ok(node, `Missing ${type}: ${label}`); return node; };
const field = (app, label, value) => find(app, 'TextField', label).props.onChange({ target: { value } });
const submit = async app => { await find(app, 'form').props.onSubmit({ preventDefault() {} }); };


test('demo offers no registration mutation form', () => {
  const app = mount({ demo: true }); assert.equal(nodes(app.render()).filter(node => node.type === 'form').length, 0); assert.equal(app.calls.length, 0);
});
test('new owner email signup sends no role claims or setup code to Auth', async () => {
  const app = mount({ session: null }); field(app, 'Email', ' OWNER@example.com '); field(app, 'Password', 'secret-password'); await submit(app);
  assert.equal(app.calls[0][0], 'signUp'); assert.equal(app.calls[0][1].email, 'owner@example.com');
  assert.equal(app.calls[0][1].options.data.registration_intent, 'business'); assert.equal(Object.hasOwn(app.calls[0][1].options.data, 'role'), false);
});
test('existing email login stays in business creation flow', async () => {
  const app = mount({ session: null }); find(app, 'Button', 'Sign in to an existing account').props.onClick();
  field(app, 'Email', 'owner@example.com'); field(app, 'Password', 'secret-password'); await submit(app);
  assert.equal(app.calls[0][0], 'signIn'); assert.equal(app.calls.some(call => call[0] === 'navigate'), false);
});
test('an existing owner can create another independent business', async () => {
  const app = mount({ profile: { role: 'owner' }, available: false });
  field(app, 'Business name', 'My donuts'); field(app, 'First shop name', 'Main shop'); field(app, 'Shop address', '100 Main St'); await submit(app);
  const input = app.calls.find(call => call[0] === 'onboarding')[1];
  assert.equal(input.action, 'create'); assert.equal(input.location_name, 'Main shop'); assert.equal(input.business_name, 'My donuts');
  assert.equal(Object.hasOwn(input, 'setup_code'), false); assert.ok(input.request_id);
  assert.equal(app.calls.at(-1)[0], 'navigate'); assert.equal(app.calls.at(-1)[1], '/');
  assert.equal(app.calls.find(call => call[0] === 'selectBusiness')[1].business_id, 'business-new');
});
test('failed creation retains fields and reuses request id when retried', async () => {
  const app = mount({ failure: 'Connection failed. Try again.' });
  field(app, 'Business name', 'My donuts'); field(app, 'First shop name', 'Main shop'); field(app, 'Shop address', '100 Main St'); await submit(app); await submit(app);
  const calls = app.calls.filter(call => call[0] === 'onboarding');
  assert.equal(calls.length, 2); assert.equal(calls[0][1].request_id, calls[1][1].request_id);
  assert.equal(find(app, 'TextField', 'Business name').props.value, 'My donuts');
  assert.equal(app.calls.some(call => call[0] === 'navigate'), false);
});
