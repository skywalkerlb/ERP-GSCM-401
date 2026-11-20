# PROGRESS.md: ERP Project (GSCM 401)

> **Read this file, `README.md` and `design-system/DESIGN_SYSTEM.md` before any edit. Update this file after every edit.** Full rules: README.md §9.
> **Size rules:** no more than 10 entries in Recent Changes and 300 lines. Status sections are snapshots.

## Current Status
**As of 2026-11-19.** Permanent backend `wzsbtfzettxpczgulibd` is clean: sample business history, stock, catalog, suppliers, recipes, promotions and locations removed. Three genuine Auth accounts/passwords, profiles and linked customer identities preserved, including owner/admin. Eight seeded Auth identities deleted; completed owner setup remains closed. Business name retained.
- Local `main` is synchronized with GitHub `origin/main` at `68524f2`. The two previous local commits are preserved on `pre-github-sync-20261119`; they are not included in the synchronized branch.
- Owner/admin location settings and startup guidance deployed; migration applied to permanent and separate demo backends. Public demo keeps all sample records (5,416 sales, 36 items); every public-table fingerprint matched before/after cleanup.
- Private backup in ignored `.env.cleanup-backups/` was restored locally and cleanup rehearsed with rollback. Live UTC-normalized fingerprints matched before deletion; business writes/Auth signup blocked by transaction locks. Security history and document counters retained.
- All 377 JavaScript/TypeScript checks, production build, design lint and both-theme browser checks pass. Location RPC local authorization/create/edit/deactivation checks passed; genuine password hashes match backup; live owner setup remains closed.
- Public demo is live on Pages with all 26 migrations and demo-mode functions. Six-role entry/refresh/exit, retry/re-entry, concurrent visitors, and both themes passed; all 81 published JS assets use intended backends and exclude the demo service key. Final Pages run `44643203905` succeeded (`ed727f2`).
- Former backend remains paused and protected. SMTP for staff invitations is deferred. No new design exceptions.
- Supabase CLI v3.2.0 is compatible with the local config. All 26 local migrations match production; `people` and `onboarding` were redeployed to `wzsbtfzettxpczgulibd`.

## In-flight Work
- Review the two older Supabase CLI setup commits on `pre-github-sync-20261119` before deciding whether any setup changes should be reapplied to current GitHub main.

## Next Steps
1. Review the preserved local Supabase CLI setup commits against current main before cherry-picking anything.
2. Real-business owner/admin: Settings → Locations → New location; enter real shop address/hours and review tax rates.
3. Add suppliers, ingredients/products, recipes and opening stock/accounting balances; assign staff locations in People.
4. Configure SMTP before inviting staff. Retain private backup until clean start is accepted. Forecasts and usage-based purchasing metrics need real history.

## Open Questions for the User
- Project due date remains unspecified.

## Recent Changes
### 2026-11-19: Update Supabase CLI configuration compatibility (Codex)
- **What:** Updated the CLI config for v3.2.0, confirmed all 26 migrations already match production, and redeployed `people` and `onboarding`.
- **Why:** The user asked to deploy to Supabase and GitHub.
- **How:** Replaced the obsolete `inbucket` section with `local_smtp`; migration status showed no pending schema changes. Deployed both current functions to `wzsbtfzettxpczgulibd` with the CLI.
- **Files:** `supabase/config.toml`, Supabase functions, `PROGRESS.md`, `docs/progress-archive/2026-11.md`
- **Preferences learned:** None
- **Correction sweep:** N/A
- **Rework:** None
- **Follow-ups:** Review the preserved older CLI setup commits before reapplying any of their changes to current main.

### 2026-11-19: Synchronize local main with GitHub (Codex)
- **What:** Updated local `main` to GitHub's latest `main` at `8adfa19`.
- **Why:** The user asked to pull all changes from GitHub.
- **How:** Fetched the remote, preserved the two local commits on `pre-github-sync-20261119`, then synchronized `main` to `origin/main` without merging the older divergent snapshot.
- **Files:** `PROGRESS.md`, `docs/progress-archive/2026-11.md`
- **Preferences learned:** None
- **Correction sweep:** N/A
- **Rework:** None
- **Follow-ups:** Review the preserved local setup commits before reapplying any changes to current main.

### 2026-11-19: Prepare real-business location setup (Codex)
- **What:** Added owner/admin location create/edit dialog, active-location selection and empty-business guidance; About distinguishes real records from demo history.
- **Why:** A clean business needs a way to create real shops without reopening owner registration.
- **How:** Glazed components/tokens, save_business_location RPC, preserved inactive history and cleared stale stored location IDs. Typecheck, design lint, production build, 364 JavaScript checks and both-theme browser regressions pass.
- **Files:** Settings location UI, location provider, app shell, About and PROGRESS.
- **Preferences learned:** Empty permanent business; preserve genuine accounts and public demo.
- **Correction sweep:** N/A.
- **Rework:** None.
- **Design review:** Final design lint passed. Reviewed Glazed component props, light/dark screenshots, one primary action per view/dialog, semantic status tones, sentence-case voice, field labels, shared focus rings, dialog focus trap/return and close-button aria-label. No new deviations. Existing README §8.1 exceptions retained: Barcode Labels capitalization and sidebar Glazed! punctuation.
- **Follow-ups:** Backend/UI integrated; both themes visually reviewed and browser tested. No design exceptions.
### 2026-11-19: Clean permanent business database (Codex)
- **What:** Removed all reviewed sample business records and eight seeded Auth identities; preserved three genuine accounts/passwords, profiles/customer links, business name and permanent owner claim.
- **Why:** Start a real business with an empty catalog, shops, stock and history; keep public demo populated.
- **How:** Restored private PostgreSQL backup locally; rehearsed exact cleanup/rollback; matched all table fingerprints under exclusive write/signup locks before atomic cleanup. Verified all removed-data tables empty, genuine passwords identical, owner registration closed and public demo unchanged.
- **Files:** scripts/admin cleanup runner/SQL, location migration/UI, README, CONTRACT, PROGRESS; private ignored backup/manifests.
- **Preferences learned:** Empty business, preserve real access, owner/admin location settings; sample data only in public demo.
- **Correction sweep:** Removed misleading simulated-data claims from real About and clarified empty portal menu.
- **Rework:** Merged concurrent public-demo deployment without losing its seed fix; installed PostgreSQL tools; local restore reported only pre-existing public schema. Initial live fingerprint guard rolled back safely because timezones serialized timestamps differently; normalized comparisons to UTC, rehearsed and succeeded.
- **Follow-ups:** Owner enters real locations/master data/opening balances; configure SMTP. Live catalog and report views verified empty; final startup copy/UTC fingerprint fix published with this handoff. No new design exceptions.
### 2026-11-19: Restore separate public demo backend (Codex)
- **What:** Created and populated separate disposable demo `wnsimxaopjqwiajbiina`; configured all role accounts, migrations, Edge Functions, Auth and Actions secrets.
- **Why:** Visitors need credential-free demo access using isolated sample data.
- **How:** Paused unused former backend with authorization, retaining data and both persistent-project guards. Completed 210-day replay with no failed events and reconciled inventory/accounting. All 377 JS/TS tests, build/typechecks, design lint, both-theme browser regressions, five rollback SQL suites and public six-role/session/retry checks pass. Pages run `44642873404` succeeded; final documentation deployment `44643203905` published `ed727f2` successfully; 81 published JS assets use intended backends and exclude the demo service key. Applied the integrated location migration to demo (26 total).
- **Files:** scripts/seed/run.ts, README.md, supabase/CONTRACT.md, PROGRESS.md and archive; hosted configuration and ignored local settings.
- **Preferences learned:** Pause unused former backend to free the demo slot; finish task validation before deployment.
- **Correction sweep:** Recorded deployment sequencing in README §8.4; used an isolated checkout, then integrated the validated/published location release without dropping either change. Existing automatic main publishing remains intact.
- **Rework:** Fixed fresh Auth-created customer collision by linking seeded customer/profile atomically without deleting records. Verified the actual seed function on fresh and repeated execution. Installed declared browser dependencies and used system Chrome.
- **Follow-ups:** Demo activation complete; automatic reset scheduling remains out of scope. No new UI changes or design exceptions in demo restoration.

### 2026-11-18: Verify owner signup without email confirmation (Codex)
- **What:** Re-saved disabled hosted email confirmation on real project `wzsbtfzettxpczgulibd` and verified immediate signup.
- **Why:** User is creating the owner account and explicitly does not want email-verification setup now.
- **How:** Public settings already showed confirmation disabled; enforced mailer_autoconfirm=true through management API. Temporary public email/password signup returned an immediate session with auto-confirmed Auth email and ordinary customer role; fixture account/customer removed. No pending unconfirmed password accounts, no owner claim, no email sent. Owner setup remains available.
- **Files:** README.md, supabase/CONTRACT.md, PROGRESS.md and progress archive; hosted Auth configuration.
- **Preferences learned:** Owner signup requires no verification email or SMTP prerequisite (README §8.5).
- **Correction sweep:** Checked local Auth config, owner signup, endpoint and database Auth checks, hosted settings and current docs. Auth auto-confirm satisfies existing server checks; no code/migration change needed.
- **Rework:** None. No UI changes or design exceptions.
- **Follow-ups:** User refreshes owner setup and retries; obtain exact error if it persists. No frontend deployment is required for this hosted setting. SMTP deferred; separate demo remains capacity-blocked.

### 2026-11-17: Promote selected Supabase project to real backend (Codex)
- **What:** Promoted `wzsbtfzettxpczgulibd`, disabled seeded public identities and demo entry, deployed missing migrations/functions and updated local/GitHub configuration.
- **Why:** User explicitly corrected the project ID and confirmed it must be the real backend.
- **How:** Preserved business records; banned eight seeded identities, randomized passwords and revoked sessions/access. Applied six pending migrations including the integrated upstream MRP/customer-pickup release, set APP_URL/DEMO_MODE/private setup code, deployed People/onboarding and configured Auth. 377 combined tests, build/typechecks and design lint pass; live rollback SQL suites and setup availability pass. No real owner claim or email sent.
- **Files:** Shared protected-project helper, browser backend selection, demo/seed scripts/tests, README, CONTRACT, PROGRESS/archive; ignored local env and hosted configuration.
- **Preferences learned:** Selected project is real; former backend remains protected (README §8.5).
- **Correction sweep:** Swept all active project-ID references, frontend/build secrets, CLI link, reset/seed/prep guards, backend account access and current docs. Historical logs retained.
- **Rework:** Decoded existing CLI keychain format for management API login. Preserved concurrent MRP/customer-pickup changes. Fixed initial Pages verification failure by installing seed test dependencies in CI. No new design exceptions; approved Barcode Labels/Glazed! exceptions retained.
- **Follow-ups:** Pages run `44139328298` succeeded and live bundle checks pass. Owner completes setup using private code; configure SMTP. Demo requires a separate disposable project.

### 2026-11-17: Publish and verify MRP/customer pickup on Pages (Codex)
- **What:** Merged PR #1 and published the integrated MRP/customer frontend at the public GitHub Pages URL.
- **Why:** Complete the user-authorized deployment after their Supabase migration/function rollout and Pages activation.
- **How:** Pages run `44136673348` built source `b5d0c30` and deployed successfully. 367 local TS/Node tests, prefixed build/typecheck/design lint and both-theme browser regressions pass. Live demo sign-ins work: Manager MRP shows nine loaded BOM parents; Customer shop shows 13 items and per-shop availability, without JS page errors. People CORS permits Pages. Live browser used a proxy-certificate test override; shell HTTPS checks retained verification. No orders, owner claims or data resets.
- **Files:** Published PR #1 source; PROGRESS.md and progress archive record final verification. No new UI edits in this handoff.
- **Preferences learned:** None.
- **Correction sweep:** N/A.
- **Rework:** Preserved concurrent Pages, username and first-owner source changes while resolving progress history conflicts.
- **Follow-ups:** Separate first-owner backend/private-code setup and persistent master data remain; existing demo history limitations preserved. No new design exceptions.

### 2026-11-17: Integrate MRP/customer pickup with GitHub Pages (Codex)
- **What:** Combined PR #1 with the live Pages hosting changes, preserved username signup and added repository-prefix browser regression coverage.
- **Why:** Finish the authorized frontend deployment after the user enabled GitHub Pages and successfully applied MRP migrations/deployed People from PowerShell.
- **How:** Confirmed Pages root HTTP 200 and successful prior Actions runs; integrated main without dropping sidebar/Barcode Labels exceptions or URL-prefix support. Combined 367 TS/Node tests, both-theme prefixed browser flows, typecheck/design lint and production build pass; root-hosted browser flows also passed before the additive owner-setup merge. User CLI confirms all three MRP migrations applied to the linked persistent project; no database mutation/reset from this environment.
- **Files:** Browser regression, README, database contract, PROGRESS and archive; integrated upstream Pages workflow/router/URL helpers.
- **Preferences learned:** None; existing GitHub Pages hosting preference retained.
- **Correction sweep:** N/A.
- **Rework:** Resolved overlapping progress histories; retained upstream hosting/access changes and all MRP/pickup implementation.
- **Follow-ups:** Merge verified PR, monitor Pages run and check live UI; First-owner onboarding backend/setup-code configuration remains a separate upstream follow-up; no owner is claimed in this release.

### 2026-11-17: Implement first-owner business onboarding (Codex)
- **What:** Added permanent protected owner setup, sign-in option, email-account onboarding, first-shop setup and invitation guidance.
- **Why:** Owner needs to create the business and invite admins/staff who choose passwords using email usernames.
- **How:** Private backend setup code, persisted limits, locked one-time database claim, atomic business/location/profile/audit writes and safe owner retries. Existing records and role hierarchy preserved. 355 JavaScript tests, build/typecheck and design lint pass. Migration and expanded security SQL passed against isolated demo in a rollback-only transaction (including its missing access-audit prerequisite). No owner claim or deployment. Glazed components/tokens only; no design exceptions. Browser visual checks remain blocked by tab-creation automation error.
- **Files:** Onboarding endpoint/migration/tests, bootstrap/config, auth UI/routes, README, CONTRACT and PROGRESS.
- **Preferences learned:** One business, private setup code, owner-invited admins, email invitations and first-location setup (README §8.5).
- **Correction sweep:** N/A.
- **Rework:** None.
- **Design review:** Re-ran full design lint after the hook reminder: passed. New UI uses existing Glazed components and inherited theme tokens, visible field labels and standard focus styles; conditional views have one primary action, sentence-case copy and semantic status tones. No new design deviations. Existing approved Barcode Labels capitalization and sidebar Glazed! exceptions remain unchanged. Light/dark browser visual review remains unverified because browser tab creation failed.
- **Follow-ups:** Deploy backend/configuration before frontend; verify both-theme visuals and SMTP. Existing demo backend lacks the delegated-access prerequisite; stage all unapplied migrations when deploying there. README setup instructions and preference rule are updated; changelog remains at ten entries.

## Archive Index
- `docs/progress-archive/2026-11.md`
