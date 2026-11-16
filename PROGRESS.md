# PROGRESS.md: ERP Project (GSCM 401)

> **Read this file, `README.md` and `design-system/DESIGN_SYSTEM.md` before any edit. Update this file after every edit.** Full rules: README.md §9.
> **Size rules:** no more than 10 entries in Recent Changes and no more than 300 lines in this file. Move older entries to `docs/progress-archive/YYYY-MM.md`.
> Status, In-flight, Next Steps, and Open Questions are **snapshots**. Rewrite them; don't append to them.

## Current Status
**As of 2026-11-16.** Publication requested; local build/typecheck passed. GitHub has newer main commits through a9bb412; preserving local work before merging them. Barcode Labels capitalization updated in the page heading/browser title, breadcrumb, sidebar and item editor reference; approved sentence-case exception recorded in README. Local development server is running at http://localhost:5173/login; HTTP response verified as 200. Dependencies installed from the lockfile with npm ci. Node v24.22.3 is available temporarily at /private/tmp/node-v24.22.3-darwin-arm64/bin (not installed globally). Shared hooks allow pull/fetch synchronization; 88 focused hook assertions previously passed. Local main remains one commit ahead of origin/main at `3f20b4b`; hook/documentation changes remain uncommitted and GitHub publishing remains incomplete. Vercel integration is unconfirmed. Shared sidebar overlap fix is implemented; both-theme visual checks remain pending.

- Previously recorded build/typecheck/design lint, 38 entry/access/sign-out tests and 85 full database checks passed. These were not rerun for server setup.
- Public Preview: https://erpprojectgscm401-3jdf3tsvt-briggsamasons-projects.vercel.app/login . Separate demo backend: `wzsbtfzettxpczgulibd`; persistent backend unchanged. Six credential-free demo roles were previously verified.
- Existing demo dataset includes 5,381 sales, 57,352 sale lines, 1,308 production orders and 152 purchase orders. Accounting reconciled to $34,672.89. Replay had 48 skipped events and 19 quantity differences; reproducibility remains a follow-up.
- One approved wording exception: "Barcode Labels" capitalization. Browser click-through and both-theme visual verification remain pending.

## In-flight Work
- Publishing Barcode Labels and earlier sidebar changes, including reconciliation with newer upstream work.
- Vite development server running for user testing on localhost:5173. Temporary Node runtime may need restoring after system cleanup; dependencies are installed locally.
- Hook exemption implementation is complete and remains uncommitted with documentation changes.
- Local commit awaits publishing; previous SSH/HTTPS authentication attempts failed.
- Seed reproducibility and browser visual verification remain follow-ups.

## Next Steps
1. User reviews Barcode Labels capitalization at http://localhost:5173/inventory/labels; verify sidebar scrolling and long labels on desktop/mobile in both themes.
2. Merge current upstream, repeat required checks for the integrated code, push and confirm deployment.
3. Review seed retry handling before any explicitly requested clean demo replay; preserve the usable dataset.
4. Correct the persistent database password locally, apply migrations without resets, and configure owner and Auth redirects.

## Open Questions for the User
- No clarification is needed for authorized publication; backend ownership and due-date questions remain.
- Which confirmed signup email should own the persistent ERP account? Never send passwords in chat.
- Has the persistent database password been corrected locally?
- What is the final project due date? Chris Shipp is verified against the connected GitHub account; publishing still needs working Git authentication or approved connector access.

## Recent Changes
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

### 2026-11-11: Recorded local commit and blocked GitHub publication (Codex)
- **What:** Created local commit `3f20b4b` as Chris Shipp; nothing was pushed to GitHub.
- **Why:** The user requested publishing all changes and clarified the correct identity.
- **How:** Configured verified noreply identity and enabled normal project hooks; commit checks passed. SSH push failed host verification; HTTPS lacked credentials; GitHub blob calls were canceled, with no remote commit/ref update. Vercel auto-deploy remains unconfirmed.
- **Files:** `PROGRESS.md`, `docs/progress-archive/2026-11.md`; prior commit contains sidebar CSS and identity rule.
- **Preferences learned:** None beyond the Chris Shipp identity rule already in README §8.4.
- **Correction sweep:** Verified local commit author is Chris Shipp with the connected account's noreply email.
- **Rework:** Reconciled the planned push handoff with actual authentication failures and canceled connector calls.
- **Follow-ups:** Publish after authentication/access is available; verify Vercel deployment and sidebar visuals.

### 2026-11-11: Prepared GitHub push with corrected Chris Shipp attribution (Codex)
- **What:** Prepared sidebar fix and all local documentation changes for publication; corrected the current commit identity rule.
- **Why:** The user requested pushing everything and clarified "no i am Chris Shipp".
- **How:** Verified connected GitHub account ID/login and checked the interrupted config command made no changes. Use Chris Shipp with his GitHub noreply address and normal commit hooks. Design lint and diff checks pass; Node/npm and browser checks remain unavailable. Prior commit has no Vercel status checks; automatic deployment is unconfirmed.
- **Files:** `README.md`, `PROGRESS.md`, `docs/progress-archive/2026-11.md`, `src/styles/app.css`
- **Preferences learned:** Use Chris Shipp's verified identity, not another contributor's (README §8.4).
- **Correction sweep:** Searched README, PROGRESS, docs and Git config for Mason/Briggs/old noreply identity; corrected the one active identity rule. Historical records and actual Vercel URLs preserved; no Git config identity was set.
- **Rework:** Corrected the mistaken attribution inherited from project docs before creating a commit.
- **Follow-ups:** Commit/push and check deployment status; verify sidebar visually when browser access works.

### 2026-11-11: Prevented sidebar navigation text overlap (Codex)
- **What:** Prevented flex compression of navigation groups and brand; let long labels grow their rows and kept icons and badges from shrinking.
- **Why:** The user reported the sidebar overlapping text.
- **How:** Updated shared app navigation CSS using existing Glazed tokens; the staff sidebar keeps its vertical scroll, including the mobile drawer. No design-system source changes or design exceptions. Screenshot inaccessible; browser host unavailable; Node/npm absent, so build and visual checks could not run.
- **Files:** `src/styles/app.css`, `README.md`, `PROGRESS.md`, `docs/progress-archive/2026-11.md`
- **Preferences learned:** Sidebar text must stay readable with scrolling and wrapping (README §8.1).
- **Correction sweep:** Searched all sidebar, nav and shell styles and usages; fixed the shared nav rules in one place for all staff routes, roles and both desktop/drawer layouts. Portal uses separate horizontal navigation.
- **Rework:** Corrected fixed-height navigation rows and shrinkable groups inherited from the reference layout.
- **Follow-ups:** Build and both-theme browser verification when local tooling is available; confirm against the original screenshot.

### 2026-11-10: Pulled latest main from GitHub (Codex)
- **What:** Fast-forwarded local main from `6863d8a` to `23dc927` (one commit).
- **Why:** The user requested a pull from GitHub.
- **How:** Ran `git pull --ff-only`; confirmed main matches origin/main without conflicts. No application changes authored or tests rerun for this sync.
- **Files:** Upstream implementation and documentation; `PROGRESS.md`, `docs/progress-archive/2026-11.md` for the required handoff.
- **Preferences learned:** None
- **Correction sweep:** N/A
- **Rework:** None
- **Follow-ups:** Existing seed, browser verification and persistent backend follow-ups remain above.

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


## Archive Index
- `docs/progress-archive/2026-11.md`
