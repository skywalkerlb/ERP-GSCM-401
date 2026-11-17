# PROGRESS.md: ERP Project (GSCM 401)

> **Read this file, `README.md` and `design-system/DESIGN_SYSTEM.md` before any edit. Update this file after every edit.** Full rules: README.md §9.
> **Size rules:** no more than 10 entries in Recent Changes and 300 lines. Status sections are snapshots.

## Current Status
**As of 2026-11-17.** Public frontend hosting is GitHub Pages at **https://skywalkerlb.github.io/ERP-GSCM-401/** with automatic publishing on main pushes. The MRP/customer-pickup release is integrated with the Pages base-path/router and latest username signup; PR #1 is merged and the MRP/customer-pickup update is publicly deployed. Pages workflow `44136673348` successfully published source `b5d0c30`.

- The user successfully applied migrations `20261116000101..103` to linked persistent Supabase `eaphbcbklbcadokfcewc` and deployed People via CLI 2.122.1 (terminal output confirmed in this session). Baseline 21 migrations, username Auth settings and Pages URLs were verified by the earlier hosting rollout. The separate first-owner onboarding migration `20261117000001`/function/setup-code configuration is newly added upstream and remains pending; its setup UI stays unavailable until configured. No seed/reset is required or performed.
- MRP nets confirmed BOM demand against dated PO receipts and company-wide stock over four weeks, calculates pack-rounded suggestions/order-by dates and shows nine seed-catalog parent BOMs. Customer catalog shows fresh availability by shop after direct/shared-kit reservations; checkout validates available items and pickup times. Persistent master data/owner still require setup if empty.
- Prior release verification passed 338 TS/Node tests, four rollback SQL suites and 36 non-data assertions; Pages main separately passed 334 JavaScript tests. Combined verification passes: 367 TS/Node tests, both-theme browser flows at root and repository prefix, typecheck/design lint and prefixed production build. Concurrent first-owner setup changes are preserved; their private backend configuration remains pending upstream. No new design exceptions; approved Glazed! and Barcode Labels exceptions retained.
- Live smoke checks: public Manager demo renders the updated MRP view with nine loaded BOM parents; Customer demo renders 13 menu items with availability across shops. No JavaScript page errors, owner claims or orders submitted. People preflight returns 204 and permits the Pages origin.
- Existing demo data remains isolated; no replay ran. Known seed reproducibility differences remain (48 skipped events, 19 quantity differences).

## In-flight Work
- MRP/customer-pickup implementation and Pages deployment are complete.
- No database reset/replay or owner assignment in progress; separate onboarding backend/private-code setup remains pending upstream.

## Next Steps
1. Complete upstream first-owner onboarding backend/private-code setup or obtain the exact account for trusted bootstrap; never claim an owner as a smoke test.
2. Confirm persistent catalog/inventory data before real customer ordering; use isolated Manager/Customer demos to review sample workflows now.
3. Preserve existing demo data; repair historical seed reproducibility only under a separate request.

## Open Questions for the User
- Which existing username or email should receive persistent ERP owner access? Never share passwords in chat.
- What is the project due date?

## Recent Changes
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

### 2026-11-16: Published verified label and sidebar changes to GitHub (Codex)
- **What:** Pushed the fully integrated history to main as 1ecc273; local and remote branches match.
- **Why:** The user requested publishing the changes and explicitly approved exact GitHub CLI permissions.
- **How:** GitHub CLI authenticated as chrisshipp19-web; HTTPS push succeeded with Chris Shipp noreply attribution and configured Git hooks. Latest integrated build/typecheck, design lint and all 326 JavaScript tests pass. GitHub reports no deployments or status checks; live hosting remains unverified.
- **Files:** Published integrated source/history and documentation; PROGRESS.md and progress archive updated for handoff.
- **Preferences learned:** None
- **Correction sweep:** N/A
- **Rework:** Resolved authentication and integrated concurrent upstream signup changes without overwriting either history.
- **Follow-ups:** User signs in to the existing Vercel project in Chrome; deploy/verify live change. Existing backend rollout requirements remain. Approved Barcode Labels capitalization and Glazed! punctuation exceptions preserved; both-theme visuals not rechecked.

## Archive Index
- `docs/progress-archive/2026-11.md`
