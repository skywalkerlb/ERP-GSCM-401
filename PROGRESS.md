# PROGRESS.md: ERP Project (GSCM 401)

> **Read this file, `README.md` and `design-system/DESIGN_SYSTEM.md` before any edit. Update this file after every edit.** Full rules: README.md §9.
> **Size rules:** no more than 10 entries in Recent Changes and 300 lines. Status sections are snapshots.

## Current Status
**As of 2026-11-16.** GitHub CLI sign-in as chrisshipp19-web is complete after explicit user approval of exact scopes. Publication integration includes upstream ff265ec plus local sidebar fixes and Barcode Labels capitalization; integrated build/typecheck, full design lint, diff checks and all 326 JavaScript tests pass. Username/password-only signup is implemented, verified and pushed to GitHub main in commit `530db86`. Signup has two fields, signs customers in immediately when hosted confirmation is disabled, and requires no contact email. Both login screens accept usernames and existing email accounts. People displays usernames and offers protected lower-level username password resets. Existing role hierarchy and isolated demo behavior remain in place.
- Current publication verification: 326 JavaScript tests pass. Previously recorded 4 TypeScript role/reset-guard tests passed; build/design lint/diff checks pass, and the final TypeScript check exited successfully after integration. Exact pending delegated-access and username migrations plus the complete signup/hierarchy/username/reset audit SQL suite pass against actual demo Postgres in one rolled-back transaction. No demo schema or data changes persisted.
- Hosted rollout is blocked: persistent database rejects saved password (`28P01`), Supabase CLI has no login token, and hosted public settings still report email confirmation required. No persistent Auth settings, schema, accounts or deployments changed. Earlier missing persistent API schema remains unresolved.
- Both-theme visuals have not been rechecked for publication. Browser access now works for sign-in; prior visual attempts had CUA errors. Components and theme tokens were reviewed against Glazed docs/reference images; preserved approved Barcode Labels capitalization and Glazed! sidebar punctuation exceptions.
- Demo seed reproducibility remains a separate known follow-up (48 skipped events, 19 quantity differences).

## In-flight Work
- Publishing merged local changes; GitHub authorization is restored. Vercel plugin is disabled; browser GitHub sign-in reports account_not_found, so hosting needs the owning Vercel account if automatic deployment is unavailable.
- Upstream username-signup publication is complete; local label/sidebar publication is in progress. Hosted configuration, migrations, endpoint/frontend deployment and end-to-end signup verification await working Supabase credentials. The temporary verification server has been stopped.

## Next Steps
1. Push integrated frontend changes and check automatic deployment status; use the owning Vercel account if needed.
2. Restore hosted access by correcting the persistent database password locally and running `supabase login`; inspect hosted migration history without resetting data.
3. Apply ordered migrations, disable hosted Confirm email, bootstrap the owner if needed, deploy People, then deploy the frontend together with matching backend changes. Preserve existing accounts and demo data.
4. Verify hosted username signup → immediate shop access → sign-out/login, existing email login/recovery and authorized username password reset; finish both-theme browser review once CUA works.
5. Configure SMTP only for legacy recovery/staff email invitations; address seed reproducibility only under a future explicit request.

## Open Questions for the User
- GitHub access is ready for this publication. Access to the existing Vercel project may still be needed. Hosted rollout needs a working local persistent database password and completed `supabase login`. Never paste credentials in chat.
- Which existing account should own the persistent ERP if it has not been bootstrapped? Username signup needs no inbox.
- What is the project due date?

## Recent Changes
### 2026-11-16: Restored publishing access and integrated latest signup work (Codex)
- **What:** Completed GitHub CLI sign-in with explicit exact-scope approval and integrated upstream ff265ec with local label/sidebar changes.
- **Why:** Complete the user's requested website publication without overwriting concurrent work.
- **How:** Verified browser device-success page and CLI login as chrisshipp19-web; retained Chris Shipp's noreply commit identity and configured hooks. Resolved documentation conflicts while preserving both histories and current username signup requirements. Integrated build/typecheck, full design lint, diff checks and all 326 JavaScript tests pass; GitHub push follows this edit.
- **Files:** Merged source and documentation; PROGRESS.md and progress archive.
- **Preferences learned:** None
- **Correction sweep:** N/A
- **Rework:** New upstream commits arrived during authorization; preserved them in a second merge. Earlier automatic approval rejection was resolved by explicit approval of its exact scopes.
- **Follow-ups:** Push and verify hosting. Backend rollout is still credential-blocked; Vercel GitHub login reports account_not_found. Approved Barcode Labels and Glazed! wording exceptions remain; no new design changes.

### 2026-11-16: Publish simplified username signup to GitHub (Codex)
- **What:** Committed and pushed all 17 changed files to GitHub main in `530db86`.
- **Why:** User requested pushing the completed work to GitHub.
- **How:** Confirmed remote main matched local base, GitHub noreply commit identity, no diff whitespace errors and no saved credentials in the pending files. GitHub accepted the main update to `530db86`. Existing 330 tests, build, typecheck, design lint and rollback database checks pass; no additional product or UI changes in this step.
- **Files:** Username signup/auth, People password resets, shared identity, migration, verification tests, README, current architecture/contract, PROGRESS.md and archive.
- **Preferences learned:** None.
- **Correction sweep:** N/A.
- **Rework:** None.
- **Follow-ups:** Hosted rollout and browser visual checks remain pending backend access and working browser automation.

### 2026-11-16: Add protected username password resets (Codex)
- **What:** Added username display and authorized password resets to People; username accounts never receive invitation emails.
- **Why:** Username-only accounts need a recovery path without email verification.
- **How:** Shared identity helper; existing hierarchy checks; service-only reset-attempt authorization/audit before Auth updates. Passwords stay out of storage and audit. 286 People tests pass within 330 total local tests; final typecheck, build, design lint and diff checks pass. Existing Glazed components and theme tokens only; no design exceptions. Browser visual review is blocked by the CUA tab-creation error; integrated rollback SQL security checks pass. Final handoff reconciled after the documentation reminder.
- **Files:** People endpoint/UI, shared identity helper, People endpoint/UI tests, PROGRESS.md and progress archive.
- **Preferences learned:** Username accounts require no email verification; record centrally in README with the main signup change.
- **Correction sweep:** Checked People invitations, resend, directory labels, reset controls and demo simulation; updated two runtime surfaces and shared identity handling.
- **Rework:** None.
- **Follow-ups:** Complete hosted rollout and browser verification when access is restored.

### 2026-11-16: Simplify account creation to username and password (Codex)
- **What:** Replaced email-confirmed signup with username/password signup and immediate customer access; retained existing email logins.
- **Why:** User requested simple account creation without email verification and approved implementation.
- **How:** Shared normalized identity, Glazed two-field form and immediate sessions; immutable usernames and no matching-email customer claims. 330 local tests, build/typecheck/design lint and exact migration/security SQL checks pass (demo transaction rolled back). Fixed test fixture owner collision. Visible labels, one primary action, standard focus styles/status tones and both-theme tokens reviewed; no design exceptions. Browser visuals blocked by CUA. Hosted DB password rejected; confirmation remains enabled.
- **Files:** Auth pages/provider, shared identity, Supabase configuration/migration, People reset controls, verification tests and current documentation.
- **Preferences learned:** Signup requires only username/password; no email verification (README §8.1).
- **Correction sweep:** Swept confirmation/signup/name requirements across shared auth, both logins, signup, local config, People, current backend functions, tests and 3 current docs; historical logs/migrations preserved.
- **Rework:** Replaces the previously approved email-confirmation flow.
- **Follow-ups:** Restore Supabase access, apply migrations/settings, deploy backend and frontend, and finish hosted/browser checks.

### 2026-11-16: Recorded publication authentication blockers (Codex)
- **What:** Committed verified integrated changes as a6c852b; publication has not completed.
- **Why:** The user requested live publication and authorized GitHub/Vercel sign-in.
- **How:** SSH push failed public-key authentication; HTTPS lacked credentials. Prepared official GitHub CLI browser sign-in; automatic approval review rejected its broad repository/gist/workflow scopes, and explicit exact-scope approval is pending. Vercel GitHub login reports account_not_found. Build/typecheck, design lint and 281 verification tests pass.
- **Files:** PROGRESS.md and progress archive; official CLI downloaded to /private/tmp only.
- **Preferences learned:** None
- **Correction sweep:** N/A
- **Rework:** Reconciled newer upstream commits and documentation before attempting publication; preserved local histories and Chris Shipp attribution.
- **Follow-ups:** Await exact scope approval, complete GitHub sign-in/push and resolve hosting access. Existing Barcode Labels and Glazed! exceptions remain; no new UI changes.

### 2026-11-16: Integrated upstream for requested publication (Codex)
- **What:** Merged latest upstream signup/access work with local sidebar fixes and Barcode Labels capitalization.
- **Why:** Publish user-approved changes while preserving concurrent contributors' work.
- **How:** Preserved both histories, resolved three documentation conflicts by combining preferences and history, and retained upstream access rules and sidebar punctuation. Kept normal configured Git hooks. Integrated build/typecheck, full design lint, diff checks and 281 JavaScript verification tests pass; publication/deployment verification remain pending.
- **Files:** Merged application, backend, verification, hook and documentation changes; PROGRESS.md and archive.
- **Preferences learned:** None; Chris Shipp attribution and Barcode Labels capitalization retained.
- **Correction sweep:** N/A
- **Rework:** Reconciled divergent main branches without rewriting or dropping commits.
- **Follow-ups:** Run integrated checks, push and verify hosting. Approved exceptions: Barcode Labels capitalization and sidebar Glazed! punctuation; both-theme browser visuals remain pending.

### 2026-11-16: Prepared local changes for publication (Codex)
- **What:** Prepared Barcode Labels wording, earlier sidebar fix and pending project notes for publication.
- **Why:** The user requested publishing the changes to the live website.
- **How:** Verified Chris Shipp against connected GitHub account, confirmed local noreply commit identity and active hooks. Build/typecheck pass. Fetched newer upstream commits for a merge preserving both contributors' work; deployment remains pending.
- **Files:** Pending source, hook and documentation files; PROGRESS.md and progress archive.
- **Preferences learned:** None
- **Correction sweep:** N/A
- **Rework:** New upstream signup/access implementation requires integration before push.
- **Follow-ups:** Merge, check, push and verify deployment. Approved Barcode Labels capitalization exception remains; no new UI changes.

### 2026-11-16: Capitalized Barcode Labels page name (Codex)
- **What:** Capitalized Labels in the page heading, browser title, breadcrumb, sidebar entry and item editor hint.
- **Why:** The user requested an uppercase L on the barcode labels page.
- **How:** Updated all four page-name literals across three source files; kept existing Glazed components and theme styles. Marked the approved sentence-case exception with ds-exception comments and in README. Source sweep, design lint and diff checks pass; no browser verification performed.
- **Files:** `src/features/labels/LabelsPage.tsx`, `src/app/nav.ts`, `src/features/items/ItemEditor.tsx`, `README.md`, `PROGRESS.md`, `docs/progress-archive/2026-11.md`
- **Preferences learned:** This page name is "Barcode Labels" in all app references (README §8.2).
- **Correction sweep:** Searched the whole project for Barcode labels; corrected four active UI literals in three files. PageHeader also sets the browser tab title.
- **Rework:** None
- **Follow-ups:** User review locally; existing deployment, backend and visual follow-ups remain.

### 2026-11-16: Started local app for user testing (Codex)
- **What:** Installed locked frontend dependencies and started Vite at http://localhost:5173/login.
- **Why:** The user requested a local address to test changes without using the terminal.
- **How:** Downloaded official Node v24.22.3 for Apple Silicon to /private/tmp, verified its SHA-256 against the official manifest, ran npm ci, and started the existing dev command. Login route returns HTTP 200; browser workflows not checked.
- **Files:** `PROGRESS.md`, `docs/progress-archive/2026-11.md`; ignored node_modules and temporary runtime/cache only.
- **Preferences learned:** None
- **Correction sweep:** N/A
- **Rework:** Used Node 24 to satisfy the barcode dependency's engine requirement; retried network and port access with required permissions.
- **Follow-ups:** User local testing; temporary runtime may need restoring after cleanup. No application source changes or UI deviations.

### 2026-11-16: Allowed GitHub synchronization through shared hooks (Codex)
- **What:** Exempted pull synchronization from edit detection; fetch was already exempt.
- **Why:** The user requested pulls remain unblocked by project hooks.
- **How:** Removed pull from the shared mutation list, retaining compound-write detection and commit checks. 88 isolated assertions pass across four adapters; shell syntax and diff checks pass. Independent subagent review approved. No UI changes.
- **Files:** `scripts/ai-guard/guard.sh`, `README.md`, `PROGRESS.md`, `docs/progress-archive/2026-11.md`
- **Preferences learned:** Upstream pull/fetch alone requires no authored-edit log or read prerequisite (README §8.4).
- **Correction sweep:** Reviewed all four AI hook configurations and Git hooks; fixed the one shared classifier used by every adapter.
- **Rework:** Corrected the false edit reminder after an already-up-to-date pull.
- **Follow-ups:** Existing backend, publishing and visual follow-ups remain; hook work is complete.

## Archive Index
- `docs/progress-archive/2026-11.md`
