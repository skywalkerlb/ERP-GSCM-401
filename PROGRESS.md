# PROGRESS.md: ERP Project (GSCM 401)

> **Read this file, `README.md` and `design-system/DESIGN_SYSTEM.md` before any edit. Update this file after every edit.** Full rules: README.md §9.
> **Size rules:** no more than 10 entries in Recent Changes and 300 lines. Status sections are snapshots.

## Current Status
- Owner/admin location setup UI, active-location selection and real/demo About copy implemented; backend integration and validation in flight.
**As of 2026-11-19.** Real backend `wzsbtfzettxpczgulibd` remains active and protected. Former backend `eaphbcbklbcadokfcewc` was paused with user authorization; its data is retained and reset protection remains enabled.
- New disposable demo: `wnsimxaopjqwiajbiina`. All 25 migrations applied; People/onboarding deployed; People uses DEMO_MODE=true and Pages APP_URL. Demo Auth callbacks configured.
- Demo 210-day replay completed without failures; inventory ledger/GL/item costs reconcile at $37,237.92. All six roles pass entry, landing, refresh and exit through the local release frontend. Demo Actions secrets configured; publication next.
- All 377 JavaScript/TypeScript checks, production build/typechecks, design lint and both-theme browser regressions pass. Fresh and repeated seed-account linking passed against the demo database; simultaneous visitor exit/session isolation passed.
- Real-business cleanup/location work is tracked separately; genuine owner/admin access is preserved. SMTP is deferred. Private credentials stay in ignored local files/server secrets.

## In-flight Work
- Prepare permanent backend cleanup and add owner/admin location settings; public demo data remains separate.
- Clean permanent backend sample data while preserving three genuine accounts and completed owner setup; location setup implementation and backup rehearsal underway.
- Publish the completed demo release and verify public entry.

## Next Steps
0. Verify location setup UI/backend and complete authorized permanent sample-data cleanup.
1. Publish and verify public demo entry.
2. Record completed publication and public browser checks.
3. Configure SMTP later for real staff invitations.

## Open Questions for the User
- What is the project due date?

## Recent Changes
### 2026-11-19: Prepare real-business location setup (Codex)
- **What:** Added owner/admin location create/edit dialog, active-location selection and empty-business guidance; About distinguishes real records from demo history.
- **Why:** A clean business needs a way to create real shops without reopening owner registration.
- **How:** Glazed components/tokens, save_business_location RPC, preserved inactive history and cleared stale stored location IDs. Typecheck, design lint, production build, 364 JavaScript checks and both-theme browser regressions pass.
- **Files:** Settings location UI, location provider, app shell, About and PROGRESS.
- **Preferences learned:** Empty permanent business; preserve genuine accounts and public demo.
- **Correction sweep:** N/A.
- **Rework:** None.
- **Follow-ups:** Parent integrates backend, checks and live cleanup; no design exceptions.
### 2026-11-19: Prepare permanent business cleanup (Codex)
- **What:** Added one-time cleanup SQL and owner/admin location setup RPC; live preflight identifies eight seeded identities and three genuine accounts, including completed owner/admin access.
- **Why:** Start the permanent business empty while retaining genuine access and keeping public demo untouched.
- **How:** Dedicated cleanup preparation; private backup restored and fingerprint-checked cleanup rehearsal passed; location RPC deployed only to permanent backend. UI publication and live cleanup next. No data deleted yet.
- **Files:** Location migration, PROGRESS.md; forthcoming cleanup tooling and settings UI.
- **Preferences learned:** Remove sample master data/history; preserve genuine access; provide location settings.
- **Correction sweep:** N/A.
- **Rework:** PostgreSQL tools absent; installing for backup rehearsal.
- **Follow-ups:** Verify backup, cleanup manifest and UI before live cleanup. No new design exceptions.
### 2026-11-19: Restore separate public demo backend (Codex)
- **What:** Created and populated separate disposable demo `wnsimxaopjqwiajbiina`; configured all role accounts, migrations, Edge Functions, Auth and Actions secrets.
- **Why:** Visitors need credential-free demo access using isolated sample data.
- **How:** Paused unused former backend with authorization, retaining data and both persistent-project guards. Completed 210-day replay with no failed events and reconciled inventory/accounting. All 377 JS/TS tests, build/typechecks, design lint, both-theme browser regressions, five rollback SQL suites and live local role/session/retry checks pass.
- **Files:** scripts/seed/run.ts, README.md, supabase/CONTRACT.md, PROGRESS.md and archive; hosted configuration and ignored local settings.
- **Preferences learned:** Pause unused former backend to free the demo slot; finish task validation before deployment.
- **Correction sweep:** Recorded deployment sequencing in README §8.4; used an isolated checkout, then integrated the validated/published location release. Existing automatic main publishing remains intact.
- **Rework:** Fixed fresh Auth-created customer collision by linking seeded customer/profile atomically without deleting records. Verified the actual seed function on fresh and repeated execution. Installed declared browser dependencies and used system Chrome.
- **Follow-ups:** Publish and verify public entry. No UI changes or new design exceptions.

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

### 2026-11-16: Prepare combined release and verify deployment access (Codex)
- **What:** Integrated the latest username signup into the MRP/customer pickup release, resolved migration version collisions and checked deployment connections.
- **Why:** The user authorized hosted migration/deployment of both feature sets.
- **How:** Preserved username/password signup and existing access hierarchy; assigned unique ordered versions to the three unpublished MRP/customer migrations. Combined build/typecheck, design lint, 338 TS/Node tests, both-theme browser flows, four SQL suites and 36 assertions pass; 24 migrations apply on a fresh local database. No new design exceptions. Environment status has no deployment secrets; Vercel/Supabase plugins report DISABLED_BY_ADMIN. No hosted changes made.
- **Files:** Three renamed migrations, seed MRP reference, browser test label, README, contract, PROGRESS and archive; integrated upstream auth changes.
- **Preferences learned:** None; existing username-only signup preference retained.
- **Correction sweep:** N/A.
- **Rework:** Concurrent username migration reused the original MRP version; renumbered the unpublished release migrations.
- **Follow-ups:** Enable authorized Vercel/Supabase access or securely configure CLI credentials; inspect hosted migration history, migrate without resets, configure Auth, deploy backend/frontend and verify live.

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

### 2026-11-17: Activate public GitHub Pages hosting (Codex)
- **What:** Confirmed Pages enabled and successfully published Glazed at the repository's public Pages URL.
- **Why:** Finish the requested public frontend and automatic publishing after the user enabled GitHub Actions as the Pages source.
- **How:** Dispatched existing workflow `44113413468`; build/deploy both succeeded, including 334 tests, lint, typecheck and production build. Public root and six assets return 200; custom signup deep-link fallback loads the app; People CORS permits Pages. No new product/UI changes; existing design exceptions preserved and browser visuals remain unverified.
- **Files:** README.md, PROGRESS.md and docs/progress-archive/2026-11.md; GitHub Pages deployment state.
- **Preferences learned:** None; implements existing GitHub Pages preference.
- **Correction sweep:** Removed obsolete pending-enablement wording from current status/docs; historical logs retained.
- **Rework:** Earlier deployment failed only because Pages had not yet been enabled; rerun succeeded after the setting changed.
- **Follow-ups:** Verify automatic deployment on the handoff commit; optional browser review and ERP owner bootstrap remain.

## Archive Index
- `docs/progress-archive/2026-11.md`
