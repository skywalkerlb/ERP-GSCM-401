# PROGRESS.md: ERP Project (GSCM 401)

> **Read this file, `README.md` and `design-system/DESIGN_SYSTEM.md` before any edit. Update this file after every edit.** Full rules: README.md §9.
> **Size rules:** no more than 10 entries in Recent Changes and 300 lines. Status sections are snapshots.

## Current Status
**As of 2026-11-19.** Permanent backend `wzsbtfzettxpczgulibd` is clean: sample business history, stock, catalog, suppliers, recipes, promotions and locations removed. Three genuine Auth accounts/passwords, profiles and linked customer identities preserved, including owner/admin. Eight seeded Auth identities deleted; completed owner setup remains closed. Business name retained.
- Current GitHub main synchronized locally; both active Supabase projects have all 26 migrations and freshly deployed People/onboarding functions. No data reset or configuration-secret changes.
- Owner/admin location settings and startup guidance deployed; migration applied to permanent and separate demo backends. Public demo keeps all sample records (5,416 sales, 36 items); every public-table fingerprint matched before/after cleanup.
- Private backup in ignored `.env.cleanup-backups/` was restored locally and cleanup rehearsed with rollback. Live UTC-normalized fingerprints matched before deletion; business writes/Auth signup blocked by transaction locks. Security history and document counters retained.
- All 377 JavaScript/TypeScript checks, production build, design lint and both-theme browser checks pass. Location RPC local authorization/create/edit/deactivation checks passed; genuine password hashes match backup; live owner setup remains closed.
- Public demo is live on Pages with all 26 migrations and demo-mode functions. Six-role entry/refresh/exit, retry/re-entry, concurrent visitors, and both themes passed; all 81 published JS assets use intended backends and exclude the demo service key. Final Pages run `44643203905` succeeded (`ed727f2`).
- Former backend `eaphbcbklbcadokfcewc` permanently deleted with user authorization. Exactly two projects remain in the Glazed organization, both ACTIVE_HEALTHY; real/demo Auth and onboarding return 200, setup stays closed, and Pages returns 200. All 81 published JS assets reference the intended backends without an old-backend URL. Reset guards retain the retired ID. SMTP for staff invitations is deferred. No new design exceptions.

## In-flight Work
- None. Retirement and live health checks complete; documentation changes are local.

## Next Steps
1. Real-business owner/admin: Settings → Locations → New location; enter real shop address/hours and review tax rates.
2. Add suppliers, ingredients/products, recipes and opening stock/accounting balances; assign staff locations in People.
3. Configure SMTP before inviting staff. Retain the permanent-business private backup until clean start is accepted. Forecasts and usage-based purchasing metrics need real history.

## Open Questions for the User
- No retirement questions remain. Project due date remains unspecified.

## Recent Changes
### 2026-11-19: Retire unused Supabase backend (Codex)
- **What:** Permanently deleted only `eaphbcbklbcadokfcewc`; real and public-demo projects remain healthy.
- **Why:** User explicitly approved retirement and requested implementation.
- **How:** Verified exact paused project/organization, local environment/CLI link and all 81 published JS assets; Management API DELETE returned 200 and project disappeared. Exactly two Glazed projects remain ACTIVE_HEALTHY. Both Auth/settings and onboarding status return 200 with setup closed; Pages returns 200.
- **Files:** README.md, supabase/CONTRACT.md, PROGRESS.md and progress archive; hosted project deletion.
- **Preferences learned:** Permanently retire former backend; retain its ID in reset-protection guards. No additional backup requested.
- **Correction sweep:** Updated current retained/paused wording in README and contract; preserved historical logs and reset guards.
- **Rework:** Published-site network check required sandbox escalation.
- **Follow-ups:** Documentation changes are local. No UI/API/schema changes or design exceptions.


### 2026-11-19: Update Supabase CLI configuration compatibility (Codex)
- **What:** Updated the CLI config for v3.2.0, confirmed all 26 migrations already match production, and redeployed `people` and `onboarding`.
- **Why:** The user asked to deploy to Supabase and GitHub.
- **How:** Replaced the obsolete `inbucket` section with `local_smtp`; migration status showed no pending schema changes. Deployed both current functions to `wzsbtfzettxpczgulibd` with the CLI.
- **Files:** `supabase/config.toml`, Supabase functions, `PROGRESS.md`, `docs/progress-archive/2026-11.md`
- **Preferences learned:** None
- **Correction sweep:** N/A
- **Rework:** None
- **Follow-ups:** Review the preserved older CLI setup commits before reapplying any of their changes to current main.


### 2026-11-19: Deploy current main to GitHub and Supabase (Codex)
- **What:** Synchronized latest GitHub main and redeployed People/onboarding to permanent and public-demo Supabase projects.
- **Why:** User requested all current changes deployed to Git and Supabase.
- **How:** Verified all 26 local migration versions already applied to both projects, deployed both functions using API bundling and retained existing configuration. Verified real/demo onboarding returns 200 with setup closed and People rejects unauthenticated access with 401. No seeds, resets, account edits or data changes.
- **Files:** PROGRESS.md and archive; hosted Edge Function deployments.
- **Preferences learned:** None.
- **Correction sweep:** N/A.
- **Rework:** Integrated concurrent GitHub synchronization and local Supabase CLI config updates; retained both deployment records.
- **Follow-ups:** Verify endpoint responses and final Pages deployment; owner configures real business. No UI changes or new design exceptions.

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


## Archive Index
- `docs/progress-archive/2026-11.md`
