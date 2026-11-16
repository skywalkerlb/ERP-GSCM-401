# PROGRESS.md: ERP Project (GSCM 401)

> **Read this file, `README.md` and `design-system/DESIGN_SYSTEM.md` before any edit. Update this file after every edit.** Full rules: README.md §9.
> **Size rules:** no more than 10 entries in Recent Changes and 300 lines. Status sections are snapshots.

## Current Status
**As of 2026-11-16.** GitHub main contains published implementation commit `4a9b815`, verified through GitHub API and git ls-remote. The repository is public, main is unprotected, rulesets are empty and the authenticated account has push permission. Git checks are advisory; pull is exempt from AI read gating. Signup and delegated access implementation is complete locally; live rollout is blocked by credentials. Approved hierarchy: owner grants admin and below; admins grant manager and below; managers grant cashier/baker/customer, across all shops. Confirmation is required for new customers. Existing public demo remains isolated and its data is preserved.
- Current checks: build/typecheck/design lint pass; 285 local auth/endpoint/demo/navigation/People UI/form tests pass. Exact migration, 35 non-data assertions, 6 browser sequence-permission probes and the complete signup/hierarchy/audit SQL suite pass against actual demo Postgres in one rolled-back transaction (5 data-dependent checks skipped). No demo data/schema changes persisted.
- Persistent database rejects saved password (28P01); Supabase CLI has no login. Public hosted settings confirm signup enabled and confirmation required, but profiles/locations return PGRST205 (missing from API schema). Persistent signup/email remains unverified. CUA browser automation fails internally (`timeoutMs`), so both-theme visual checks remain unavailable.
- Preserve existing local sidebar punctuation change and documentation history. Demo seed reproducibility remains a known follow-up (48 skipped events, 19 quantity differences).

## In-flight Work
- Publishing the requested hook policy changes; hosted application/backend rollout remains pending.
- Waiting for corrected local DB password, Supabase login and controlled inbox/owner email before live configuration and verification. No persistent changes have been made.

## Next Steps
1. Restore persistent DB access and Supabase CLI login; then inspect migrations and apply without resets.
2. Inspect/configure hosted SMTP and exact Auth redirects, bootstrap the confirmed owner and deploy backend then frontend.
3. Verify hosted signup, confirmation, recovery and invitations using a controlled inbox; complete both-theme browser checks once CUA works.
4. Preserve existing demo data; address seed reproducibility only under a future explicit request.

## Open Questions for the User
- No input is needed for Git synchronization; contributors need their own authenticated account with write access. Existing rollout questions follow.
- Which email should own the persistent ERP and which controlled inbox can receive verification messages? Never send passwords in chat.
- Correct the persistent database password locally and run `supabase login`, then confirm readiness. Never paste credentials in chat.
- What is the project due date?

## Recent Changes
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


### 2026-11-10: Integrated and verified account access implementation (Codex)
- **What:** Completed local login choices, recovery/invitation routes, People access, owner/admin permissions and demo isolation/reset setup.
- **Why:** Implement the approved plan while preserving the persistent backend.
- **How:** Separate demo project/storage; guarded reset tools; owner-only service endpoint and database protection. Build/typecheck/design lint passed; 15 endpoint tests and 4 access/reset tests passed. Database check failed on password authentication; browser tools unavailable. No design exceptions.
- **Files:** `src/`, `supabase/`, `scripts/demo/`, `scripts/seed/run.ts`, `scripts/verify/`, `.env.example`, `README.md`, `PROGRESS.md`
- **Preferences learned:** Owner controls staff; customer signup; bottom demo selector uses isolated interactive data (README §8.1).
- **Correction sweep:** Updated shared role types, operation checks, route/nav access, both login pages and legacy quick-login setup guidance.
- **Rework:** None
- **Follow-ups:** Restore DB access, bootstrap owner, configure demo, deploy and complete connected verification.


### 2026-11-10: Added owner People screen and simulated access management (Codex)
- **What:** Added owner-only directory, staff invitation form, role/location editing and invitation resend controls.
- **Why:** The highest administrator must control who joins as admins, managers and other staff.
- **How:** Trusted people endpoint for real accounts; demo directory and mutations remain in tab-local storage without emails or permission changes. Shared Glazed components provide loading, error, retry, empty and status states. Typecheck and design lint passed; connected browser checks remain pending. No design exceptions.
- **Files:** `src/features/people/PeoplePage.tsx`, `PROGRESS.md`, `docs/progress-archive/2026-11.md`
- **Preferences learned:** Owner controls staff access; interactive demos must not alter real permissions (README updates coordinated with parent).
- **Correction sweep:** N/A; new People screen uses the shared owner role and trusted endpoint.
- **Rework:** None
- **Follow-ups:** Deploy endpoint, verify invitations and access edits in browser, and complete backend setup.


### 2026-11-10: Added login choices and account recovery (Codex)
- **What:** Added customer signup links, confirmation resend, password recovery/update screens and a demo role dropdown at the bottom of both login pages.
- **Why:** Users need clear account creation and role preview options, with useful sign-in errors.
- **How:** Extended roles with owner/admin, separated profile failures from missing profiles, handled thrown errors and loading completion, and reused Glazed components. No design exceptions.
- **Files:** `src/app/AuthPages.tsx`, `src/hooks/useAuth.tsx`, `PROGRESS.md`
- **Preferences learned:** Public signup creates customers; staff access comes from the owner; login includes a bottom demo selector (README §8.1).
- **Correction sweep:** Replaced legacy quick-login buttons on both staff and customer login screens; shared auth behavior applies throughout the app.
- **Rework:** None
- **Follow-ups:** Finish backend access setup, verify integrated build/browser behavior, configure Auth redirects and isolated demo credentials.


## Archive Index
- `docs/progress-archive/2026-11.md`
