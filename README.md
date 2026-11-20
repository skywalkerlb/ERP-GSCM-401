# ERP Project (GSCM 401)

[**Open Glazed**](https://skywalkerlb.github.io/ERP-GSCM-401/) · [Publishing status](https://github.com/skywalkerlb/ERP-GSCM-401/actions/workflows/pages.yml)

> ## ⚠️ Every AI must read this first, whatever the tool (Claude Code, Codex, Cursor, Copilot, Gemini, ChatGPT…)
> 1. **Before editing anything**, read this file **and** `PROGRESS.md` from start to finish.
> 2. **After every edit**, update `PROGRESS.md` every time, and update this file whenever how the project works or the user's preferences have changed.
> 3. **When the user corrects something**, apply the correction to the **whole project**, not just the spot they pointed at (see §9.3).
> 3a. **Before any change, also read `design-system/DESIGN_SYSTEM.md`.** All UI/UX follows the Glazed design system unless the user explicitly says otherwise.
> 4. The full protocol is in [§9 AI Working Protocol](#9-ai-working-protocol). It is the only complete copy of the rules. The other instruction files just point here.

---

## 1. What this file is

This file says **how the project works** and **how the user wants it built**. It is not a log: edit sections in place so they always describe the project as it is now. History goes in `PROGRESS.md`.

| File | Holds | Style |
|---|---|---|
| `README.md` (this file) | What the project is, how it works, conventions, **user preferences**, AI protocol | Edited in place; always current |
| `PROGRESS.md` | Current status, in-flight work, next steps, open questions, last 10 changes | Snapshot plus a short changelog; under 300 lines |
| `design-system/DESIGN_SYSTEM.md` (+ component READMEs) | The Glazed design system: rules every UI change must follow | Changes only when the user asks for a design-system change |
| `docs/progress-archive/YYYY-MM.md` | Older changelog entries moved out of PROGRESS.md | Append-only; search it only when you need history |
| `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.cursor/rules/`, `.github/copilot-instructions.md` | Short pointers that send each AI tool here | Never duplicate content in them |

## 2. Project overview

- **What:** **Glazed**, a donut-shop ERP built for the GSCM 401 final project and live demo. The instructor chooses the scenario; displayed numbers come from stored data.
- **Design:** Every screen follows the Glazed design system in `design-system/` (see §7 and `design-system/DESIGN_SYSTEM.md`).
- **Repo:** https://github.com/skywalkerlb/ERP-GSCM-401 (public, branch `main`). Pulls and pushes have no project hook prerequisites. To disable Git hooks in a checkout, run `git config --local core.hooksPath /dev/null`.
- **Goal:** Provide working sales, production, inventory, purchasing, reporting and finance workflows, with three demo features: forecast-driven bake planning, freshness/waste tracking and one-click replenishment.
- **Users:** Owner, admin, manager, cashier, baker and customer roles, with isolated demo accounts. Owners/admins configure real shops and kitchens in Settings; the public demo uses Provo, Orem, Lehi and Lindon sample locations.
- **Business settings:** 7.25% starting sales tax, editable by location. The final due date has not been recorded.

## 3. Tech stack

| Layer | Choice | Why |
|---|---|---|
| UI | **React + TypeScript** | Typed feature modules and shared UI components. |
| Build/dev | **Vite** | Fast local development and static production output. |
| Styling | Glazed `tokens.css` + `components.css` | Shared design tokens and `gz-` component classes. |
| Icons/charts | `lucide-react`, Recharts | Icons and data-backed charts using design-system tokens. |
| Data / backend | **Supabase** (Postgres, Auth, Realtime) | Transactional RPCs, row-level security and live invalidation. |
| Frontend hosting | **GitHub Pages** | GitHub Actions builds and publishes every push to main. |

Chosen 2026-11-09. The intended persistent Supabase backend is now `wzsbtfzettxpczgulibd`, as explicitly confirmed by the user on 2026-11-17. This project previously hosted the demo. Its promotion preserved records initially; the user-authorized 2026-11-19 cleanup removed sample business records and seeded identities, retaining genuine accounts and completed owner setup. The former persistent project `eaphbcbklbcadokfcewc` was permanently deleted with user authorization on 2026-11-19; its ID remains in reset-protection guards. The separate disposable demo backend is `wnsimxaopjqwiajbiina`; public demo access is enabled and verified against isolated sample data. Both protected IDs are centralized in `supabase/functions/_shared/protected-projects.mjs`. See `PROGRESS.md` for rollout status.

## 4. Run / build / test

Install dependencies and start the frontend:

    npm install
    npm run dev

Available frontend checks:

    npm run build
    npm run typecheck
    npm run lint:design
    npm run test:browser

`test:browser` starts an isolated Vite server on port 4174 (override with `ERP_BROWSER_PORT`) and mocks Supabase for repeatable UI checks. It covers both themes, MRP BOM/drivers, customer sign-in, per-shop inventory, pickup checkout/order confirmation, failed availability and removed cart items. It uses system Chromium when available; otherwise run `npx playwright install chromium` first. Real database behavior is covered separately by the rollback SQL suites.

The browser app reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from the root `.env.local`. `VITE_DEMO_SUPABASE_URL`, `VITE_DEMO_SUPABASE_ANON_KEY` and `VITE_DEMO_PASSWORD` enable the demo selector against a separate sandbox project. Demo and real sessions use separate storage. Never point demo settings at the persistent backend. Copy `.env.example` as a starting point; do not commit `.env.local`.

**First-owner setup:** This installation serves one business. Deploy the `onboarding` Edge Function after applying `20261117000001_business_onboarding.sql`. Set server-only `APP_URL` to the canonical frontend URL and `OWNER_SETUP_CODE` to a cryptographically random private code of 16–256 characters. Never use a `VITE_` variable for this secret. Owner signup requires no verification email or SMTP setup: keep hosted Confirm email disabled (`mailer_autoconfirm=true`) so Auth immediately returns a session. The first owner opens `/create-business`, creates an email/password account (or signs into an existing email account), enters the private code and sets the business name and first location. Existing active locations are selected without overwriting data. Successful setup closes registration permanently, including after owner deletion. Share the code privately with the intended owner; do not put it in chat, logs or source control. Customer signup still requires no email verification. Admins and staff join through People email invitations, using email as their username and choosing their own password. Configure working Supabase SMTP and allow the canonical `/accept-invite` URL before sending invitations. The setup code is not an account recovery mechanism.

**Automatic publishing:** `.github/workflows/pages.yml` runs tests, builds with Node 24 and publishes `dist/` whenever main changes. Pages is enabled with **Source: GitHub Actions** (completed 2026-11-17); future pushes to main publish automatically. The workflow reads two required and three optional Actions secrets: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_DEMO_SUPABASE_URL`, `VITE_DEMO_SUPABASE_ANON_KEY`, `VITE_DEMO_PASSWORD` (all five configured; demo points only to the separate disposable backend). These are frontend/demo settings only; never add service-role keys or database passwords to the build. Failed builds leave the previous site published. The workflow sets the repository base path automatically; local development stays at `/`. A custom `404.html` loads the app for refreshed/deep links; those direct nested HTTP requests return 404 while the application renders normally.

The deterministic 210-day seed and database verification scripts live under `scripts/seed/`:

    cd scripts/seed
    npm install
    npm run simulate
    npm run seed
    npm run demo:prep
    npm run check

`npm run seed` resets business data before replaying history, so run it only against a confirmed disposable database; never reset the intended backend as part of routine deployment. Reset seeds enforce `DEMO_PROJECT_REF` and require a matching separate hosted demo connection. Database commands need `DATABASE_URL` or a linked Supabase project plus `SUPABASE_DB_PASSWORD` in `.env.local`. Demo-user creation also needs `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `DEMO_PASSWORD`. Keep credentials out of docs, source control and browser code.

## 5. Architecture & folder map

Update this map when a top-level folder is added, renamed or removed.

- `README.md`, `PROGRESS.md`: stable project guide, preferences and current handoff.
- `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.claude/`, `.codex/`, `.cursor/`, `.github/`: pointers and hooks for AI tools.
- `design-system/`: Glazed tokens, components and UI guidance.
- `docs/ARCHITECTURE.md`: approved ERP build contract.
- `public/`: static frontend assets.
- `src/app/`: routes, authentication, app shell and access rules.
- `src/components/`, `src/hooks/`, `src/lib/`: shared UI and application helpers.
- `src/features/`: dashboard, selling, stock, buying, production, reporting and settings modules.
- `src/styles/`, `src/types/`: global styles and domain types.
- `supabase/migrations/`, `supabase/functions/`, `supabase/bootstrap-owner.sql`, `supabase/CONTRACT.md`: database schema, RPCs, RLS and reporting contract.
- `scripts/ai-guard/`, `scripts/seed/`, `scripts/demo/`, `scripts/verify/`: shared AI guard, deterministic demo-data simulation and database checks.
- `scripts/check-design.sh`: design-system lint for app code.
- `.github/workflows/pages.yml`: automatic public frontend build and deployment on pushes to main.
- `.ai-state/`: ignored per-session state used by the AI edit guard.
- `.githooks/pre-commit`: optional advisory design lint and PROGRESS reminder; always allows commits.
- `docs/progress-archive/`: older changelog entries moved out of PROGRESS.md.

## 6. ERP domain model

**Staff modules:** POS, sales and orders, returns, demand forecast and bake plan, production, freshness and waste, inventory and transfers, adjustments, receiving, labels, purchasing and auto-replenish, supplier scorecard, MRP, dashboard, reports, finance, items/BOM, customers and settings. The customer portal is at `/shop` in the app, under `/ERP-GSCM-401/` on GitHub Pages.

**Material requirements planning:** `/mrp` shows four weekly buckets from today using outstanding quantities on confirmed (`placed`) sales orders. Single-level recipe/kit quantities produce component requirements; company-wide stock and unreceived, uncancelled quantities on sent POs offset them in expected-date order. A receipt later in a week cannot hide an earlier shortage. Suggestions round up to supplier packs; the order-by date is the first shortage date minus the component item's lead time in calendar days. Projected stock carries forward. The page also lists each active parent BOM, quantities per unit and component lead times, with a warning below five parents; the seed catalog supplies nine parents. Manage recipes and lead times in Items. Production consumes components when a batch starts; kit checkout/fulfillment consumes its BOM directly. Finished donuts sell from the stock created by production, avoiding double consumption. Missing recipes block production starts and kit sales. Forecast is optional; creating POs requires confirmed-demand mode. The plan refreshes after stock, order, recipe and forecast events.

MRP checks after installing root and `scripts/seed` dependencies:

    scripts/seed/node_modules/.bin/tsx --test scripts/verify/mrp.test.ts
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/verify/mrp_planning.sql
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/verify/bom_consumption.sql

Run the SQL suites against a migrated disposable test database; their fixtures and postings roll back. The three MRP/customer migrations `20261116000101..103` follow username migration `20261116000001`; the user confirmed applying them successfully to the former persistent backend; promotion also applies them to the selected real backend. New installations apply all migrations in order. No reset or replay is needed.

**Locations and roles:** Owner/admin location settings create and edit shops/kitchens, hours, closed weekdays and active status. Deactivation retains history; staff assignment stays in People. The app uses owner, admin, manager, cashier, baker and customer roles. Owner, admin and manager manage accounts below their own level across all shops. Only the owner grants admin; admins grant manager/cashier/baker/customer; managers grant cashier/baker/customer. Self-changes and changes to peers or superiors are forbidden. Starting sales tax is 7.25% and can be edited by location.


Shop units and formats follow the design system: quantities in dozens/trays ("14 dozen"), money as "$342.75", dates as "Nov 9, 2026", pickup times as "9:00 AM", and order numbers like ORD-00481 in mono.

The approved schema, RPCs, reporting views, seed model and security decisions are documented in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [supabase/CONTRACT.md](supabase/CONTRACT.md). Inventory uses a transaction ledger and weighted-average cost; business actions go through transactional RPCs; accounting uses a double-entry GL-lite journal; forecast, reorder, supplier and production reporting are database-backed.

**Customer-facing ERP:** customers create accounts at `/shop/signup` and sign in at `/shop/login`. The `/shop` catalog shows available quantities separately for each active shop, using fresh stock after confirmed-order reservations, including components shared by kits. Customers choose their pickup shop (with address), day and time in the cart, then track or cancel their own orders in My orders. Checkout preserves the cart on availability failures and blocks missing/deactivated items instead of silently dropping them. The server validates active pickup locations, Denver opening hours/closed days, future dates within 60 days and at most 500 units per item across duplicate lines. Future orders may exceed today's stock and become confirmed demand for MRP; estimates do not guarantee availability of an entire larger order. Inventory moves only on fulfillment. Customers cannot see staff costs or another customer's orders. Run `scripts/verify/customer_portal.sql` with the same rollback-test command above to verify signup roles, inventory locations, allocations, pickup validation, ownership and MRP integration.

## 7. Conventions

**UI: the Glazed design system is mandatory** (unless the user explicitly says otherwise for a specific change; see §8.1).
- Load `design-system/tokens.css` and then `design-system/components/components.css` once at the app root. Set `data-theme="light"` or `"dark"` on `<html>`.
- Every color, space, radius, shadow, font and size is a `var(--token)`. No raw hex, rgb or px values (0–2px hairlines and focus rings are allowed). `scripts/check-design.sh` enforces this.
- Build UI from the Glazed components. Read `design-system/components/<Name>/README.md` before using or changing a component.
- Page anatomy, status colors, voice, accessibility and number formats follow `design-system/DESIGN_SYSTEM.md`.

**General:** keep shared values in one place (tokens, components, labels and formulas) so a user preference can be changed once and apply everywhere. Each `src/features/<area>/` folder owns its routes, queries, UI and styles. Shared controls belong in `src/components/`, backend helpers in `src/lib/`, and cross-cutting behavior in `src/hooks/`. Database changes belong in ordered Supabase migrations and must keep `supabase/CONTRACT.md` current.

## 8. User Preferences & Design Rules

> **Curated, not append-only.** This is the most important section for serving the user well.
> - Bullet format: `- **Rule** (imperative). Scope: <where it applies>. Source: YYYY-MM-DD, "<user's words if useful>".`
> - When the user changes their mind, **rewrite the existing bullet** and add `(replaces: …)`. Never leave two rules that contradict each other.
> - Merge duplicates. Keep the section at about 60 bullets or fewer.
> - Before building anything, re-read the rules whose scope covers it.

### 8.1 Visual design / UI
- **Keep sidebar labels readable without overlap.** Navigation groups must scroll rather than compress on short windows, and long labels must wrap inside their own rows. Scope: shared staff sidebar, desktop and mobile drawer, both themes. Source: 2026-11-11, "the side bar overlaps with that text".
- **Every UI/UX change uses the Glazed design system** (`design-system/`). Follow it unless the user explicitly says otherwise for that specific change. Scope: all screens, components, styles, charts, emails. Source: 2026-11-09, "all edits should follow the design system unless specifically specified otherwise".
- **Read `design-system/DESIGN_SYSTEM.md` before making any change, and keep it in mind** so design updates stay consistent. Scope: every agent, every session. Source: 2026-11-09.
- **Tokens only, Glazed components only, both themes, one candy-pink primary button per view (chocolate text), fixed status colors (mint/lilac/butter/cherry/cocoa/neutral), sentence case, no emoji or exclamation marks.** The full list is in DESIGN_SYSTEM.md > Rules for AI agents. Scope: all UI. Source: 2026-11-09 (design system).
- **Design changes go through the system.** When the user changes a look, update the token or shared component so it applies everywhere. A one-off happens only when the user explicitly asks for one. Scope: all design corrections. Source: 2026-11-09.
- **The official logo is the design system's "Glazed" wordmark (Fredoka 600) with the pink donut ring mark.** Use it everywhere the brand appears (sidebar, login, favicon, exports), and don't replace or restyle it without asking. The sidebar wordmark reads "Glazed!" by explicit request on 2026-11-10; this punctuation exception applies only to the sidebar. Scope: all branding. Source: 2026-11-09, "that logo in the design system is great".

**Design exceptions** (approved one-offs that break the design system; each is also marked `ds-exception:` in code):
| Date | File / place | What | User's words |
|---|---|---|---|
| 2026-11-16 | Barcode Labels page title/breadcrumb, sidebar and item editor hint | Capitalize Labels in this page name instead of sentence case; marked `ds-exception:` in source. | "on the barcode labels page, can you capitalize the L on labels" |
| 2026-11-10 | `src/app/AppShell.tsx`, sidebar wordmark | Display "Glazed!" despite the general no-exclamation rule | "add an exclamation point after glazed in the title in the sidebar" |

- **Show sign-in, public customer signup, and a demo role selector at the bottom of login.** Require only a username and password for customer signup, sign users in immediately, and never require email verification (replaces email-confirmed signup). Preserve existing email logins. Use the protected access hierarchy: owner grants admin/manager/cashier/baker/customer, admin grants manager/cashier/baker/customer, manager grants cashier/baker/customer. Actors may manage only lower-level accounts across all shops and cannot change themselves (replaces owner-only staff management). Anyone must be able to select a role and enter the demo without typing credentials or registering. Demo workflows use isolated sample data and simulated invitations; never imply missing configuration is being prepared automatically. Scope: authentication, permissions and demo. Source: 2026-11-16, "make it simple to create a username and password, dont use email verification"; access hierarchy approved 2026-11-12.

### 8.2 Wording & content
- **Write the page name as "Barcode Labels".** Scope: this page's heading, browser title, breadcrumb, sidebar entry and references elsewhere in the app; exception to sentence case for this page name only. Source: 2026-11-16, "on the barcode labels page, can you capitalize the L on labels".

### 8.3 Code & architecture
- **Host the public frontend on GitHub Pages and publish every push to main automatically.** Put a clickable live-site link prominently in the GitHub README. Keep Supabase for authentication/data; repository-path links and Auth redirects must work (replaces Vercel hosting). Scope: frontend hosting, publishing and related URLs. Source: 2026-11-16, "the front end is hosted on github instead of vercel ... when i push to github anyone can view it".
- **Keep shared values centralized** (tokens, constants, components) so a single change applies project-wide. Scope: all code. Source: 2026-11-09, the user wants changes "implemented across the whole project".

### 8.4 Workflow / process
- **Finish feature work and validation before publishing the requested release.** Exclude unfinished concurrent work. Scope: deployment after a task. Source: 2026-11-19, "until you are done with your previous task then deploy".
- **Allow GitHub pulls and fetches without project hook prerequisites or changelog reminders.** Synchronizing upstream history alone is not an authored edit; commands that also edit files and manual conflict resolutions still follow the normal checks. Sandbox permissions and Git conflict protection still apply. Scope: all AI tool hooks. Source: 2026-11-16, "make sure pulling from github is not blocked by any hooks".
- **Every AI reads README.md and PROGRESS.md before editing, and updates them after every edit.** Scope: every session, every tool. Source: 2026-11-09.
- **Treat a correction as a project-wide rule, not a one-off fix.** When the user asks to change something an AI just made, apply it everywhere it's relevant and record it here. Scope: all corrections (design, wording, code). Source: 2026-11-09.
- **The user works with several AI tools** (Claude Code, Codex, Cursor, Copilot, Gemini). Keep the docs tool-neutral. Scope: all docs. Source: 2026-11-09.
- **Plan first, ask clarifying questions, and use subagents for larger tasks** when the tool supports it. Scope: non-trivial work. Source: 2026-11-09, the user asked for plan mode, fan-out subagents, and questions.

- **The read-first / update-after rules must be enforced, not just suggested,** for every AI tool. Keep the AI edit hooks in §9.5 working. Git synchronization is exempt: pulls and pushes must not require documentation reads or updates, and Git checks are advisory. Scope: all tools, all sessions. Source: 2026-11-16, user requested unblocked GitHub pulls/pushes (replaces mandatory blocking Git checks); original read/update preference from 2026-11-09.

- **Use Chris Shipp as the commit author and his GitHub noreply address** (`276119029+chrisshipp19-web@users.noreply.github.com`) for commits made for Chris. Verify identity against the connected account rather than copying another contributor's identity from history; never expose personal or work email. Scope: all commits for Chris (replaces: incorrectly identifying Chris as Mason Briggs). Source: 2026-11-11, "no i am Chris Shipp".

### 8.5 ERP / domain
- **Start the permanent business without sample master data or transactions, preserving genuine accounts and completed owner setup.** Keep sample data only in the separate public demo. Owner/admin location settings must support real shop setup. One-time reviewed cleanup is authorized; routine demo/reset guards remain enforced. Source: 2026-11-19, approved clean-business plan.
- **Provide one-time business creation from sign-in, protected by a private backend setup code.** The creator becomes owner, enters business and first-location details, then invites admins/staff by email. Owner email/password registration must sign in immediately without email verification or SMTP configuration; keep hosted Confirm email disabled. Email is the username for these accounts; admins cannot self-register privileged access. Keep legacy customer username signup and isolated demos. Scope: owner onboarding and staff access. Source: 2026-11-17, approved onboarding plan and choices; reaffirmed 2026-11-18, "disable email verification ... dont want to set that up at this time".
- **Use Supabase project `wzsbtfzettxpczgulibd` as the real persistent backend.** Never use it for public demo access, reset/replay seeds or demo preparation. Former backend `eaphbcbklbcadokfcewc` was permanently retired/deleted with explicit authorization on 2026-11-19; keep its ID in reset-protection guards (replaces: retain paused former backend). Public demo uses only separate disposable project `wnsimxaopjqwiajbiina`. Scope: frontend/build secrets, Supabase link, functions, seeds, tests and deployment docs. Source: 2026-11-17, "yes, make that the real backend"; 2026-11-19, approved retirement plan and "Implement the plan.".

---

## 9. AI Working Protocol

### 9.1 Before you edit
1. Read `README.md`, `PROGRESS.md` and `design-system/DESIGN_SYSTEM.md`, all of each. For UI work, also read `design-system/components/<Name>/README.md` for every component you'll use, and look at the reference PNGs.
2. Check **In-flight Work** and **Open Questions** in PROGRESS.md. If your task conflicts with in-flight work, ask the user.
3. Re-read the §8 preference rules that apply to what you're about to build.

### 9.2 After every edit (before you finish your turn)
1. **Add a changelog entry** at the top of *Recent Changes* in `PROGRESS.md`, using the template there. Every field is required; write "None" or "N/A" when one doesn't apply.
2. **Rewrite** PROGRESS.md's *Current Status*, *In-flight Work*, *Next Steps*, and *Open Questions* so they're accurate. These are snapshots, not logs.
3. **Update README.md** when anything here changed: stack, commands, folder map, domain model, conventions, or **preferences (§8)**.
4. **Size limits for PROGRESS.md:** at most 10 changelog entries and 300 lines. When a new entry would make 11, move the oldest entry, unchanged, to `docs/progress-archive/YYYY-MM.md` (using the month of that entry) and list the file in the Archive index. Keep each entry to about 15 lines.
5. If you created or removed a top-level folder or a doc file, update the §5 folder map.

### 9.3 When the user corrects you (design, wording, structure, behavior)
1. **Generalize.** Turn the specific request into a rule with a scope. For example, "make this button blue" becomes "Primary buttons use the brand blue token. Scope: all primary actions."
2. **Record.** Add the rule to §8, or rewrite an existing one. If it's unclear whether the correction applies everywhere or just once, **ask the user once**.
3. **Sweep.** Search the whole project for every other instance: the literal value, similar components, and repeated wording. Fix them all.
4. **Centralize.** Where possible, move the rule into a shared token, style, component, or helper so future code follows it automatically. **For design corrections**, the default is to change the Glazed token (`tokens.json` + `tokens.css`) or the shared component so the whole app changes. If the user explicitly wants it in just one place, mark that line `ds-exception: <reason>` and add a row to §8.1 Design exceptions.
5. **Log.** In the changelog entry, fill in **Preferences learned** and **Correction sweep** (what you searched for and how many places you fixed). Put anything you couldn't finish in Next Steps.
6. **Don't repeat it.** The next time you build something similar, the rule in §8 applies from the start.

### 9.4 General
- Don't put secrets (keys, passwords) in any doc.
- Write dates as `YYYY-MM-DD`.
- Say which AI tool you are in each changelog heading so the user can trace work across tools.

### 9.5 How the rules are enforced (don't remove or weaken these without the user's permission)
All hooks call one shared script, `scripts/ai-guard/guard.sh`, so the behavior is the same in every tool. Plain `git pull` and `git fetch` are synchronization operations: they neither require the read-before-edit check nor create a progress reminder. Additional writes in the same shell command remain guarded; existing reminders from authored edits remain pending.

| Check | What happens |
|---|---|
| **Read before edit** | Any authored file edit, or any shell command classified as an edit (excluding pull/fetch synchronization), is **blocked** until this session has read README.md, PROGRESS.md **and design-system/DESIGN_SYSTEM.md**. If another agent changes any of them afterward, you're blocked again until you re-read it. |
| **Update after edit** | If project files changed and PROGRESS.md wasn't updated, the agent is **sent back once** when it tries to finish (it can't loop). |
| **Design checklist** | If UI files changed (`.css/.scss/.tsx/.jsx/.html`, `src/`, `design-system/`), the agent is also sent back once with the design-system checklist. |
| **Git checks** | Optional `.githooks/pre-commit` prints design and PROGRESS advisories and always exits successfully. Pull/push operations are exempt from the AI read-before-edit gate. This checkout retains `core.hooksPath=.githooks` for advisory checks; new clones have no active project hooks by default. Authentication, write permission and normal Git conflict handling still apply. |

| Tool | Hook file | Read-before-edit block | Update + design reminders | Advisory Git checks (optional) |
|---|---|---|---|---|
| Claude Code | `.claude/settings.json` | ✅ | ✅ | Optional |
| Codex | `.codex/hooks.json` | ✅ | ✅ | Optional |
| Cursor | `.cursor/hooks.json` | ✅ | ✅ | Optional |
| Copilot (VS Code) | `.github/hooks/ai-guard.json` | ✅ (preview feature) | ✅ | Optional |
| Gemini Code Assist | none (no hook support) | instructions only | instructions only | Optional |

**Setup notes:**
- Codex and Claude Code ask you to **trust/approve project hooks** the first time; use `/hooks` in each to review and approve them.
- Hooks need `jq` (`/usr/bin/jq` on macOS). If it's missing they let everything through rather than blocking the project.
- Git hooks are optional. Use `git config --local core.hooksPath /dev/null` to disable all local Git hooks, or `.githooks` for advisory commit reminders.
- Do not add blocking project checks to commits, pulls or pushes. Run `npm run lint:design` explicitly for UI work.

## 10. Access setup

Persistent Supabase rollout completed 2026-11-16: all ordered migrations applied with CLI-compatible history, People deployed with `DEMO_MODE=false`, and public username signup/immediate login verified. The GitHub Pages frontend is at `https://skywalkerlb.github.io/ERP-GSCM-401/`; GitHub Pages was enabled and the first deployment succeeded on 2026-11-17. Owner setup uses the one-time private-code flow described in §4; do not assign a seeded demo owner to the real business.

Apply migrations in order, then deploy the `people` Supabase Edge Function. Set its `APP_URL` to the full GitHub Pages URL, including `/ERP-GSCM-401/`; allow exact URLs below that prefix for `login`, `update-password` and `accept-invite` in Supabase Auth. CORS uses the origin `https://skywalkerlb.github.io`. Use `/create-business` with the private setup code for first-owner registration. `supabase/bootstrap-owner.sql` remains a trusted administrative fallback and obeys the same permanent claim guard. Public signup requires only a case-insensitive username (3–30 letters, digits or underscores) and password (at least 6 characters), creates customer access and signs in immediately. Disable Confirm email in hosted Supabase Auth and keep local `auth.email.enable_confirmations=false`. Username identities use the reserved internal `users.glazed.invalid` domain; this is not a contact address. No signup email is sent. Existing email accounts retain email login and recovery. Configure custom SMTP (or an existing Send Email hook) only for legacy email recovery and staff email invitations: [Supabase’s default sender is restricted to organization members](https://supabase.com/docs/guides/auth/auth-smtp). Set the hosted Site URL and exact login/password-update/invitation redirects under the full GitHub Pages base URL; do not push local Auth defaults to hosting. Local Mailpit captures messages for development. Owners, admins and managers use People to invite staff or change lower-level accounts under the protected hierarchy. All access assignments are checked atomically against the actor and target, and audited. People also resets lower-level username passwords after verifying the account holder; reset authorization attempts are audited separately from the Auth update, with no passwords stored in audit. Owner username recovery requires trusted backend administration. Open sessions refresh access on own-profile realtime events, focus and every 30 seconds while visible, clear restricted cached data, and fail closed on profile errors. Privileged keys belong only in server secrets.

The former demo project is now the real backend. The new disposable demo project is `wnsimxaopjqwiajbiina`; public entry is enabled for all six roles without typing credentials. For a new separate disposable demo project, apply the same migrations and configure `DEMO_MODE=true` on its People function. Use `node --env-file=.env.local scripts/demo/setup.mjs` from the repository root with `DEMO_PROJECT_REF`, `DEMO_DATABASE_URL`, `DEMO_SUPABASE_SERVICE_ROLE_KEY` and `DEMO_PASSWORD` in the process environment to populate and reset sample data and role accounts. The scripts refuse both protected persistent project IDs, including demo-prep mutations. Owner, admin and manager demo access changes follow the same hierarchy and are simulated locally; no invitation emails are sent.

Access tests: `node --test scripts/verify/*.test.mjs` and `scripts/seed/node_modules/.bin/tsx --test scripts/verify/access.test.ts`. The database runner `node scripts/verify/run.mjs --skip-data` includes rollback-only access security checks after applying migrations; `scripts/verify/access_security.sql` can also run directly. These tests cover API authorization, frontend access and reset guards; connected username signup/login, legacy email recovery and browser checks are still required before release.

Public frontend: [Open Glazed](https://skywalkerlb.github.io/ERP-GSCM-401/). Visitors can open the login page and enter isolated demos without a hosting login; real ERP access still requires Glazed authentication. All six demo roles sign in automatically. The full history replay takes about 30 minutes over a stable remote connection (longer after reconnects); never run simultaneous reset seeds.

**Clean business administration:** `scripts/admin/clean-business.mjs` and its SQL are a one-time reviewed cleanup for the selected permanent project, not a routine reset. Default execution rehearses against the isolated local restore on port 55439 and rolls back. `--apply` requires matching full-table fingerprints from that restored backup and locks Auth signups/business tables during cleanup. Never run without a current private backup. Backup and manifests are in ignored `.env.cleanup-backups/`; keep them private and retain until the clean start is accepted. Existing document counters/security audit history remain; sample business records and identities are removed. Start with Settings → Locations, then suppliers, items/recipes and opening balances. Completed owner setup remains closed.
