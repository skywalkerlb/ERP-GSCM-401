# PROGRESS.md: ERP Project (GSCM 401)

> **Read this file, `README.md` and `design-system/DESIGN_SYSTEM.md` before any edit. Update this file after every edit.** Full rules: README.md §9.
> **Size rules:** no more than 10 entries in Recent Changes and 300 lines. Status sections are snapshots.

## Current Status
**As of 2026-11-19.** Independent business registration is live on [Glazed](https://skywalkerlb.github.io/ERP-GSCM-401/). Visitors create an email/password account and business as owner without a setup code or verification email. Login uses compact links and expandable demo access; each business has a shareable shop link and independent roles/data.
- Permanent `wzsbtfzettxpczgulibd` and disposable demo `wnsimxaopjqwiajbiina` have all 30 migrations and current People/onboarding functions. Registration is enabled only on the real backend; both projects require private-only Realtime channels.
- Existing records, memberships and Auth credentials were preserved. Private backups were restored and migrated locally; fingerprints across all 73 original public/Auth tables matched before/after hosted migration. Backups/proofs are retained in ignored `.env.tenancy-backups/20261119-multibusiness/`.
- Public live signup created two independent businesses, switched between them and verified shop isolation; only temporary fixtures were removed. All six live demo roles pass entry, refresh and exit. Valid private channels subscribe; foreign topics and legacy public channels are rejected.
- 95 JavaScript and 13 TypeScript tests, build/typechecks, design lint, both-theme browser regressions and five rollback SQL suites pass. SQL includes the actual 216-case role matrix, cross-business reads/writes/FKs, signup privacy, scoped reset and stored Realtime topic boundaries.
- Main release `07e6aca` published successfully in Pages run `44651197375`; final mobile-header/access-fallback refinement is being recorded. Former backend was retired by a separate authorized operation; reset guards retain its ID. Staff invitation SMTP remains deferred.

## In-flight Work
- Final mobile long-name header verification and publication of the validated access-fallback refresh refinement. Bounded business/location fields now wrap onto a labelled mobile row in both staff and shop headers.

## Next Steps
1. Open Create a business from login, or sign in to an existing business and use the Business selector to create/switch businesses.
2. Owners configure locations, suppliers, items/recipes and opening stock/accounting balances; assign staff in People after SMTP is configured.
3. Retain private migration/cleanup backups. Forecast and usage-based purchasing metrics need real history; demo reset scheduling remains out of scope.

## Open Questions for the User
- Project due date remains unspecified; no business-registration decisions are pending.

## Recent Changes
### 2026-11-19: Implement and deploy independent business registration (Codex)
- **What:** Shipped public owner registration, independent businesses/memberships, switching, shareable shops and a compact login with expandable demo access.
- **Why:** Anyone needs to create their own business from login, with fewer words on the screen.
- **How:** Applied four tenant migrations and deployed People/onboarding to both projects after backup-restore rehearsals and exact original-data/credential fingerprint checks. Enabled real registration only after frontend and isolation validation. 95 JS/13 TS tests, build/typechecks, design lint, both-theme browser regressions and five rollback SQL suites pass; actual SQL covers 216 actor/target/requested-role assignments, 36 self changes and 36 invitation combinations. Live two-business signup/switch/shop privacy, six demo roles and private-channel authorization pass. Pages run `44651197375` published the main release.
- **Files:** Tenant migrations/APIs, auth/routes/shop links, shared shell/storage/realtime, reset guards, verification suites, README, architecture, CONTRACT and PROGRESS.
- **Preferences learned:** Independent businesses per login, owner signup without setup code/email verification, concise login and expandable demo; recorded in README §8.1/§8.5.
- **Correction sweep:** Replaced installation-wide owner setup, global credential management and public operational channels across frontend, APIs, SQL, scripts and current docs; preserved legacy shop links and isolated demo access.
- **Rework:** Rehearsal caught signup membership leakage and scoped-reset back-link cycles; fixed before rollout. Added whole-document refresh when a persisted membership is invalidated, matching explicit switching. Integrated concurrent deployment/CLI and authorized-retirement records without dropping source changes.
- **Design review:** Glazed components/tokens, visible labels/focus, one primary action, light/dark desktop/mobile reviewed. Long business/location names remain visible without horizontal overflow at 390px; wrapped staff/shop headers keep selectors usable. No new design exceptions; existing README §8.1 exceptions retained.
- **Follow-ups:** Final mobile/access-fallback refinement publication; retain ignored backups. Configure SMTP before real invitations. No automatic demo reset scheduled.

### 2026-11-19: Retire unused Supabase backend (Codex)
- **What:** Permanently deleted only `eaphbcbklbcadokfcewc`; real and public-demo projects remain healthy.
- **Why:** User explicitly approved retirement and requested implementation.
- **How:** Verified exact paused project/organization, local environment/CLI link and all 81 published JS assets; Management API DELETE returned 200 and project disappeared. Exactly two Glazed projects remain ACTIVE_HEALTHY. Both Auth/settings and onboarding status return 200 with setup closed; Pages returns 200.
- **Files:** README.md, supabase/CONTRACT.md, PROGRESS.md and progress archive; hosted project deletion.
- **Preferences learned:** Permanently retire former backend; retain its ID in reset-protection guards. No additional backup requested.
- **Correction sweep:** Updated current retained/paused wording in README and contract; preserved historical logs and reset guards.
- **Rework:** Published-site network check required sandbox escalation.
- **Follow-ups:** Documentation changes are local. No UI/API/schema changes or design exceptions.

### 2026-11-19: Synchronize local main with GitHub (Codex)
- **What:** Updated local `main` to GitHub's latest `main` at `8adfa19`.
- **Why:** The user asked to pull all changes from GitHub.
- **How:** Fetched the remote, preserved the two local commits on `pre-github-sync-20261119`, then synchronized `main` to `origin/main` without merging the older divergent snapshot.
- **Files:** `PROGRESS.md`, `docs/progress-archive/2026-11.md`
- **Preferences learned:** None
- **Correction sweep:** N/A
- **Rework:** None
- **Follow-ups:** Review the preserved local setup commits before reapplying any changes to current main.

### 2026-11-19: Deploy current main to GitHub and Supabase (Codex)
- **What:** Synchronized latest GitHub main and redeployed People/onboarding to permanent and public-demo Supabase projects.
- **Why:** User requested all current changes deployed to Git and Supabase.
- **How:** Verified all 26 local migration versions already applied to both projects, deployed both functions using API bundling and retained existing configuration. Verified real/demo onboarding returns 200 with setup closed and People rejects unauthenticated access with 401. No seeds, resets, account edits or data changes.
- **Files:** PROGRESS.md and archive; hosted Edge Function deployments.
- **Preferences learned:** None.
- **Correction sweep:** N/A.
- **Rework:** Integrated concurrent GitHub synchronization and local Supabase CLI config updates; retained both deployment records.
- **Follow-ups:** Verify endpoint responses and final Pages deployment; owner configures real business. No UI changes or new design exceptions.

### 2026-11-19: Update Supabase CLI configuration compatibility (Codex)
- **What:** Updated the CLI config for v3.2.0, confirmed all 26 migrations already match production, and redeployed `people` and `onboarding`.
- **Why:** The user asked to deploy to Supabase and GitHub.
- **How:** Replaced the obsolete `inbucket` section with `local_smtp`; migration status showed no pending schema changes. Deployed both current functions to `wzsbtfzettxpczgulibd` with the CLI.
- **Files:** `supabase/config.toml`, Supabase functions, `PROGRESS.md`, `docs/progress-archive/2026-11.md`
- **Preferences learned:** None
- **Correction sweep:** N/A
- **Rework:** None
- **Follow-ups:** Review the preserved older CLI setup commits before reapplying any of their changes to current main.


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

## Archive Index
- `docs/progress-archive/2026-11.md`
