# PROGRESS.md: ERP Project (GSCM 401)

> **Read this file, `README.md` and `design-system/DESIGN_SYSTEM.md` before any edit. Update this file after every edit.** Full rules: README.md §9.
> **Size rules:** no more than 10 entries in Recent Changes and 300 lines. Status sections are snapshots.

## Current Status
**As of 2026-11-17.** Public frontend hosting is GitHub Pages at **https://skywalkerlb.github.io/ERP-GSCM-401/** with automatic publishing on main pushes. The MRP/customer-pickup release is integrated with the Pages base-path/router and latest username signup; combined verification passed and Pages publication is in progress.

- The user successfully applied migrations `20261116000101..103` to linked persistent Supabase `eaphbcbklbcadokfcewc` and deployed People via CLI 2.122.1 (terminal output confirmed in this session). Baseline 21 migrations, username Auth settings and Pages URLs were verified by the earlier hosting rollout. No seed/reset is required or performed.
- MRP nets confirmed BOM demand against dated PO receipts and company-wide stock over four weeks, calculates pack-rounded suggestions/order-by dates and shows nine seed-catalog parent BOMs. Customer catalog shows fresh availability by shop after direct/shared-kit reservations; checkout validates available items and pickup times. Persistent master data/owner still require setup if empty.
- Prior release verification passed 338 TS/Node tests, four rollback SQL suites and 36 non-data assertions; Pages main separately passed 334 JavaScript tests. Combined verification passes: 346 TS/Node tests, root and repository-prefix browser flows in both themes, standard and prefixed production builds, typecheck and design lint. No new design exceptions; approved Glazed! and Barcode Labels exceptions retained.
- Existing demo data remains isolated; no replay ran. Known seed reproducibility differences remain (48 skipped events, 19 quantity differences).

## In-flight Work
- Verify integrated PR #1, merge under the user's prior deployment authorization, monitor Pages publication and check the live frontend.
- No database reset/replay or owner assignment in progress.

## Next Steps
1. Complete combined tests and Pages deployment; verify updated MRP and customer portal at the public site.
2. Confirm live backend functions and complete browser smoke checks without creating persistent orders.
3. Obtain the exact existing username/email for ERP owner bootstrap; do not guess the owner account. Confirm catalog/inventory data before real customer ordering.
4. Preserve existing demo data; repair historical seed reproducibility only under a separate request.

## Open Questions for the User
- Which existing username or email should receive persistent ERP owner access? Never share passwords in chat.
- What is the project due date?

## Recent Changes
### 2026-11-17: Integrate MRP/customer pickup with GitHub Pages (Codex)
- **What:** Combined PR #1 with the live Pages hosting changes, preserved username signup and added repository-prefix browser regression coverage.
- **Why:** Finish the authorized frontend deployment after the user enabled GitHub Pages and successfully applied MRP migrations/deployed People from PowerShell.
- **How:** Confirmed Pages root HTTP 200 and successful prior Actions runs; integrated main without dropping sidebar/Barcode Labels exceptions or URL-prefix support. Combined 346 TS/Node tests, root/prefixed both-theme browser checks, standard/prefixed builds, typecheck and design lint pass before merge/publication. User CLI confirms all three MRP migrations applied to the linked persistent project; no database mutation/reset from this environment.
- **Files:** Browser regression, README, database contract, PROGRESS and archive; integrated upstream Pages workflow/router/URL helpers.
- **Preferences learned:** None; existing GitHub Pages hosting preference retained.
- **Correction sweep:** N/A.
- **Rework:** Resolved overlapping progress histories; retained upstream hosting/access changes and all MRP/pickup implementation.
- **Follow-ups:** Merge verified PR, monitor Pages run and check live UI; ERP owner bootstrap still needs the exact selected account.

### 2026-11-16: Prepare combined release and verify deployment access (Codex)
- **What:** Integrated the latest username signup into the MRP/customer pickup release, resolved migration version collisions and checked deployment connections.
- **Why:** The user authorized hosted migration/deployment of both feature sets.
- **How:** Preserved username/password signup and existing access hierarchy; assigned unique ordered versions to the three unpublished MRP/customer migrations. Combined build/typecheck, design lint, 338 TS/Node tests, both-theme browser flows, four SQL suites and 36 assertions pass; 24 migrations apply on a fresh local database. No new design exceptions. Environment status has no deployment secrets; Vercel/Supabase plugins report DISABLED_BY_ADMIN. No hosted changes made.
- **Files:** Three renamed migrations, seed MRP reference, browser test label, README, contract, PROGRESS and archive; integrated upstream auth changes.
- **Preferences learned:** None; existing username-only signup preference retained.
- **Correction sweep:** N/A.
- **Rework:** Concurrent username migration reused the original MRP version; renumbered the unpublished release migrations.
- **Follow-ups:** Enable authorized Vercel/Supabase access or securely configure CLI credentials; inspect hosted migration history, migrate without resets, configure Auth, deploy backend/frontend and verify live.

### 2026-11-16: Publish simplified username signup to GitHub (Codex)
- **What:** Committed and pushed all 17 changed files to GitHub main in `530db86`.
- **Why:** User requested pushing the completed work to GitHub.
- **How:** Confirmed remote main matched local base, GitHub noreply commit identity, no diff whitespace errors and no saved credentials in the pending files. GitHub accepted the main update to `530db86`. Existing 330 tests, build, typecheck, design lint and rollback database checks pass; no additional product or UI changes in this step.
- **Files:** Username signup/auth, People password resets, shared identity, migration, verification tests, README, current architecture/contract, PROGRESS.md and archive.
- **Preferences learned:** None.
- **Correction sweep:** N/A.
- **Rework:** None.
- **Follow-ups:** Hosted rollout and browser visual checks remain pending backend access and working browser automation.

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

### 2026-11-16: Restored publishing access and integrated latest signup work (Codex)
- **What:** Completed GitHub CLI sign-in with explicit exact-scope approval and integrated upstream ff265ec with local label/sidebar changes.
- **Why:** Complete the user's requested website publication without overwriting concurrent work.
- **How:** Verified browser device-success page and CLI login as chrisshipp19-web; retained Chris Shipp's noreply commit identity and configured hooks. Resolved documentation conflicts while preserving both histories and current username signup requirements. Integrated build/typecheck, full design lint, diff checks and all 326 JavaScript tests pass; GitHub push follows this edit.
- **Files:** Merged source and documentation; PROGRESS.md and progress archive.
- **Preferences learned:** None
- **Correction sweep:** N/A
- **Rework:** New upstream commits arrived during authorization; preserved them in a second merge. Earlier automatic approval rejection was resolved by explicit approval of its exact scopes.
- **Follow-ups:** Push and verify hosting. Backend rollout is still credential-blocked; Vercel GitHub login reports account_not_found. Approved Barcode Labels and Glazed! wording exceptions remain; no new design changes.

## Archive Index
- `docs/progress-archive/2026-11.md`
