import { chromium } from "playwright";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// UI integration tests with a local mocked Supabase API. SQL suites separately
// verify real database authorization, netting and component consumption.
const root = fileURLToPath(new URL("../../", import.meta.url));
const origin = "http://127.0.0.1:4174";
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    "4174",
    "--strictPort",
  ],
  {
    cwd: root,
    stdio: "ignore",
    env: {
      ...process.env,
      VITE_SUPABASE_URL: "http://127.0.0.1:54321",
      VITE_SUPABASE_ANON_KEY: "browser-test",
      VITE_DEMO_SUPABASE_URL: "",
      VITE_DEMO_SUPABASE_ANON_KEY: "",
      VITE_DEMO_PASSWORD: "",
    },
  },
);
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null)
      throw new Error("Test Vite server exited; port 4174 must be free.");
    try {
      ready = (await fetch(origin)).ok;
    } catch {}
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error("Test Vite server did not become ready.");
  browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
      (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
    headless: true,
    args: ["--no-sandbox"],
  });
  const user = {
    id: "11111111-1111-4111-8111-111111111111",
    aud: "authenticated",
    role: "authenticated",
    email: "test@example.invalid",
    app_metadata: {},
    user_metadata: {},
  };
  const base = {
    item_type: "finished",
    is_active: true,
    is_sellable: true,
    is_purchasable: false,
    is_manufactured: true,
    uom: "each",
    lead_time_days: 1,
    list_price: 2,
    pack_size: 1,
    preferred_supplier_id: null,
  };
  const parents = Array.from({ length: 5 }, (_, i) => ({
    ...base,
    id: i + 1,
    sku: `P${i + 1}`,
    name: `Parent ${i + 1}`,
  }));
  const component = {
    ...base,
    id: 6,
    sku: "FLOUR",
    name: "Bread flour",
    item_type: "raw",
    is_sellable: false,
    is_purchasable: true,
    is_manufactured: false,
    uom: "lb",
    lead_time_days: 3,
    pack_size: 4,
    preferred_supplier_id: 1,
  };
  const shops = [
    {
      id: 1,
      code: "PRV",
      name: "Provo",
      kind: "shop",
      is_active: true,
      address: "123 Main Street",
      tax_rate: 0.0725,
      open_time: "06:00",
      close_time: "20:00",
      closed_weekdays: [],
    },
    {
      id: 2,
      code: "ORM",
      name: "Orem",
      kind: "shop",
      is_active: true,
      address: "456 State Street",
      tax_rate: 0.0725,
      open_time: "06:00",
      close_time: "20:00",
      closed_weekdays: [],
    },
    {
      id: 3,
      code: "KIT",
      name: "Central kitchen",
      kind: "kitchen",
      is_active: true,
    },
  ];
  const catalog = shops
    .slice(0, 2)
    .map((shop) => ({
      location_id: shop.id,
      location_code: shop.code,
      location_name: shop.name,
      item_id: 1,
      sku: "P1",
      name: "Parent 1",
      category: "Donuts",
      list_price: 2,
      available_qty: shop.id === 1 ? 12 : 0,
      in_stock: shop.id === 1,
      est_available_date: "2026-11-18",
    }));
  const plans = Array.from({ length: 4 }, (_, i) => ({
    item_id: 6,
    sku: "FLOUR",
    item_name: "Bread flour",
    uom: "lb",
    supplier_id: 1,
    supplier_name: "Test supplier",
    lead_time_days: 3,
    pack_size: 4,
    week_no: i + 1,
    week_start: ["2026-11-16", "2026-11-23", "2026-11-30", "2026-12-07"][i],
    week_end: ["2026-11-22", "2026-11-29", "2026-12-06", "2026-12-13"][i],
    beginning_on_hand: i ? 1 : 5,
    gross_req: i ? 0 : 12,
    scheduled_receipts: 0,
    net_req: i ? 0 : 7,
    planned_order_qty: i ? 0 : 8,
    projected_on_hand: 1,
    requirement_date: i ? null : "2026-11-18",
    order_by_date: i ? null : "2026-11-15",
    is_expedite: !i,
  }));
  for (const role of ["manager", "customer"]) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    if (role === "manager")
      await context.addInitScript(
        ({ user }) =>
          localStorage.setItem(
            "glazed-auth-v1",
            JSON.stringify({
              access_token:
                "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEifQ.test",
              refresh_token: "test",
              expires_at: Math.floor(Date.now() / 1000) + 3600,
              token_type: "bearer",
              user,
            }),
          ),
        { user },
      );
    const page = await context.newPage();
    const errors = [];
    let placed = null;
    let failCatalog = false;
    let hideCatalog = false;
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("http://127.0.0.1:54321/**", async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const name = url.pathname.split("/").pop();
      if (req.method() === "OPTIONS")
        return route.fulfill({
          status: 200,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "*",
          },
        });
      let result = [];
      if (name === "profiles")
        result = {
          user_id: user.id,
          full_name: "Browser tester",
          role,
          home_location_id: 1,
          customer_id: role === "customer" ? 1 : null,
        };
      else if (name === "user") result = user;
      else if (name === "token")
        result = {
          access_token:
            "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEifQ.test",
          refresh_token: "test",
          expires_in: 3600,
          token_type: "bearer",
          user,
        };
      else if (name === "locations")
        result = url.search.includes("kind=eq.shop")
          ? shops.slice(0, 2)
          : shops;
      else if (name === "items") result = [...parents, component];
      else if (name === "bom_lines")
        result = parents.map((p) => ({
          id: p.id,
          parent_item_id: p.id,
          component_item_id: 6,
          qty_per: 2,
        }));
      else if (name === "item_suppliers")
        result = [
          {
            item_id: 6,
            supplier_id: 1,
            unit_cost: 1,
            pack_size: 4,
            is_preferred: true,
          },
        ];
      else if (name === "mrp_weekly") result = plans;
      else if (name === "sales_orders")
        result = [
          {
            id: 1,
            so_number: "ORD-00001",
            location_id: 1,
            status: "placed",
            requested_for: "2026-11-18T19:00:00Z",
          },
        ];
      else if (name === "so_lines")
        result = [{ id: 1, so_id: 1, item_id: 1, qty: 6, qty_fulfilled: 0 }];
      else if (name === "get_catalog_availability") {
        if (failCatalog)
          return route.fulfill({
            status: 500,
            json: { message: "Availability test failure" },
          });
        result = hideCatalog ? [] : catalog;
      } else if (name === "get_my_orders")
        result = placed
          ? [
              {
                id: 1,
                so_number: "ORD-00001",
                status: "placed",
                location_name: "Provo",
                requested_for: placed.p_pickup_at,
                total: 2,
                lines: [
                  { item_id: 1, name: "Parent 1", qty: 1, unit_price: 2 },
                ],
              },
            ]
          : [];
      else if (name === "place_pickup_order") {
        placed = req.postDataJSON();
        result = { so_id: 1, so_number: "ORD-00001", total: 2 };
      }
      return route.fulfill({
        status: 200,
        json: result,
        headers: { "access-control-allow-origin": "*" },
      });
    });
    await page.goto(`${origin}/${role === "manager" ? "mrp" : "shop"}`);
    if (role === "customer") {
      await page.getByLabel(/^Username or email/).fill("test@example.invalid");
      await page.getByLabel(/^Password/).fill("test-only-password");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
    }
    if (role === "manager") {
      await page
        .getByRole("heading", { name: "Parent items and bills of material" })
        .waitFor();
      assert.equal(
        await page
          .getByRole("table", { name: "Parent bills of material" })
          .getByRole("row")
          .count(),
        6,
      );
      await page.getByRole("button", { name: "What drives this" }).click();
      assert.match(await page.getByRole("dialog").innerText(), /12/);
      await page
        .getByRole("button", { name: "Close", exact: true })
        .last()
        .click();
      await page.getByLabel("Include the forecast").check();
      assert.equal(
        await page
          .getByRole("button", { name: "Create POs for planned orders" })
          .isDisabled(),
        true,
      );
      await page.getByLabel("Include the forecast").uncheck();
      for (const theme of ["light", "dark"]) {
        if ((await page.locator("html").getAttribute("data-theme")) !== theme)
          await page
            .getByRole("button", { name: `Switch to ${theme} theme` })
            .click();
        assert.equal(
          await page.locator("html").getAttribute("data-theme"),
          theme,
        );
      }
    } else {
      await page
        .getByRole("button", { name: "Add Parent 1 to cart" })
        .waitFor();
      assert.match(
        await page
          .locator('ul[aria-label="Availability of Parent 1"]')
          .innerText(),
        /Provo[\s\S]*12 available[\s\S]*Orem[\s\S]*Sold out/,
      );
      await page
        .getByRole("combobox", { name: "Shop", exact: true })
        .selectOption("1");
      await page.getByRole("button", { name: "Add Parent 1 to cart" }).click();
      await page.getByRole("button", { name: "View cart" }).click();
      await page.getByText("12 available at Provo").waitFor();
      await page.getByLabel("Day", { exact: true }).selectOption({ index: 1 });
      for (const theme of ["light", "dark"]) {
        if ((await page.locator("html").getAttribute("data-theme")) !== theme)
          await page
            .getByRole("button", { name: `Switch to ${theme} theme` })
            .click();
        assert.equal(
          await page.locator("html").getAttribute("data-theme"),
          theme,
        );
      }
      await page
        .getByRole("button", { name: "Place pickup order", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "My orders", exact: true })
        .waitFor();
      assert.equal(placed.p_location_id, 1);
      assert.deepEqual(placed.p_lines, [{ item_id: 1, qty: 1 }]);
      await page.getByText("ORD-00001", { exact: true }).waitFor();
      await page.goto(`${origin}/shop`);
      await page.getByRole("button", { name: "Add Parent 1 to cart" }).click();
      failCatalog = true;
      await page.goto(`${origin}/shop/cart`);
      await page
        .getByText("Could not check pickup availability")
        .waitFor({ timeout: 20000 });
      assert.equal(
        await page
          .getByRole("button", { name: "Place pickup order", exact: true })
          .count(),
        0,
      );
      failCatalog = false;
      hideCatalog = true;
      await page.reload();
      await page.getByText("Some items are unavailable at this shop").waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "Place pickup order", exact: true })
          .isDisabled(),
        true,
      );
      await page
        .getByRole("button", { name: "Remove unavailable item 1" })
        .click();
      await page.getByText("Your cart is empty", { exact: true }).waitFor();
    }
    assert.deepEqual(errors, []);
    console.log(
      `${role}: both themes and ${role === "manager" ? "BOM/driver/forecast" : "stock locations/pickup/order confirmation/error handling"} passed`,
    );
    await context.close();
  }
} finally {
  await browser?.close();
  server.kill();
}
