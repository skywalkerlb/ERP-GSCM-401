# PROGRESS.md: ERP Project (GSCM 401)

> **Read this file, `README.md` and `design-system/DESIGN_SYSTEM.md` before any edit. Update this file after every edit.** Full rules: README.md §9.
> **Size rules:** no more than 10 entries in Recent Changes and 300 lines. Status sections are snapshots.

## Current Status
**As of 2026-11-17.** `wzsbtfzettxpczgulibd` is the real persistent backend, as confirmed by the user. Promotion is complete: all 25 migrations applied, People/onboarding deployed, confirmation-free email signup and Pages callbacks configured. Existing business data is preserved; no reset/replay ran.
- Eight seeded demo identities are banned with randomized credentials, sessions revoked, staff roles removed and customer-profile access detached. No real owner is claimed; live onboarding status returns HTTP 200 with available=true.
- Local environment and GitHub's two required backend secrets point to the selected project. Three demo build secrets were removed. Supabase CLI is linked to the selected real project; former backend `eaphbcbklbcadokfcewc` is retained and protected.
- Both project IDs are blocked centrally from public demo entry and seed/reset/demo-prep operations. Demo remains unavailable until a third separate disposable backend is configured.
- 377 combined JavaScript/TypeScript tests, app build/typecheck, seed typecheck and design lint pass. All five live access/onboarding/MRP/BOM/customer security suites passed with rolled-back fixtures. Concurrent MRP/customer-pickup work is preserved and its migrations are applied to the selected backend. No new design deviations; existing Barcode Labels/Glazed! exceptions remain. Earlier visual verification is still pending.
- Private owner setup code is stored in ignored `.env.local` and server secrets only. Custom SMTP is not configured; staff invitation delivery requires configuration. Frontend publication follows this record.

## In-flight Work
- Publishing corrected backend configuration and protected-project guards to GitHub Pages, then verifying the hosted bundle uses the selected backend. First workflow failed because reset-guard tests need seed dependencies; added their installation to CI and retained all checks.

## Next Steps
1. Verify automatic Pages deployment and the live frontend's selected backend.
2. Intended owner opens `/create-business`, uses the private OWNER_SETUP_CODE from local `.env.local`, and creates the business without email confirmation.
3. Configure custom SMTP before inviting staff; provision a separate demo backend only if requested.

## Open Questions for the User
- No backend-selection decision pending: use `wzsbtfzettxpczgulibd`. Which email provider will send staff invitations? SMTP credentials should be entered privately in Supabase.
- What is the project due date?

## Recent Changes
### 2026-11-17: Promote selected Supabase project to real backend (Codex)
- **What:** Promoted `wzsbtfzettxpczgulibd`, disabled seeded public identities and demo entry, deployed missing migrations/functions and updated local/GitHub configuration.
- **Why:** User explicitly corrected the project ID and confirmed it must be the real backend.
- **How:** Preserved business records; banned eight seeded identities, randomized passwords and revoked sessions/access. Applied six pending migrations including the integrated upstream MRP/customer-pickup release, set APP_URL/DEMO_MODE/private setup code, deployed People/onboarding and configured Auth. 377 combined tests, build/typechecks and design lint pass; live rollback SQL suites and setup availability pass. No real owner claim or email sent.
- **Files:** Shared protected-project helper, browser backend selection, demo/seed scripts/tests, README, CONTRACT, PROGRESS/archive; ignored local env and hosted configuration.
- **Preferences learned:** Selected project is real; former backend remains protected (README §8.5).
- **Correction sweep:** Swept all active project-ID references, frontend/build secrets, CLI link, reset/seed/prep guards, backend account access and current docs. Historical logs retained.
- **Rework:** Decoded existing CLI keychain format for management API login. Preserved concurrent MRP/customer-pickup changes. Fixed initial Pages verification failure by installing seed test dependencies in CI. No new design exceptions; approved Barcode Labels/Glazed! exceptions retained.
- **Follow-ups:** Verify Pages publication; owner completes setup using private code; configure SMTP. Demo requires a separate disposable project.

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

### 2026-11-16: Configure GitHub Pages automatic publishing (Codex)
- **What:** Added and pushed automatic Pages publishing, frontend base-path support and path-preserving invitation redirects; replaced current Vercel hosting guidance. GitHub accepted publication through `d66fb08` after authorization.
- **Why:** User wants anyone to open the app from GitHub and see updates after each push.
- **How:** Pinned Pages actions, Node 24 build/tests and custom 404; configured five frontend/demo secrets. GitHub run `43989635680` passed installation, 334 tests/design lint, build/typecheck and artifact upload, then failed Pages configuration because the site is disabled. Workflow YAML/diff checks pass. Design checklist preserves Glazed props, tokens, primary actions, status tones, labels and focus/ARIA; no new exceptions. Approved Barcode Labels and sidebar Glazed! exceptions remain in README §8.1; both-theme visuals unverified. Supabase Pages URLs/invitation fix deployed.
- **Files:** Pages workflow, Vite/router/URL helpers, People redirect, verification tests, current docs, env example and removed Vercel rewrite config.
- **Preferences learned:** GitHub Pages replaces Vercel; main pushes publish automatically (README §8.3).
- **Correction sweep:** Swept active hosting instructions, assets, full-page redirects, Auth callbacks and invitation URLs; historical logs retained.
- **Rework:** Resolved the missing OAuth workflow scope through the user-approved device flow; push succeeded. Pages/About settings still require repository administration; no force push or permissions bypass used.
- **Follow-ups:** Enable Pages once as repository owner, retry deployment and verify the public URL; all source/build/backend work is ready.

### 2026-11-16: Support repository-path frontend hosting (Codex)
- **What:** Added a configurable Vite base, router basename and shared full-page/callback URL helpers for GitHub Pages.
- **Why:** User wants a public GitHub-hosted frontend that updates when main is pushed.
- **How:** Keep browser routing and Auth URL hashes; prefix demo entry/exit and recovery URLs with the build base. No design values or visible component markup changed; existing Glazed styles remain intact. 36 focused URL/auth/demo tests, typecheck, design lint and the repository-prefix production build pass. All six built entry assets retain the repository prefix and exist.
- **Files:** vite.config.ts, src/lib/appUrl.ts, src/app/routes.tsx, src/lib/supabase.ts, src/app/AuthPages.tsx, routing/auth/demo verification tests and PROGRESS.md.
- **Preferences learned:** GitHub Pages replaces Vercel hosting; parent agent records the preference centrally.
- **Correction sweep:** Searched runtime full-page navigation, Auth redirects and absolute asset paths; updated two demo redirects and password recovery plus the shared router/build base.
- **Rework:** None; root-hosted local development retains its existing URLs.
- **Follow-ups:** Complete coordinated Pages deployment, server invitation-prefix handling and live deep-link checks. GitHub custom 404 serves the SPA for nested routes while preserving the request URL; direct nested requests retain HTTP 404 status.

### 2026-11-16: Publish persistent backend rollout records (Codex)
- **What:** Reconciled the completed Supabase rollout records with current GitHub main for publication.
- **Why:** User requested deploying the latest work to GitHub.
- **How:** Fast-forwarded six upstream commits without changing their source or attribution; retained sidebar/Barcode Labels preferences and both documentation histories. Verified current GitHub login as briggsamason and retained that account's noreply author identity. Documentation diff checks and saved-credential scan pass; existing application checks remain recorded below. No new UI changes.
- **Files:** README.md, PROGRESS.md and docs/progress-archive/2026-11.md.
- **Preferences learned:** None.
- **Correction sweep:** N/A.
- **Rework:** Remote main advanced during concurrent work; combined current backend status with upstream handoff instead of overwriting it.
- **Follow-ups:** Frontend hosting and owner bootstrap remain separate from GitHub publication.

### 2026-11-16: Roll out persistent Supabase username access (Codex)
- **What:** Applied all 21 migrations to the previously empty persistent schema, deployed People and disabled signup email verification.
- **Why:** User requested the Supabase rollout after connecting CLI access.
- **How:** Authenticated management API bypassed stale direct-DB credentials; transaction-per-migration preserved enum boundaries and original migration history. Set production Site URL/exact redirects and People origin. All 35 schema checks (5 data checks skipped), rollback security suite and live signup/login/duplicate/customer-denial probes pass; temporary test account/customer removed. No data reset, demo seed, owner assignment, frontend deploy or UI edits.
- **Files:** README.md, PROGRESS.md and progress archive; deployed existing Supabase migrations/functions and Auth settings.
- **Preferences learned:** None; the existing no-email-verification preference is now configured on hosting.
- **Correction sweep:** N/A.
- **Rework:** Direct DB access still rejected the saved password; used the connected management API securely instead.
- **Follow-ups:** Obtain exact owner account, deploy frontend and verify browser/privileged People flows.

## Archive Index
- `docs/progress-archive/2026-11.md`
