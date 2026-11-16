import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
const source = readFileSync(new URL('../../src/app/AppShell.tsx', import.meta.url), 'utf8');
const js = ts.transpileModule(source.replace(/^import .*;$/gm, '') + '\nexport const gate = RouteRoleGate;', {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
test('a role demotion redirects the current restricted route to an allowed home screen', () => {
  for (const [role, expected] of [['manager',null], ['cashier','/pos'], ['baker','/forecast'], ['customer','/shop']]) {
    const exported = {};
    vm.runInNewContext(js, {
      exports: exported,
      require: () => ({ jsx: (type, props) => ({ type, props }), Fragment:'Fragment' }),
      useAuth: () => ({ profile:{ role } }),
      useMatches: () => [{ handle:{ roles:['owner','admin','manager'] } }],
      homeFor: value => ({ cashier:'/pos', baker:'/forecast', customer:'/shop' })[value] ?? '/',
      Navigate: 'Navigate',
    });
    const result = exported.gate({ children:'People screen' });
    if (expected) {
      assert.equal(result.type, 'Navigate');
      assert.equal(result.props.to, expected);
      assert.equal(result.props.replace, true);
    } else assert.equal(result.props.children, 'People screen');
  }
});
