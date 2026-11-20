import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/features/people/PeoplePage.tsx', import.meta.url), 'utf8');
const shared = readFileSync(new URL('../../supabase/functions/_shared/account-access.ts', import.meta.url), 'utf8');
const identity = readFileSync(new URL('../../supabase/functions/_shared/identity.ts', import.meta.url), 'utf8').replace(/export /g, '');
const js = ts.transpileModule(identity + '\n' + shared.replace(/export /g, '') + '\n' + source.replace(/^import .*;$/gm, '') + '\nexport const testing = { demoAction, sampleDirectory };', {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
function harness(role) {
  const exported = {}, stored = new Map();
  const profile = { user_id: `demo-${role}`, role };
  vm.runInNewContext(js, {
    exports: exported, require: () => ({ jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' }),
    useAuth: () => ({ profile }), useLocation: () => ({ state: null }), isDemo: true,
    useState: initial => [initial, () => {}], useEffect: () => {},
    useQuery: () => ({ data: exported.testing.sampleDirectory(), isPending: false }),
    useQueryClient: () => ({ invalidateQueries: async () => {} }),
    sessionStorage: { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value) },
    crypto: { randomUUID: () => 'invited-account' },
    supabase: new Proxy({}, { get() { throw Error('Demo must not call the backend'); } }),
    ...Object.fromEntries(['Alert','Badge','Button','Card','DataTable','PageHeader','Select','TextField'].map(name => [name, name])),
  });
  return { render: () => exported.default(), action: input => exported.testing.demoAction(input, profile), stored };
}
function find(node, type) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(child => find(child, type));
  return [...(node.type === type ? [node] : []), ...find(node.props?.children, type)];
}
for (const [role, expected] of [['owner',['admin','manager','cashier','baker']], ['admin',['manager','cashier','baker']], ['manager',['cashier','baker']]]) {
  test(`${role} sees only grantable invitation roles and protected account controls`, () => {
    const tree = harness(role).render();
    const select = find(tree, 'Select').find(node => node.props.label === 'Staff role');
    assert.deepEqual(Array.from(select.props.options, option => option.value), expected);
    const table = find(tree, 'DataTable')[0];
    const actionColumn = table.props.columns.find(column => column.key === 'actions');
    for (const person of table.props.rows) {
      const buttons = find(actionColumn.render(person), 'Button');
      const grantable = [...expected, 'customer'].includes(person.role) && person.role !== role;
      assert.equal(buttons.some(button => button.props.children === 'Edit access'), grantable);
      assert.equal(buttons.some(button => button.props.children === 'Reset password'), false);
    }
  });
}
test('non-administrative roles cannot render management forms or mutate demo access', () => {
  for (const role of ['cashier','baker','customer']) {
    const app = harness(role);
    assert.equal(find(app.render(), 'Select').length, 0);
    assert.throws(() => app.action({ action: 'invite', email: 'new@example.com', role: 'cashier' }), /access is required/);
    assert.equal(app.stored.size, 0);
  }
});
test('manager demo changes stay local and reject peer changes and privilege escalation', () => {
  const app = harness('manager');
  for (const input of [
    { action:'invite', email:'manager@example.com', role:'cashier' },
    { action:'invite', email:'new@example.com', role:'manager' },
    { action:'set-role', userId:'demo-admin', role:'customer' },
    { action:'resend', userId:'demo-owner' },
  ]) assert.throws(() => app.action(input), /cannot/);
  assert.equal(app.stored.size, 0);
  const invited = app.action({ action:'invite', email:' NEW@example.com ', role:'baker', homeLocationId:2 });
  assert.match(invited.message, /No email was sent/);
  assert.equal(invited.people.find(person => person.email === 'new@example.com').role, 'baker');
  app.action({ action:'set-role', userId:'invited-account', role:'customer', homeLocationId:null });
  assert.equal(app.action({ action:'list' }).people.find(person => person.email === 'new@example.com').role, 'customer');
});

test('business managers cannot reset global credentials, including in the demo', () => {
  for (const actor of ['owner', 'admin', 'manager', 'cashier', 'baker', 'customer']) {
    for (const target of ['owner', 'admin', 'manager', 'cashier', 'baker', 'customer']) {
      const app = harness(actor);
      assert.throws(() => app.action({ action: 'reset-password', userId: `demo-${target}`, password: 'never-save-this-password' }), /Unsupported business account action|access is required/);
      assert.equal(app.stored.size, 0);
    }
  }
});
test('demo invitations reject reserved username addresses and username display hides internal identifiers', () => {
  assert.throws(() => harness('owner').action({ action: 'invite', email: 'someone@users.glazed.invalid', role: 'cashier' }), /do not use invitation emails/);
  const tree = harness('manager').render();
  const table = find(tree, 'DataTable')[0];
  const personColumn = table.props.columns.find(column => column.key === 'email');
  const row = personColumn.render({ email: 'someone@users.glazed.invalid', full_name: null });
  assert.equal(find(row, 'strong')[0].props.children, 'someone');
});
