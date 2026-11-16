# PROGRESS.md: ERP Project (GSCM 401)

> **Read this file, `README.md` and `design-system/DESIGN_SYSTEM.md` before any edit. Update this file after every edit.** Full rules: README.md §9.
> **Size rules:** no more than 10 entries in Recent Changes and 300 lines. Status sections are snapshots.

## Current Status
**As of 2026-11-16.** Username/password-only signup is implemented, verified and pushed to GitHub main in commit `530db86`. Signup has two fields, signs customers in immediately when hosted confirmation is disabled, and requires no contact email. Both login screens accept usernames and existing email accounts. People displays usernames and offers protected lower-level username password resets. Existing role hierarchy and isolated demo behavior remain in place.
- Final verification: 326 JavaScript tests plus 4 TypeScript role/reset-guard tests pass; build/design lint/diff checks pass, and the final TypeScript check exited successfully after integration. Exact pending delegated-access and username migrations plus the complete signup/hierarchy/username/reset audit SQL suite pass against actual demo Postgres in one rolled-back transaction. No demo schema or data changes persisted.
- Hosted rollout is blocked: persistent database rejects saved password (`28P01`), Supabase CLI has no login token, and hosted public settings still report email confirmation required. No persistent Auth settings, schema, accounts or deployments changed. Earlier missing persistent API schema remains unresolved.
- Both-theme visual checks remain unavailable: CUA tab creation fails internally (`timeoutMs`). Components and theme tokens were reviewed against Glazed docs/reference images; no design exceptions were introduced.
- Demo seed reproducibility remains a separate known follow-up (48 skipped events, 19 quantity differences).

## In-flight Work
- GitHub publication is complete. Hosted configuration, migrations, endpoint/frontend deployment and end-to-end signup verification await working Supabase credentials. The temporary verification server has been stopped.

## Next Steps
1. Restore hosted access by correcting the persistent database password locally and running `supabase login`; inspect hosted migration history without resetting data.
2. Apply ordered migrations, disable hosted Confirm email, bootstrap the owner if needed, deploy People, then deploy the frontend together with matching backend changes. Preserve existing accounts and demo data.
3. Verify hosted username signup → immediate shop access → sign-out/login, existing email login/recovery and authorized username password reset; finish both-theme browser review once CUA works.
4. Configure SMTP only for legacy recovery/staff email invitations; address seed reproducibility only under a future explicit request.

## Open Questions for the User
- No input is needed for GitHub publication, which is complete. Hosted rollout needs a working local persistent database password and completed `supabase login`. Never paste credentials in chat.
- Which existing account should own the persistent ERP if it has not been bootstrapped? Username signup needs no inbox.
- What is the project due date?

## Recent Changes
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

### 2026-11-10: Added punctuation to the sidebar wordmark (Codex)
- **What:** Changed the staff sidebar title to "Glazed!".
- **Why:** The user explicitly requested an exclamation point after Glazed in the sidebar.
- **How:** Updated the shared staff shell brand prop, covering desktop and mobile navigation; marked the approved punctuation exception. Existing Glazed components, theme tokens and accessibility remain in use. No layout or style values changed. Typecheck and design lint pass; browser verification remains unavailable.
- **Files:** `src/app/AppShell.tsx`, `README.md`, `PROGRESS.md`, `docs/progress-archive/2026-11.md`
- **Preferences learned:** Sidebar wordmark uses "Glazed!"; explicit sidebar-only punctuation exception (README §8.1).
- **Correction sweep:** Searched sidebar brand instances; one shared shell instance updated for all staff roles and viewport sizes.
- **Rework:** None
- **Follow-ups:** None for the wording change; existing browser verification remains in Next Steps.


### 2026-11-10: Prepared ERP implementation for GitHub publication (Codex)
- **What:** Prepared the current ERP app, migrations, access controls, demo setup and documentation for the user-requested GitHub push.
- **Why:** The user requested publishing the working project to GitHub.
- **How:** Confirmed main matches the remote base, GitHub noreply identity and active hooks; checked 271 candidate files for saved credential values and confirmed local env/hosting/database linkage stays ignored. Build and full design lint pass. Commit hooks remain enabled.
- **Files:** Current ERP implementation, tests and documentation; `PROGRESS.md`, `docs/progress-archive/2026-11.md`
- **Preferences learned:** None
- **Correction sweep:** N/A
- **Rework:** None
- **Follow-ups:** Historical seed reproducibility and browser verification remain documented above.


### 2026-11-10: Published and verified public role demos (Codex)
- **What:** Finished isolated demo provisioning, automatic role entry and public Preview deployment; protected other visitors during demo sign-out.
- **Why:** Anyone must enter demos without registering or supplying credentials.
- **How:** Migrated separate Supabase project, verified six accounts, configured Vercel Preview, disabled hosting SSO wall, deployed demo-only People endpoint. Fixed setup paths with spaces and kit cost verification. 38 tests and 85 DB checks pass; build/typecheck/design lint pass. No design exceptions; browser visuals unavailable.
- **Files:** `src/lib/supabase.ts`, `src/hooks/useAuth.tsx`, `src/app/AuthPages.tsx`, `scripts/demo/setup.mjs`, `scripts/verify/`, `README.md`, `PROGRESS.md`; ignored local demo settings
- **Preferences learned:** Public role selection requires no visitor credentials; truthful unavailable states (README §8.1).
- **Correction sweep:** Both login pages share demo entry; all auth sign-out paths preserve shared-account sessions through tab-local exit.
- **Rework:** Seed connection failure left an orphan lock; closed only the confirmed stale demo connection. Replay completed with 48 skipped events, 19 simulator quantity differences and exit 2; dataset accounting checks pass.
- **Follow-ups:** Browser verification and seed recovery/reproducibility improvement; persistent backend setup remains separate.


### 2026-11-10: Completing credential-free public demo entry (Codex)
- **What:** Verified selected demo profile/role, direct landing screens, bounded demo requests, failure cleanup and retry; routed ordinary demo sign-out through tab-local exit to protect other visitors; removed misleading preparation wording.
- **Why:** Visitors must enter role demos without credentials; existing demo infrastructure was not configured.
- **How:** Kept automatic account sign-in in an isolated project/tab; 19 demo-entry tests, typecheck and design lint pass. Provisioned and migrated Glazed Demo using current CLI; six accounts verified, Preview Ready and public, demo mutation endpoint returns 403. Full history replay in progress; 75 database checks pass. Fixed URL-encoded path in setup script for folder names with spaces. No design exceptions; visual checks pending.
- **Files:** `src/lib/supabase.ts`, `src/app/AuthPages.tsx`, `scripts/verify/demo_entry.test.mjs`, `scripts/demo/setup.mjs`, ignored `.env.local`, `README.md`, `PROGRESS.md`
- **Preferences learned:** No visitor credentials or registration for demos; accurate setup states (README §8.1).
- **Correction sweep:** Shared selector covers both login pages; role verification prevents incorrect account landing.
- **Rework:** Previous demo selector existed without configured backend; provisioning now attempted.
- **Follow-ups:** Finish provisioning, seed, verify all roles and deploy frontend settings.


## Archive Index
- `docs/progress-archive/2026-11.md`
