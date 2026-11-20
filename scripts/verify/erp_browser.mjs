import { chromium } from "playwright";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// UI integration tests with a local mocked Supabase API. SQL suites separately
// verify real database authorization, netting and component consumption.
const root = fileURLToPath(new URL("../../", import.meta.url));
const testPort = process.env.ERP_BROWSER_PORT || "4174";
const origin = `http://127.0.0.1:${testPort}`;
const appBase = process.env.ERP_BROWSER_BASE_PATH || "/";
const appOrigin = `${origin}${appBase.replace(/\/$/, "")}`;
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    testPort,
    "--strictPort",
  ],
  {
    cwd: root,
    stdio: "ignore",
    env: {
      ...process.env,
      VITE_APP_BASE_PATH: appBase,
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
      throw new Error("Test Vite server exited; the selected test port must be free.");
    try {
      ready = (await fetch(appOrigin + "/")).ok;
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
    await page.goto(`${appOrigin}/${role === "manager" ? "mrp" : "shop"}`);
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
      await page.goto(`${appOrigin}/shop`);
      await page.getByRole("button", { name: "Add Parent 1 to cart" }).click();
      failCatalog = true;
      await page.goto(`${appOrigin}/shop/cart`);
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
  // A genuinely empty business can create its first shop without reopening owner setup.
  for (const role of ["owner", "admin", "manager"]) {
    for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await context.addInitScript(({ user, theme }) => {
        localStorage.setItem("glazed-auth-v1", JSON.stringify({ access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEifQ.test", refresh_token: "test", expires_at: Math.floor(Date.now()/1000)+3600, token_type: "bearer", user }));
        localStorage.setItem("glazed.location", "999");
        localStorage.setItem("glazed.theme", theme);
      }, { user, theme });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", e => errors.push(e.message));
      let rows = [];
      let saves = 0;
      await page.route("http://127.0.0.1:54321/**", async route => {
        const req = route.request();
        const name = new URL(req.url()).pathname.split("/").pop();
        let result = [];
        if (name === "profiles") result = { user_id: user.id, role, full_name: "Real owner", home_location_id: null, customer_id: null };
        else if (name === "user") result = user;
        else if (name === "locations") result = rows;
        else if (name === "app_settings") result = { id: 1, business_name: "Real business", default_tax_rate: .0725, ordering_cost_per_po: 45, holding_cost_rate_annual: .25, service_level_z: 1.65, usage_window_days: 90, review_period_days: 7, use_actual_lead_time: false, bake_buffer_pct: .08, day_old_markdown_pct: .5, score_w_ontime: .4, score_w_fill: .35, score_w_lead: .25, keep_threshold: 90, watch_threshold: 75, timezone: "America/Denver" };
        else if (name === "save_business_location") {
          const body = req.postDataJSON();
          assert.ok(role === "owner" || role === "admin");
          rows = [{ ...body.p_location, id: body.p_id ?? 10 }];
          saves++;
          result = 10;
        }
        return route.fulfill({ status: 200, json: result, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } });
      });
      await page.goto(`${appOrigin}/settings`);
      await page.getByRole("heading", { name: "Settings", exact: true }).waitFor();
      await page.getByText("Add a location to start trading", { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => localStorage.getItem("glazed.location")), null);
      if (role === "manager") {
        assert.equal(await page.getByRole("button", { name: "New location", exact: true }).count(), 0);
      } else {
        await page.getByRole("button", { name: "New location", exact: true }).click();
        const dialog = page.getByRole("dialog");
        await dialog.getByRole("button", { name: "Save location", exact: true }).click();
        await dialog.getByText("Enter a name up to 120 characters.").waitFor();
        assert.equal(saves, 0);
        await dialog.getByLabel(/^Code/).fill("REAL");
        await dialog.getByLabel(/^Name/).fill("Real shop");
        await dialog.getByLabel(/^Address/).fill("1 Real Street");
        await dialog.getByLabel("Opening time", { exact: true }).fill("06:00");
        await dialog.getByLabel("Closing time", { exact: true }).fill("18:00");
        await dialog.getByLabel("Sunday", { exact: true }).check();
        assert.equal(await page.locator("html").getAttribute("data-theme"), theme);
        await page.screenshot({ path: `/private/tmp/glazed-location-dialog-${role}-${theme}.png`, fullPage: true });
        await dialog.getByRole("button", { name: "Save location", exact: true }).click();
        await page.getByRole("button", { name: "Edit Real shop", exact: true }).waitFor();
        assert.equal(saves, 1);
        assert.equal(rows[0].tax_rate, .0725);
        assert.deepEqual(rows[0].closed_weekdays, [0]);
        assert.equal(await page.getByLabel("Location", { exact: true }).inputValue(), "10");
        assert.equal(await page.getByText("Add a location to start trading", { exact: true }).count(), 0);
        await page.getByRole("button", { name: "Edit Real shop", exact: true }).click();
        await dialog.getByLabel(/^Name/).fill("Renamed shop");
        await dialog.getByLabel("Active location", { exact: true }).uncheck();
        await dialog.getByRole("button", { name: "Save location", exact: true }).click();
        await page.getByRole("button", { name: "Edit Renamed shop", exact: true }).waitFor();
        await page.getByText("Add a location to start trading", { exact: true }).waitFor();
        assert.equal(rows[0].is_active, false);
        assert.equal(saves, 2);
        assert.equal(await page.getByLabel("Location", { exact: true }).count(), 0);
        await page.screenshot({ path: `/private/tmp/glazed-location-${role}-${theme}.png`, fullPage: true });
      }
      assert.deepEqual(errors, []);
      console.log(`${role} ${theme}: empty-business location setup and role visibility passed`);
      await context.close();
    }
  }
} finally {
  await browser?.close();
  server.kill();
}
