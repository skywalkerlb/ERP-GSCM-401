import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { ACCESS } from '../../src/app/access';
import { navFor } from '../../src/app/nav';
import { canCall, RPC_ROLES, type AppRole } from '../../src/types/domain';

test('owner and admin inherit all manager operation permissions', () => {
  for (const role of ['owner', 'admin', 'manager'] as AppRole[]) {
    for (const rpc of Object.keys(RPC_ROLES) as (keyof typeof RPC_ROLES)[]) assert.equal(canCall(role, rpc), true);
    for (const group of ['manager', 'sell', 'bakery', 'staff'] as const) assert.ok((ACCESS[group] as readonly string[]).includes(role));
  }
});
test('only owner receives People navigation and access', () => {
  for (const role of ['owner', 'admin', 'manager', 'cashier', 'baker', 'customer'] as AppRole[]) {
    assert.equal(navFor(role).flatMap(s => s.items).some(i => i.to === '/people'), role === 'owner');
    assert.equal((ACCESS.owner as readonly string[]).includes(role), role === 'owner');
  }
});
test('operational and customer roles remain limited', () => {
  assert.equal(canCall('cashier', 'complete_sale'), true);
  assert.equal(canCall('cashier', 'create_purchase_order'), false);
  assert.equal(canCall('baker', 'complete_production_order'), true);
  assert.equal(canCall('baker', 'complete_sale'), false);
  assert.equal(canCall('customer', 'place_pickup_order'), true);
  assert.equal(canCall('customer', 'complete_sale'), false);
  assert.deepEqual(navFor('customer'), []);
});
test('demo reset refuses the persistent project before connecting or resetting', () => {
  const result = spawnSync(process.execPath, ['scripts/demo/setup.mjs'], { encoding: 'utf8', env: { ...process.env, DEMO_PROJECT_REF: 'eaphbcbklbcadokfcewc', DEMO_DATABASE_URL: 'postgres://test:test@localhost/test', DEMO_PASSWORD: 'test', DEMO_SUPABASE_SERVICE_ROLE_KEY: 'test' } });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /separate disposable demo project/);
});
