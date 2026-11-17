# PROGRESS.md: ERP Project (GSCM 401)

> **Read this file, `README.md` and `design-system/DESIGN_SYSTEM.md` before any edit. Update this file after every edit.** Full rules: README.md §9.
> **Size rules:** no more than 10 entries in Recent Changes and 300 lines. Status sections are snapshots.

## Current Status
**As of 2026-11-16.** The persistent ERP Supabase project (`eaphbcbklbcadokfcewc`) is migrated and configured for username signup without email verification. All 21 ordered migrations and their original versions are recorded. People is deployed with the production origin and `DEMO_MODE=false`. Auth Site URL is `https://erpprojectgscm401.vercel.app` with exact login/password-update/invitation redirects. Existing accounts and isolated demo data are preserved; no reset or seed replay ran.
- Hosted checks: all 35 non-data schema assertions pass (5 data-dependent checks skipped), and the full signup/hierarchy/username/reset audit SQL suite passes in a rolled-back transaction on the persistent backend. Real public signup returned an immediate session and customer profile; sign-out/password login, duplicate rejection and People customer denial passed. The temporary Auth account and customer were removed.
- Local main includes GitHub history through `c4264d6`, including Chris Shipp's sidebar/Barcode Labels changes and the earlier signup implementation (`530db86`). This publication adds the Supabase rollout handoff; no application changes are authored here. Prior 330 local tests, build, typecheck, design lint and diff checks pass. No product code changed during rollout.
- Supabase CLI login and management API access work outside the sandbox. Direct saved database password remains stale (`28P01`); migration rollout used the authenticated management API with transaction-per-migration and CLI-compatible history. Tokens and API keys stayed in memory.
- The persistent project has no owner assigned. Vercel production still points to the older Nov 10 frontend; publishing the new frontend remains separate. Both-theme visuals remain unverified; this session previously hit CUA tab-creation errors, while upstream reports browser sign-in working.
- Demo seed reproducibility remains a separate follow-up (48 skipped events, 19 quantity differences).

## In-flight Work
- Supabase rollout and hosted API verification are complete; no backend deployment is in flight. Awaiting the user's exact owner account choice before owner bootstrap; Vercel frontend deployment and browser review remain pending.

## Next Steps
1. Obtain the exact owner account choice, then bootstrap only that existing account; preserve its customer records.
2. Deploy the current frontend to Vercel production so the new two-field signup UI reaches visitors, then verify the browser flow in both themes.
3. Verify owner/admin/manager People flows against the deployed endpoint after owner setup; configure SMTP only for legacy recovery and staff invitations if needed.
4. Correct the saved database password locally for direct SQL tools when convenient; management API access already supports backend operations. Keep demo reset/replay separate.

## Open Questions for the User
- Owner setup still needs the exact existing username or email to grant access. Never share passwords in chat. No further credentials are needed for Supabase management API access.
- What is the project due date?

## Recent Changes
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

## Archive Index
- `docs/progress-archive/2026-11.md`
