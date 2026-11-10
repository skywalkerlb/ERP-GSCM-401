# PROGRESS.md: ERP Project (GSCM 401)

> **Read this file, `README.md` and `design-system/DESIGN_SYSTEM.md` before any edit. Update this file after every edit.** Full rules: README.md §9.
> **Size rules:** no more than 10 entries in Recent Changes and no more than 300 lines in this file. Move older entries to `docs/progress-archive/YYYY-MM.md`.
> Status, In-flight, Next Steps, and Open Questions are **snapshots**. Rewrite them; don't append to them.

## Current Status
**As of 2026-11-09.** Phase: **Setup.** Project: **Glazed**, a donut shop ERP. Stack: React + Vite + TypeScript (chosen, not scaffolded). Design: the **Glazed design system** is installed in `design-system/` and is mandatory for all UI. No application code exists yet. Repo: https://github.com/skywalkerlb/ERP-GSCM-401 (`main`).

- **Works:** The doc protocol and its enforcement in Claude Code, Codex, Cursor and Copilot:
  - Edits are blocked until README, PROGRESS and DESIGN_SYSTEM have been read.
  - The agent is sent back if it finishes without updating PROGRESS.md, and gets a design checklist after UI changes.
  - The git pre-commit runs a design lint (`scripts/check-design.sh`) and requires a new PROGRESS entry. This applies to every tool.
  - No commits have been made yet.
- **Needs a one-time approval from the user:** project hooks in Codex and Claude Code (`/hooks`). Cursor and Copilot (preview) hooks haven't been confirmed firing inside those apps yet.
- **Not started:** All ERP functionality.

## In-flight Work
- _None._

## Next Steps
0. User: open the project once in Codex and Claude Code and approve the project hooks (`/hooks`).
1. Scaffold Vite + React + TS. Import `design-system/tokens.css` and `components/components.css` at the root, set `data-theme` on `<html>`, and record run/build/test commands in README §4.
2. Port the 12 Glazed components from `design-system/components/reference-components.js` to typed React in `src/components/`, with the props from `index.d.ts` and the same `gz-` classes. Fix the a11y gaps noted below while porting.
3. Build the app shell (SidebarNav with the donut mark, a 60px topbar, content area) and a light/dark theme toggle.
4. Build modules from the assignment requirements (Dashboard, Orders, Catering, Batches, Inventory, Staff, Finance).

**Known design-system gaps to handle while porting** (found during the 2026-11-09 review):
- Select never sets `aria-describedby`.
- DataTable clickable rows can't be reached by keyboard.
- Tabs have no arrow-key handling.
- `components.css` hard-codes some px sizes. That's acceptable inside `design-system/`, which the lint skips.
- There are no motion, breakpoint or z-index tokens. Ask the user before adding any.

## Open Questions for the User
- What does the GSCM 401 assignment require (features, deliverables, due dates)? Are any modules needed beyond the design system's set (e.g. Purchasing/Suppliers)?
- Data and backend: a local mock or JSON, a database (e.g. Supabase/SQLite), or another option? Hosting?
## Recent Changes
<!-- Newest first. At most 10 entries. Move older ones to docs/progress-archive/YYYY-MM.md. -->
<!-- Template (each field is required; use None or N/A when it doesn't apply):
### YYYY-MM-DD: <one-line summary> (<tool: Claude Code | Codex | Cursor | Copilot | Gemini | other>)
- **What:** <the change in plain language>
- **Why:** <the user's goal, request, or bug>
- **How:** <approach, key decisions, alternatives rejected>
- **Files:** `path/a`, `path/b`
- **Preferences learned:** <rule → README §8.x> | None
- **Correction sweep:** <patterns searched, N places fixed, leftovers → Next Steps> | N/A
- **Rework:** <what the user had redone and why> | None
- **Follow-ups:** <added to Next Steps> | None
-->

### 2026-11-09: Made the Glazed logo official and pushed the project to GitHub (Claude Code)
- **What:** The design system's "Glazed" wordmark with the donut ring is now the official logo instead of a placeholder. Made the first commit and pushed it to https://github.com/skywalkerlb/ERP-GSCM-401 (`main`).
- **Why:** The user said "that logo in the design system is great" and asked for the project to be pushed to that repo.
- **How:** Updated the brand-mark text in DESIGN_SYSTEM.md and added a logo preference to README §8.1. Commits use the user's GitHub noreply email, set in this repo only, so their real email stays private on the public repo. The commit went through the normal pre-commit checks; no `--no-verify`.
- **Files:** `design-system/DESIGN_SYSTEM.md`, `README.md` (§2, §8.1), `PROGRESS.md`
- **Preferences learned:** The official logo is the Glazed wordmark plus donut ring. Keep the user's real email out of public commits; use their GitHub noreply address (→ README §8.1, §8.4).
- **Correction sweep:** N/A
- **Rework:** None
- **Follow-ups:** None

### 2026-11-09: Installed the Glazed design system and made it mandatory (Claude Code)
- **What:** Added `design-system/` (tokens, 12 React reference components, docs, reference PNGs) as the source of truth for all UI. Every agent must now read `DESIGN_SYSTEM.md` before any edit. Added a design lint to the commit check and a design checklist to the end-of-task reminder. Recorded the project (Glazed donut shop ERP) and stack (React + Vite + TS).
- **Why:** The user wants every UI/UX change to follow this design system unless they explicitly say otherwise, and wants every agent to read it first and keep it in context.
- **How:**
  - The zip was copied unchanged. Two subagents reviewed the tokens and components and found no network calls, eval or hidden instructions.
  - The zip's own CLAUDE.md UI rules were merged into a new "Rules for AI agents" section in DESIGN_SYSTEM.md, instead of adding a second CLAUDE.md.
  - `guard.sh` now also requires reading DESIGN_SYSTEM.md, and sets a UI flag for the design checklist.
  - New `scripts/check-design.sh` checks added lines for raw hex/rgb, px above 2px and literal fonts. `ds-exception:` lines are skipped.
  - CLAUDE.md and GEMINI.md now also import DESIGN_SYSTEM.md.
  - Tested 10 guard cases and 6 lint/commit cases; all passed.
- **Files:** `design-system/**` (new; DESIGN_SYSTEM.md gained the agent-rules section), `scripts/check-design.sh` (new), `scripts/ai-guard/guard.sh`, `.githooks/pre-commit`, `README.md` (§1–§3, §5–§7, §8.1, §9.1, §9.3, §9.5), `CLAUDE.md`, `GEMINI.md`, `AGENTS.md`, `.cursor/rules/project-docs.mdc`, `.github/copilot-instructions.md`, `PROGRESS.md`
- **Preferences learned:** All UI follows Glazed unless the user explicitly says otherwise; read the design system before any change; design corrections go through tokens or shared components, and one-offs are logged as exceptions; the stack is React + Vite + TS (→ README §8.1, §3).
- **Correction sweep:** N/A
- **Rework:** None
- **Follow-ups:** Scaffold the app, port the components, build the app shell (Next Steps 1–3).

### 2026-11-09: Enforced read-first / update-after for every AI tool (Claude Code)
- **What:** Added hooks that block edits until README.md and PROGRESS.md have been read this session (and re-read after another agent changes them), and that send the agent back once if it finishes without updating PROGRESS.md. Also initialized git and added a pre-commit check that requires a new PROGRESS.md entry.
- **Why:** The user asked to "make sure" every AI reads PROGRESS.md before editing and updates it afterward. Instructions alone weren't guaranteed.
- **How:** One shared script, `scripts/ai-guard/guard.sh <tool> <event>`, handles all tools. It parses each tool's hook input (Claude Code, Codex `apply_patch`/Bash, Cursor, Copilot) and keeps per-session flags in a gitignored `.ai-state/`. Codex and Copilot hook formats were checked against their docs. The script fails open if jq is missing. Replaced the earlier Claude-only `.claude/hooks/*` scripts. Tested 33 simulated hook calls and 5 commit scenarios; all passed.
- **Files:** `scripts/ai-guard/guard.sh`, `.claude/settings.json`, `.codex/hooks.json`, `.cursor/hooks.json`, `.github/hooks/ai-guard.json`, `.githooks/pre-commit`, `.gitignore`, `README.md` (§5, §8.4, §9.5), `CLAUDE.md`, `GEMINI.md`, `AGENTS.md`, `.cursor/rules/project-docs.mdc`, `.github/copilot-instructions.md`; removed `.claude/hooks/`
- **Preferences learned:** The rules must be enforced, not just suggested (→ README §8.4).
- **Correction sweep:** N/A
- **Rework:** None. (The user discarded a design-system zip they sent mid-task; it wasn't used.)
- **Follow-ups:** The user approves hooks in Codex and Claude Code; confirm the Cursor and Copilot hooks fire in the real apps.

### 2026-11-09: Created the AI handoff documentation system (Claude Code)
- **What:** Set up README.md, PROGRESS.md, AI pointer files for each tool, and a Claude Code reminder hook, so every AI reads the docs first, updates them afterward, and applies user preferences across the whole project.
- **Why:** The user edits this project with several AI tools and wants each new agent to know the project's state, how it works, and the user's preferences without having to re-explain them.
- **How:** README holds stable how-it-works content plus curated preferences (§8) and the protocol (§9). PROGRESS holds snapshots plus a 10-entry changelog with a size cap and an archive. The cap fixes the bloat seen in the user's gu-mobile-app project, whose append-only PROGRESS.md grew to 19k lines. CLAUDE.md and GEMINI.md use `@` imports, and AGENTS.md, the Cursor rule, and the Copilot file point to the README. The hook marks a flag when project files are edited and blocks the stop once if PROGRESS.md wasn't updated; it can't loop. Replaced the empty 0-byte file at `~/ERP Project (GSCM401)` with this folder.
- **Files:** `README.md`, `PROGRESS.md`, `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.cursor/rules/project-docs.mdc`, `.github/copilot-instructions.md`, `.claude/settings.json`, `.claude/hooks/docs-mark.sh`, `.claude/hooks/docs-check.sh`, `.gitignore`, `docs/progress-archive/.gitkeep`
- **Preferences learned:** Docs must always be kept current; corrections apply project-wide; the user works across several AI tools; plan first, ask questions, use subagents (→ README §8.3, §8.4).
- **Correction sweep:** N/A
- **Rework:** None
- **Follow-ups:** Get the project details (Next Steps 1–3).

## Archive Index
- _No archived entries yet._ Files are added here as `docs/progress-archive/YYYY-MM.md`.
