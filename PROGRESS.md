# PROGRESS.md: ERP Project (GSCM 401)

> **Read this file, README.md and design-system/DESIGN_SYSTEM.md before edits; update after edits.** README §9 has the full protocol. Keep at most 10 recent entries and 300 lines.

## Current Status
**As of 2026-11-16.** Publication remains blocked by authentication; verified merge is committed as a6c852b. Latest upstream main a9bb412 is merged with local sidebar overlap fixes and Barcode Labels wording. Documentation conflicts reconciled with both contributors' preferences/history preserved. Integrated production build/typecheck, full design lint and all 281 JavaScript verification tests pass. Git hooks remain configured as .githooks with upstream advisory policy; no bypass used. Chris Shipp's verified noreply identity retained.
- Signup/delegated account hierarchy comes from upstream: owner grants admin and below; admins grant manager and below; managers grant cashier/baker/customer across shops. Confirmation required for new customers. Backend rollout is still pending credentials; no database changes made here.
- Existing public Preview: https://erpprojectgscm401-3jdf3tsvt-briggsamasons-projects.vercel.app/login . Existing demo data preserved; replay limitations remain 48 skipped events and 19 quantity differences.
- Node v24.22.3 is temporarily available in /private/tmp/node-v24.22.3-darwin-arm64/bin; dependencies installed. Local server was started at localhost:5173. No local .env.local or Vercel CLI credentials/project link are present in this checkout.
- Approved design exceptions: Barcode Labels capitalization and sidebar Glazed! punctuation. Both-theme browser visual verification remains pending.

## In-flight Work
- Integrated merge committed as a6c852b; SSH push failed public-key authentication and HTTPS has no saved credentials. Nothing pushed.
- Vercel plugin is disabled by administrator. Browser GitHub sign-in returned account_not_found (GitHub account is not linked to a Vercel user). GitHub CLI authorization awaits explicit approval of its exact broad scopes after automatic approval review rejected them.
- Persistent backend and email rollout remain pending credentials and controlled inbox; no resets or database writes authorized as routine publication.

## Next Steps
1. Resolve exact GitHub CLI scope approval/sign-in, push verified commits, then verify automatic deployment or sign in to the owning Vercel account.
2. Restore persistent database access and Supabase login; inspect/apply migrations without resets when configured.
3. Configure hosted SMTP, exact Auth redirects and confirmed owner; verify email/signup/invitations with a controlled inbox.
4. Complete both-theme visuals; preserve current demo dataset and address replay reproducibility only on explicit request.

## Open Questions for the User
- Pending: explicitly approve GitHub CLI read/write access to public/private repositories and gists, workflow-file access and organization/team read access, or keep publication blocked. General GitHub/Vercel sign-in approval was received; exact-scope approval remains pending.
- Which email should own the persistent ERP and which controlled inbox can receive verification messages? Never send passwords in chat.
- Has the persistent database password been corrected locally and Supabase login restored?
- What is the project due date?

## Recent Changes
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

### 2026-11-16: Remove project hook barriers to Git synchronization (Codex)
- **What:** Made commit checks advisory, exempted pull from AI read gating and aligned every AI instruction file with unblocked synchronization.
- **Why:** The user explicitly requested that hooks never block GitHub pulls or pushes.
- **How:** Verified GitHub main contains `4a9b815`, main is unprotected, rulesets are empty and current credentials allow push. Disable Git hooks locally via core.hooksPath=/dev/null; optional tracked commit hook always succeeds. Shell syntax checks and no-doc-read pull/push guard probes passed. No UI or design values changed.
- **Files:** Git hook, shared AI guard, README.md, AI instruction pointers, design-system enforcement wording, PROGRESS.md and progress archive.
- **Preferences learned:** Git synchronization has no project hook prerequisites; checks are advisory (README §8.4 and §9.5).
- **Correction sweep:** Searched Git gating and setup guidance; updated shared guard, tracked hook, all five AI instruction pointers and design-system enforcement wording.
- **Rework:** Replaced mandatory blocking commit policy with the user's requested advisory policy.
- **Follow-ups:** GitHub still requires authentication and write permission for direct pushes; existing hosted rollout questions remain.

### 2026-11-16: Publish pending project changes to GitHub (Codex)
- **What:** Prepared all pending signup, delegated access, sidebar wording, verification and documentation changes for one GitHub commit and push.
- **Why:** The user requested pushing all changes to GitHub.
- **How:** Reviewed pending files, scanned 27 files for saved credentials with no findings, confirmed remote main matches local base and retained required commit hooks. Existing implementation checks and design review are recorded below; no new UI changes in this publication step.
- **Files:** All pending project changes, including README.md and PROGRESS.md.
- **Preferences learned:** None.
- **Correction sweep:** N/A.
- **Rework:** None.
- **Follow-ups:** Hosted application/backend rollout remains pending credentials and controlled inbox details.

### 2026-11-12: Implemented signup fixes and delegated access (Codex)
- **What:** Replaced owner-only People management with the approved protected hierarchy; hardened signup, confirmation and live access refresh with routing to an allowed home screen after demotion.
- **Why:** Users must create working customer accounts and admins/managers must manage lower-level access.
- **How:** Shared role rules, service-only atomic assignment and audit (including protected audit sequence), Glazed controls in both themes; 237 endpoint tests and 48 other local checks pass; exact migration, 41 database assertions/probes and full SQL signup/hierarchy/audit suite pass in a rollback-only demo transaction (5 data-dependent checks skipped). Design checklist: full design lint passes; Glazed component props, visible labels, shared focus styles, action labels, one primary action, status tones and sentence case reviewed. Existing theme tokens cover light/dark; browser visual checks remain blocked by CUA. No new exceptions; preserved approved sidebar-only "Glazed!" punctuation (`ds-exception`, README §8.1).
- **Files:** Authentication, People, access helpers, Supabase endpoint/migration, verification scripts (including People simulation/UI checks, realtime assertions and integrated rollback access suite), docs/ARCHITECTURE.md, README.md and PROGRESS.md.
- **Preferences learned:** Confirm customer emails; owner grants admin, admins grant manager and below, managers grant cashier/baker/customer; all shops; no self/peer/superior changes (README §8.1).
- **Correction sweep:** Replaced owner-only enforcement and wording across frontend routes/nav/People/auth, endpoint, contract, tests and current docs (including architecture/realtime publication rules); historical logs preserved.
- **Rework:** None.
- **Follow-ups:** Restore persistent DB password and Supabase login; configure SMTP/Auth redirects; deploy and verify hosted signup/email with a controlled inbox.

### 2026-11-11: Recorded local commit and blocked GitHub publication (Codex)
- **What:** Created local commit `3f20b4b` as Chris Shipp; nothing was pushed to GitHub.
- **Why:** The user requested publishing all changes and clarified the correct identity.
- **How:** Configured verified noreply identity and enabled normal project hooks; commit checks passed. SSH push failed host verification; HTTPS lacked credentials; GitHub blob calls were canceled, with no remote commit/ref update. Vercel auto-deploy remains unconfirmed.
- **Files:** `PROGRESS.md`, `docs/progress-archive/2026-11.md`; prior commit contains sidebar CSS and identity rule.
- **Preferences learned:** None beyond the Chris Shipp identity rule already in README §8.4.
- **Correction sweep:** Verified local commit author is Chris Shipp with the connected account's noreply email.
- **Rework:** Reconciled the planned push handoff with actual authentication failures and canceled connector calls.
- **Follow-ups:** Publish after authentication/access is available; verify Vercel deployment and sidebar visuals.


## Archive Index
- `docs/progress-archive/2026-11.md`
