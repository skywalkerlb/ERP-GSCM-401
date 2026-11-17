import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { assertDisposableDemo, isProtectedProject, PROTECTED_PROJECT_REFS } from '../../supabase/functions/_shared/protected-projects.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const disposable = 'abcdefghijklmnopqrst';
test('both current and former persistent backends are protected for direct and pooler targets', () => {
  for (const ref of PROTECTED_PROJECT_REFS) {
    assert.equal(isProtectedProject(ref), true);
    for (const url of [`postgres://postgres:unused@db.${ref}.supabase.co/postgres`, `postgres://postgres.${ref}:unused@aws-1.pooler.supabase.com/postgres`]) {
      assert.throws(() => assertDisposableDemo(ref, url), /Persistent ERP projects/);
      assert.throws(() => assertDisposableDemo(disposable, url), /must match/);
    }
  }
});
test('demo mutation guard accepts only matching disposable hosted database connections', () => {
  assert.doesNotThrow(() => assertDisposableDemo(disposable, `postgres://postgres@db.${disposable}.supabase.co/postgres`));
  assert.doesNotThrow(() => assertDisposableDemo(disposable, `postgresql://postgres.${disposable}@aws-1.pooler.supabase.com/postgres`));
  for (const ref of [undefined, '', 'invalid']) assert.throws(() => assertDisposableDemo(ref, ''), /disposable/);
  for (const url of ['', 'invalid', `https://db.${disposable}.supabase.co/postgres`, 'postgres://postgres@localhost/postgres']) assert.throws(() => assertDisposableDemo(disposable, url));
});
for (const ref of PROTECTED_PROJECT_REFS) {
  for (const action of ['seed', 'demo-prep', 'setup']) test(`${action} rejects protected ${ref} before connecting or mutating`, () => {
    const command = action === 'setup'
      ? ['scripts/demo/setup.mjs']
      : ['--import', './scripts/seed/node_modules/tsx/dist/esm/index.mjs', 'scripts/seed/run.ts', action];
    const result = spawnSync(process.execPath, command, {
      cwd: root, encoding: 'utf8', timeout: 10000,
      env: { ...process.env, DEMO_PROJECT_REF: ref, DATABASE_URL: `postgres://postgres:unused@db.${ref}.supabase.co/postgres`, DEMO_DATABASE_URL: `postgres://postgres:unused@db.${ref}.supabase.co/postgres`, DEMO_SUPABASE_SERVICE_ROLE_KEY: 'test-only', DEMO_PASSWORD: 'test-only' },
    });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /Persistent ERP projects cannot be used/);
    assert.doesNotMatch(result.stderr, /getaddrinfo|ECONNREFUSED|timeout/i);
    assert.doesNotMatch(result.stdout, /Simulating|Replaying|Reset business data|Demo prep for/);
  });
}
