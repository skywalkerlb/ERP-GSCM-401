import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/lib/appUrl.ts', import.meta.url), 'utf8');
function load(base) {
  const exported = {};
  const code = ts.transpileModule(source.replaceAll('import.meta.env', '__env'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { exports: exported, __env: { BASE_URL: base }, URL, window: { location: { origin: 'https://skywalkerlb.github.io' } } });
  return exported;
}
for (const base of ['/', '/ERP-GSCM-401/']) {
  test(`full-page URLs preserve the ${base} hosting base and Auth fragments`, () => {
    const helpers = load(base);
    assert.equal(helpers.appPath('/'), base);
    assert.equal(helpers.appPath('/login'), base + 'login');
    assert.equal(helpers.appPath('/shop/orders?view=open'), base + 'shop/orders?view=open');
    assert.equal(helpers.appUrl('/update-password#access_token=sample'), 'https://skywalkerlb.github.io' + base + 'update-password#access_token=sample');
    assert.equal(helpers.appUrl('/accept-invite?code=sample'), 'https://skywalkerlb.github.io' + base + 'accept-invite?code=sample');
  });
}
