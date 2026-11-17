# PROGRESS.md: ERP Project (GSCM 401)

> **Read this file, `README.md` and `design-system/DESIGN_SYSTEM.md` before any edit. Update this file after every edit.** Full rules: README.md §9.
> **Size rules:** no more than 10 entries in Recent Changes and 300 lines. Status sections are snapshots.

## Current Status
**As of 2026-11-16.** GitHub Pages replaces Vercel as the requested public frontend host at `https://skywalkerlb.github.io/ERP-GSCM-401/`. The push-to-main Actions workflow, five browser/demo build secrets, repository-prefixed assets/router/demo navigation/Auth callbacks and README site link are prepared. The old Vercel rewrite config is removed, and About identifies GitHub Pages.
- Workflow authorization is complete, and GitHub accepted the implementation and handoff commits through `d66fb08`. The first Pages Actions run (`43989635680`) passed installation, all tests, build and artifact upload; deployment failed only because Pages is disabled. The site is not live yet, and briggsamason has no admin/maintain permission to enable it. A repository owner must choose Settings → Pages → Source: GitHub Actions once. README includes the intended site link.
- Checks: all 334 JavaScript tests, repository-path production build/typecheck, design lint, workflow YAML parsing and diff checks pass. Full design lint was rerun after the checklist reminder. Build assets retain the correct prefix; no saved credentials were found across the 19 files. Changed UI keeps the same Glazed components, theme tokens, labels, focus styles and primary-button count. Both-theme browser review remains unverified.
- Persistent Supabase is migrated (21 original migration versions), signup confirmation is disabled, and People is deployed. Supabase Site URL, exact repository-prefixed Auth callback allowlist and People APP_URL now target GitHub Pages; existing callback URLs remain allowed. The invitation path fix is deployed. Prior 35 schema assertions and rollback account security suite passed; public signup/login and permissions were verified with a removed temporary account.
- Direct saved DB password remains stale (`28P01`); Supabase management API/CLI login works outside the sandbox. No owner has been assigned. Existing accounts and separate demo data are preserved; no reset or seed replay ran.
- Latest upstream sidebar/Barcode Labels changes and contributor history remain integrated. Demo seed reproducibility remains a separate known follow-up (48 skipped events, 19 quantity differences).

## In-flight Work
- Implementation, source publication and the GitHub-hosted build are complete. Awaiting one-time repository-owner Pages enablement before retrying deployment. Browser settings inspection also timed out; it did not change repository settings.

## Next Steps
1. Repository owner selects GitHub Actions in Settings → Pages, then rerun the failed deployment job in run `43989635680` (or push main to start a new run).
2. Verify the public root, direct/reloaded routes, username signup/login, demo entry/exit and both themes. Custom 404 loads the SPA at nested routes; direct nested responses retain HTTP 404 while rendering normally.
3. Add the Pages URL to repository About after an administrator signs in (README link is already present).
4. Obtain the exact existing owner account before bootstrap; verify privileged People/invitation flows afterward. Configure SMTP only for legacy recovery/staff invitations if needed.

## Open Questions for the User
- The remaining publishing input is a repository owner/admin enabling Pages with Source: GitHub Actions. OAuth workflow authorization and GitHub build verification are complete; collaborator credentials cannot change the Pages setting.
- Which existing username or email should receive ERP owner access? Never share passwords in chat.
- What is the project due date?

## Recent Changes
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

## Archive Index
- `docs/progress-archive/2026-11.md`
