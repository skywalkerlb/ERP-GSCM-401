# PROGRESS.md: ERP Project (GSCM 401)

> **Read this file, `README.md` and `design-system/DESIGN_SYSTEM.md` before any edit. Update this file after every edit.** Full rules: README.md §9.
> **Size rules:** no more than 10 entries in Recent Changes and no more than 300 lines in this file. Move older entries to `docs/progress-archive/YYYY-MM.md`.
> Status, In-flight, Next Steps, and Open Questions are **snapshots**. Rewrite them; don't append to them.

## Current Status
**As of 2026-11-10.** GitHub publication requested; build and design checks pass, and local credentials are excluded. Credential-free demo login is provisioned locally and hosted. Select a role and Enter demo; six role accounts verified after loading. Ready public Preview: https://erpprojectgscm401-3jdf3tsvt-briggsamasons-projects.vercel.app/login . Separate demo backend: `wzsbtfzettxpczgulibd`; persistent backend and project link unchanged.

- Build/typecheck/design lint, 38 entry/access/sign-out tests and 85 full database checks pass. Rollback-only owner access checks pass. Demo endpoint refuses real invitations (403). Public hosting has no Vercel login wall.
- Loaded 5,381 sales, 57,352 sale lines, 1,308 production orders, 152 purchase orders and future pickup orders; shops have fresh stock. Inventory/GL/item costs reconcile to $34,672.89 at verification.
- Sample-data limitation: interrupted connection caused 48 skipped historical events and 19 quantity differences from the simulator. Replay exited 2; it was not a clean deterministic replay. Accounts were provisioned independently and remain verified. No reset/replay process remains running.
- No design exceptions. Browser automation failed internally, so click-through and both-theme visual verification remain unverified.

## In-flight Work
- No application edits or demo setup process running; repository publication is being finalized.
- Seed recovery/reproducibility and browser visual verification remain follow-ups.

## Next Steps
1. Review seed retry transaction/state handling before a future explicitly requested clean demo replay; preserve current usable dataset meanwhile.
2. Complete browser click-through and both-theme visual checks when tooling works.
3. Persistent backend remains separate: correct its local password, apply migrations without resets, configure owner and Auth redirects.

## Open Questions for the User
- Which confirmed signup email should own the persistent ERP account? Never send passwords in chat.
- Has the persistent database password been corrected locally?
- What is the project due date?

## Recent Changes
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

### 2026-11-10: Implementing account access and isolated demos (Codex)
- **What:** Added owner/admin access plumbing, recovery routes, People route and separate demo session/client selection.
- **Why:** Users need self-service accounts, owner-controlled staff access and role demos.
- **How:** Centralized access lists and isolated demo credentials/storage; no persistent reset.
- **Files:** `src/app/`, `src/hooks/useRole.ts`, `src/types/domain.ts`, `src/lib/supabase.ts`, `.env.example`, `README.md`, `PROGRESS.md`
- **Preferences learned:** Public signup is customer-only; owner controls staff; demo selector at bottom of login (README §8.1).
- **Correction sweep:** Replaced quick-login setup guidance and manager-only role assumptions in shared frontend access helpers.
- **Rework:** None
- **Follow-ups:** Complete validation and hosted setup; current changes are in progress.

### 2026-11-10: Added owner access migrations and trusted bootstrap (Codex)
- **What:** Added owner/admin roles, manager permission inheritance, protected profile access, existing-account profile backfill, a trusted owner bootstrap script and the people Edge Function.
- **Why:** Public signup must stay customer-only while the highest administrator manages staff access.
- **How:** Separate enum migration, owner uniqueness index, protected profile writes, atomic service-only assignment/customer linkage and confirmed-owner bootstrap. All 15 executable endpoint tests pass; SQL tests await database access.
- **Files:** `supabase/migrations/2026111000000*.sql`, `supabase/bootstrap-owner.sql`, `supabase/functions/people/index.ts`, `supabase/CONTRACT.md`, `scripts/verify/access_security.sql`, `scripts/verify/people_endpoint.test.mjs`, `PROGRESS.md`
- **Preferences learned:** Owner alone manages staff access; public accounts are customers (parent updates README §8).
- **Correction sweep:** Searched all SQL manager authorization gates; extended policies/helpers without rewriting historical migrations.
- **Rework:** None
- **Follow-ups:** Verify migrations and people endpoint on a connected backend, configure APP_URL, bootstrap the verified owner.

### 2026-11-10: Finalized the deployment handoff snapshot (Codex)
- **What:** Recorded the confirmed Ready frontend Preview and the exact remaining backend authentication step.
- **Why:** Ensure the required handoff reflects the completed deployment work and the user action needed to continue.
- **How:** Reconciled Current Status, In-flight Work, Next Steps and Open Questions with the Vercel inspection and Supabase authentication failure.
- **Files:** `PROGRESS.md`
- **Preferences learned:** None; the persistent backend rule is already recorded in README §8.5.
- **Correction sweep:** N/A
- **Rework:** None
- **Follow-ups:** Receive the locally updated database password, inspect the database, apply migrations and verify the connected app.

### 2026-11-10: Linked hosting and deployed the ERP frontend (Codex)
- **What:** Linked the intended Supabase backend and existing Vercel project, configured public API settings, and submitted a Preview deployment.
- **Why:** The user requested deployment of the actual ERP backend and frontend.
- **How:** Used authenticated CLIs outside the sandbox; configured Vercel environment variables through MCP. Local build passed and Vercel inspection confirmed Ready. Supabase database inspection and migration dry run both failed on the saved database password; no migrations or resets ran.
- **Files:** `README.md`, `PROGRESS.md`, `.gitignore`; ignored `.env.local`, `.vercel/`, `supabase/.temp/`
- **Preferences learned:** ERP Project is the persistent backend, not a disposable demo database (README §8.5).
- **Correction sweep:** Searched README and current PROGRESS snapshots for demo/disposable target assumptions and stale authentication blockers; corrected current guidance. Historical changelog entries preserved.
- **Rework:** Corrected the prior assumption that the intended backend could be reset as demo data.
- **Follow-ups:** Correct the saved database password, apply migrations, verify backend and frontend workflows, and complete the release.

## Archive Index
- `docs/progress-archive/2026-11.md`
