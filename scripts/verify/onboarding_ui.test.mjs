import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
const compile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8').replace(/^import .*;$/gm, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function mount({ session = { user: { email: 'owner@example.com' } }, available = true, demo = false, locations = [], failure = null, refresh = { role: 'owner' }, signupError = null, profile = null } = {}) {
  const exported = {}, state = [], calls = []; let index = 0;
  vm.runInNewContext(compile('../../src/app/CreateBusinessPage.tsx'), {
    exports: exported, Error,
    require: () => ({ jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' }),
    useState: initial => { const i = index++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = value; }]; },
    useQuery: () => ({ data: { available }, isPending: false }),
    useNavigate: () => (...args) => calls.push(['navigate', ...args]),
    useAuth: () => ({ session, profile, loading: false, signIn: async (...args) => { calls.push(['signIn', ...args]); return {}; }, signOut: async () => {}, refreshProfile: async () => { calls.push(['refreshProfile']); return refresh; } }),
    onboardingAction: async input => { calls.push(['onboarding', input]); if (failure) throw new Error(failure); return input.action === 'locations' ? { locations } : { completed: true }; },
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

test('closed and demo installations offer no account or setup mutation forms', () => {
  for (const options of [{ available: false }, { demo: true }]) {
    const app = mount(options); assert.equal(nodes(app.render()).filter(node => node.type === 'form').length, 0); assert.equal(app.calls.length, 0);
  }
});
test('new owner email signup sends no role claims or setup code to Auth', async () => {
  const app = mount({ session: null }); field(app, 'Email', ' OWNER@example.com '); field(app, 'Password', 'secret-password'); await submit(app);
  assert.equal(app.calls[0][0], 'signUp'); assert.equal(app.calls[0][1].email, 'owner@example.com');
  assert.equal(Object.hasOwn(app.calls[0][1], 'options'), false);
});
test('existing owner email login stays in setup flow', async () => {
  const app = mount({ session: null }); find(app, 'Button', 'Use an existing account').props.onClick();
  field(app, 'Email', 'owner@example.com'); field(app, 'Password', 'secret-password'); await submit(app);
  assert.equal(app.calls[0][0], 'signIn'); assert.equal(app.calls.some(call => call[0] === 'navigate'), false);
});
test('setup code failure keeps the form retryable and cannot grant privileges', async () => {
  const app = mount({ failure: 'Private setup code is incorrect.' }); field(app, 'Private setup code', 'wrong'); await submit(app);
  find(app, 'TextField', 'Private setup code'); assert.equal(app.calls.length, 1);
  assert.equal(nodes(app.render()).some(node => node.type === 'Alert' && node.props.children === 'Private setup code is incorrect.'), true);
});
test('empty installation creates first location, refreshes owner and opens People', async () => {
  const app = mount(); field(app, 'Private setup code', 'private-code'); await submit(app);
  field(app, 'Business name', 'My donuts'); field(app, 'First shop name', 'Main shop'); field(app, 'Shop address', '100 Main St'); await submit(app);
  const input = app.calls.find(call => call[1]?.action === 'complete')[1];
  assert.equal(input.location_id, null); assert.equal(input.location_name, 'Main shop');
  assert.equal(app.calls.at(-1)[0], 'navigate'); assert.equal(app.calls.at(-1)[1], '/people');
});
test('existing locations are selected without sending replacement location details', async () => {
  const app = mount({ locations: [{ id: 7, name: 'Original shop' }] }); field(app, 'Private setup code', 'private-code'); await submit(app);
  find(app, 'Select', 'First shop'); assert.equal(nodes(app.render()).some(node => node.props?.label === 'First shop name'), false);
  field(app, 'Business name', 'My donuts'); await submit(app);
  assert.equal(app.calls.find(call => call[1]?.action === 'complete')[1].location_id, 7);
});
test('profile refresh failure retries access without submitting setup a second time', async () => {
  const app = mount({ refresh: null }); field(app, 'Private setup code', 'private-code'); await submit(app);
  field(app, 'Business name', 'My donuts'); field(app, 'First shop name', 'Main shop'); field(app, 'Shop address', '100 Main St'); await submit(app); await submit(app);
  assert.equal(app.calls.filter(call => call[1]?.action === 'complete').length, 1);
  assert.equal(app.calls.filter(call => call[0] === 'refreshProfile').length, 2);
});

test('owner returning after a lost response can open People when setup is closed', () => {
  const app = mount({ available: false, profile: { role: 'owner' } });
  find(app, 'Button', 'Open People').props.onClick();
  assert.equal(app.calls.at(-1)[1], '/people');
  assert.equal(app.calls.some(call => call[0] === 'onboarding'), false);
});
