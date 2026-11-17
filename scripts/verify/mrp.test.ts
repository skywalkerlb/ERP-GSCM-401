import { test } from "node:test";
import assert from "node:assert/strict";
import { BOMS, ITEM_BY_SKU, SUPPLIERS } from "../seed/catalog";
import { mrpPlan } from "../seed/mrp";
import type { Ev } from "../seed/events";
import type { PoRec } from "../seed/simulate";
import { keysForTopic } from "../../src/lib/realtimeTopics";
import { queryKeys } from "../../src/lib/queryKeys";

const start = "2030-01-07";
const order = (d: string, qty = 12): Ev => ({
  t: "so_create",
  d: start,
  m: 720,
  key: d,
  customer: "test",
  loc: "PRV",
  requested: { d, m: 720 },
  channel: "catering",
  lines: [{ sku: "KT-GFT", qty }],
});
const receipt = (expected: string): PoRec =>
  ({
    expected,
    closed: false,
    lines: [{ sku: "RS-BNS", qty: 108, received: 3, cancelled: 5 }],
  }) as PoRec;
const inventory = new Map([["KIT|RS-BNS|fresh", 5]]);
const beans = (orders: Ev[], pos: PoRec[] = []) =>
  mrpPlan(start, orders, inventory, pos).filter((r) => r.sku === "RS-BNS");

test("catalog has at least five valid single-level parent BOMs and component lead times", () => {
  assert.ok(Object.keys(BOMS).length >= 5);
  for (const [parent, components] of Object.entries(BOMS)) {
    assert.ok(ITEM_BY_SKU[parent]);
    assert.ok(Object.keys(components).length > 0);
    for (const [sku, qtyPer] of Object.entries(components)) {
      const item = ITEM_BY_SKU[sku];
      assert.ok(item, `${parent}: missing ${sku}`);
      assert.ok(qtyPer > 0);
      assert.ok(Number.isInteger(item.leadDays) && item.leadDays >= 0);
      assert.ok(
        !BOMS[sku],
        `${parent}: fixture expects single-level components`,
      );
    }
  }
});

test("kit demand nets on hand, rounds to packs and backs off component lead time", () => {
  const [r] = beans([order("2030-01-09")]);
  assert.equal(r.gross, 12);
  assert.equal(r.beginning, 5);
  assert.equal(r.net, 7);
  assert.equal(r.planned, 12);
  assert.equal(r.requirementDate, "2030-01-09");
  assert.equal(r.orderBy, "2030-01-02");
  assert.equal(r.expedite, true);
});

test("late same-week receipts cannot cover earlier demand; surplus carries forward", () => {
  const rows = beans(
    [order("2030-01-09"), order("2030-01-16")],
    [receipt("2030-01-12")],
  );
  assert.equal(rows[0].sr, 100);
  assert.equal(rows[0].net, 7);
  assert.equal(rows[0].planned, 12);
  assert.equal(rows[1].beginning, 105);
  assert.equal(rows[1].planned, 0);
});

test("same-day receipts cover demand after received and cancelled quantities are removed", () => {
  const [r] = beans([order("2030-01-09")], [receipt("2030-01-09")]);
  assert.equal(r.sr, 100);
  assert.equal(r.net, 0);
  assert.equal(r.orderBy, null);
});

test("net requirement covers the peak deficit and date marks the first deficit", () => {
  const po = receipt("2030-01-09");
  po.lines[0].qty = 18; // ten still due
  const [r] = beans([order("2030-01-08"), order("2030-01-10", 16)], [po]);
  assert.equal(r.net, 13);
  assert.equal(r.planned, 24);
  assert.equal(r.requirementDate, "2030-01-08");
});

test("closed receipts and out-of-horizon orders do not reduce current shortages", () => {
  const po = receipt("2030-01-08");
  po.closed = true;
  const [r] = beans([order("2030-01-09"), order("2030-02-04", 1000)], [po]);
  assert.equal(r.gross, 12);
  assert.equal(r.sr, 0);
  assert.equal(r.net, 7);
});

test("all stock, BOM and forecast events invalidate MRP", () => {
  for (const topic of [
    "sale.completed",
    "return.processed",
    "so.cancelled",
    "po.received",
    "mo.started",
    "transfer.completed",
    "inventory.adjusted",
    "inventory.changed",
    "waste.logged",
    "day.closed",
    "bakeplan.released",
    "item.updated",
    "supplier.updated",
    "forecast.generated",
  ]) {
    assert.ok(
      keysForTopic(topic).some(
        (key) => JSON.stringify(key) === JSON.stringify(queryKeys.mrp.all),
      ),
      topic,
    );
  }
});

test("component lead times agree with the supplier values used by the seed runner", () => {
  for (const sku of new Set(
    Object.values(BOMS).flatMap((b) => Object.keys(b)),
  )) {
    const item = ITEM_BY_SKU[sku];
    if (item.supplier)
      assert.equal(
        item.leadDays,
        SUPPLIERS.find((s) => s.code === item.supplier)?.quoted_lead_time_days,
      );
  }
});
