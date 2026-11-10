# ERP Project (GSCM 401)

> ## ⚠️ Every AI must read this first, whatever the tool (Claude Code, Codex, Cursor, Copilot, Gemini, ChatGPT…)
> 1. **Before editing anything**, read this file **and** `PROGRESS.md` from start to finish.
> 2. **After every edit**, update `PROGRESS.md` every time, and update this file whenever how the project works or the user's preferences have changed.
> 3. **When the user corrects something**, apply the correction to the **whole project**, not just the spot they pointed at (see §9.3).
> 3a. **Before any change, also read `design-system/DESIGN_SYSTEM.md`.** All UI/UX follows the Glazed design system unless the user explicitly says otherwise.
> 4. The full protocol is in [§9 AI Working Protocol](#9-ai-working-protocol). It is the only complete copy of the rules. The other instruction files just point here.

---

## 1. What this file is

This file says **how the project works** and **how the user wants it built**. It is not a log: edit sections in place so they always describe the project as it is now. History goes in `PROGRESS.md`.

| File | Holds | Style |
|---|---|---|
| `README.md` (this file) | What the project is, how it works, conventions, **user preferences**, AI protocol | Edited in place; always current |
| `PROGRESS.md` | Current status, in-flight work, next steps, open questions, last 10 changes | Snapshot plus a short changelog; under 300 lines |
| `design-system/DESIGN_SYSTEM.md` (+ component READMEs) | The Glazed design system: rules every UI change must follow | Changes only when the user asks for a design-system change |
| `docs/progress-archive/YYYY-MM.md` | Older changelog entries moved out of PROGRESS.md | Append-only; search it only when you need history |
| `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.cursor/rules/`, `.github/copilot-instructions.md` | Short pointers that send each AI tool here | Never duplicate content in them |

## 2. Project overview

- **What:** **Glazed**, an ERP (Enterprise Resource Planning) system for a donut shop, built for the **GSCM 401** course. It's the software behind orders, catering, baking batches, inventory, staff and finance.
- **Design:** Every screen uses the **Glazed design system** in `design-system/` (see §7 and `design-system/DESIGN_SYSTEM.md`).
- **Repo:** https://github.com/skywalkerlb/ERP-GSCM-401 (public, branch `main`). After cloning, run `git config core.hooksPath .githooks` once to turn on the commit check.
- **Goal / deliverables:** _TBD. Waiting on the user._
- **Users of the system:** Donut shop staff (counter, bakers, shift leads, managers). Some screens are used on a tablet on the shop floor.
- **Due dates:** _TBD._

## 3. Tech stack

| Layer | Choice | Why |
|---|---|---|
| UI | **React + TypeScript** | The design system ships React reference components plus `index.d.ts` prop types to port as typed components. |
| Build/dev | **Vite** | Simple and fast, and needs no extra framework. Works with the design system's plain CSS (`tokens.css`, `components.css`). |
| Styling | Glazed `tokens.css` + `components.css` (CSS variables, `gz-` classes) | Defined by the design system. |
| Icons | Glazed `Icon` starter set, then `lucide-react` at `strokeWidth={1.75}` | Defined by the design system. |
| Data / backend / hosting | _TBD_ | Not decided yet. |

Chosen 2026-11-09. The app hasn't been scaffolded yet (see PROGRESS Next Steps).

## 4. Run / build / test

_TBD._ List the exact commands and required environment variables here. Never put secrets in this file.

## 5. Architecture & folder map

Update this map whenever you add, rename, or remove a top-level folder.

```
ERP Project (GSCM401)/
├── README.md                  how it works + user preferences + AI protocol
├── PROGRESS.md                status + recent changes
├── CLAUDE.md / AGENTS.md / GEMINI.md   AI tool pointers
├── design-system/              Glazed design system, the source of truth for all UI (§7)
│   ├── DESIGN_SYSTEM.md        rules + guidance (required reading before any change)
│   ├── tokens.json / tokens.css  design tokens (json is the source, css mirrors it)
│   ├── components/             12 reference components: README per component, components.css,
│   │                             reference-components.js (React reference), index.d.ts (props)
│   └── reference-light.png / reference-dark.png   intended look
├── scripts/ai-guard/guard.sh  shared enforcement script used by every tool's hooks (§9.5)
├── scripts/check-design.sh    design lint: blocks hard-coded colors/sizes/fonts (§9.5)
├── .claude/settings.json      Claude Code hooks  → guard.sh
├── .codex/hooks.json          Codex hooks        → guard.sh
├── .cursor/hooks.json         Cursor hooks       → guard.sh  (+ .cursor/rules/ pointer rule)
├── .github/hooks/ai-guard.json Copilot hooks     → guard.sh  (+ copilot-instructions.md pointer)
├── .githooks/pre-commit       git check: no commit without a new PROGRESS.md entry
├── .ai-state/                 (gitignored) per-session read/pending flags written by guard.sh
└── docs/progress-archive/     older changelog entries
```

## 6. ERP domain model

**Modules** (from the design system, and they share one layout): **Dashboard**, **Orders**, **Catering & delivery**, **Baking batches**, **Inventory**, **Staff**, **Finance** (Invoices, Reports), **Settings**.

Shop units and formats (from the design system's voice rules): quantities in dozens/trays ("14 dozen"), money as `$342.75`, dates as `Nov 9, 2026`, pickup times as `9:00 AM`, order numbers like `ORD-00481` in mono.

_Still TBD:_
- **Modules** beyond the ones listed above, if the assignment requires more (e.g. Purchasing/Suppliers).
- **Core entities** and how they relate (e.g. Product, Supplier, Customer, Purchase Order, Sales Order, Warehouse, Stock Movement).
- **Business rules and formulas** (e.g. reorder point, EOQ, safety stock, costing method), along with where each is implemented in code.

## 7. Conventions

**UI: the Glazed design system is mandatory** (unless the user explicitly says otherwise for a specific change; see §8.1).
- Load `design-system/tokens.css` and then `design-system/components/components.css` once at the app root. Set `data-theme="light"` or `"dark"` on `<html>`.
- Every color, space, radius, shadow, font and size is a `var(--token)`. No raw hex, rgb or px values (0–2px hairlines and focus rings are allowed). `scripts/check-design.sh` enforces this.
- Build UI from the 12 Glazed components: Button, TextField, Select, Checkbox, Badge, Alert, Card, StatCard, DataTable, Tabs, SidebarNav, Icon. They'll be ported to typed React in `src/components/` with the same props as `design-system/components/index.d.ts` and the same `gz-` class names. Read a component's README before using it.
- Page anatomy, app shell, status colors, voice and number formats follow `DESIGN_SYSTEM.md`.
- Don't edit `design-system/` unless the user asks for a design-system change. When they do, update `tokens.json` and `tokens.css` together.

**General:** put shared values in one place (tokens, components, labels, formulas). Then a user preference can be changed once and apply everywhere.

_TBD after scaffolding:_ folder layout under `src/`, naming, and how to add a new module.

---

## 8. User Preferences & Design Rules

> **Curated, not append-only.** This is the most important section for serving the user well.
> - Bullet format: `- **Rule** (imperative). Scope: <where it applies>. Source: YYYY-MM-DD, "<user's words if useful>".`
> - When the user changes their mind, **rewrite the existing bullet** and add `(replaces: …)`. Never leave two rules that contradict each other.
> - Merge duplicates. Keep the section at about 60 bullets or fewer.
> - Before building anything, re-read the rules whose scope covers it.

### 8.1 Visual design / UI
- **Every UI/UX change uses the Glazed design system** (`design-system/`). Follow it unless the user explicitly says otherwise for that specific change. Scope: all screens, components, styles, charts, emails. Source: 2026-11-09, "all edits should follow the design system unless specifically specified otherwise".
- **Read `design-system/DESIGN_SYSTEM.md` before making any change, and keep it in mind** so design updates stay consistent. Scope: every agent, every session. Source: 2026-11-09.
- **Tokens only, Glazed components only, both themes, one candy-pink primary button per view (chocolate text), fixed status colors (mint/lilac/butter/cherry/cocoa/neutral), sentence case, no emoji or exclamation marks.** The full list is in DESIGN_SYSTEM.md > Rules for AI agents. Scope: all UI. Source: 2026-11-09 (design system).
- **Design changes go through the system.** When the user changes a look, update the token or shared component so it applies everywhere. A one-off happens only when the user explicitly asks for one. Scope: all design corrections. Source: 2026-11-09.
- **The official logo is the design system's "Glazed" wordmark (Fredoka 600) with the pink donut ring mark.** Use it everywhere the brand appears (sidebar, login, favicon, exports), and don't replace or restyle it without asking. Scope: all branding. Source: 2026-11-09, "that logo in the design system is great".

**Design exceptions** (approved one-offs that break the design system; each is also marked `ds-exception:` in code):
| Date | File / place | What | User's words |
|---|---|---|---|
| _none yet_ | | | |

### 8.2 Wording & content
- _None recorded yet._

### 8.3 Code & architecture
- **Keep shared values centralized** (tokens, constants, components) so a single change applies project-wide. Scope: all code. Source: 2026-11-09, the user wants changes "implemented across the whole project".

### 8.4 Workflow / process
- **Every AI reads README.md and PROGRESS.md before editing, and updates them after every edit.** Scope: every session, every tool. Source: 2026-11-09.
- **Treat a correction as a project-wide rule, not a one-off fix.** When the user asks to change something an AI just made, apply it everywhere it's relevant and record it here. Scope: all corrections (design, wording, code). Source: 2026-11-09.
- **The user works with several AI tools** (Claude Code, Codex, Cursor, Copilot, Gemini). Keep the docs tool-neutral. Scope: all docs. Source: 2026-11-09.
- **Plan first, ask clarifying questions, and use subagents for larger tasks** when the tool supports it. Scope: non-trivial work. Source: 2026-11-09, the user asked for plan mode, fan-out subagents, and questions.

- **The read-first / update-after rules must be enforced, not just suggested,** for every AI tool. Keep the hooks in §9.5 working, and never bypass them. Scope: all tools, all sessions. Source: 2026-11-09, "make sure that all will update the progress.md file and that they will all read the progress.md file before editing".

- **Commits to the public repo use the GitHub noreply email** (`208742214+briggsamason@users.noreply.github.com`, set in this repo's local git config), never the user's personal or work email. Scope: all commits. Source: 2026-11-09.

### 8.5 ERP / domain
- _None recorded yet._

---

## 9. AI Working Protocol

### 9.1 Before you edit
1. Read `README.md`, `PROGRESS.md` and `design-system/DESIGN_SYSTEM.md`, all of each. For UI work, also read `design-system/components/<Name>/README.md` for every component you'll use, and look at the reference PNGs.
2. Check **In-flight Work** and **Open Questions** in PROGRESS.md. If your task conflicts with in-flight work, ask the user.
3. Re-read the §8 preference rules that apply to what you're about to build.

### 9.2 After every edit (before you finish your turn)
1. **Add a changelog entry** at the top of *Recent Changes* in `PROGRESS.md`, using the template there. Every field is required; write "None" or "N/A" when one doesn't apply.
2. **Rewrite** PROGRESS.md's *Current Status*, *In-flight Work*, *Next Steps*, and *Open Questions* so they're accurate. These are snapshots, not logs.
3. **Update README.md** when anything here changed: stack, commands, folder map, domain model, conventions, or **preferences (§8)**.
4. **Size limits for PROGRESS.md:** at most 10 changelog entries and 300 lines. When a new entry would make 11, move the oldest entry, unchanged, to `docs/progress-archive/YYYY-MM.md` (using the month of that entry) and list the file in the Archive index. Keep each entry to about 15 lines.
5. If you created or removed a top-level folder or a doc file, update the §5 folder map.

### 9.3 When the user corrects you (design, wording, structure, behavior)
1. **Generalize.** Turn the specific request into a rule with a scope. For example, "make this button blue" becomes "Primary buttons use the brand blue token. Scope: all primary actions."
2. **Record.** Add the rule to §8, or rewrite an existing one. If it's unclear whether the correction applies everywhere or just once, **ask the user once**.
3. **Sweep.** Search the whole project for every other instance: the literal value, similar components, and repeated wording. Fix them all.
4. **Centralize.** Where possible, move the rule into a shared token, style, component, or helper so future code follows it automatically. **For design corrections**, the default is to change the Glazed token (`tokens.json` + `tokens.css`) or the shared component so the whole app changes. If the user explicitly wants it in just one place, mark that line `ds-exception: <reason>` and add a row to §8.1 Design exceptions.
5. **Log.** In the changelog entry, fill in **Preferences learned** and **Correction sweep** (what you searched for and how many places you fixed). Put anything you couldn't finish in Next Steps.
6. **Don't repeat it.** The next time you build something similar, the rule in §8 applies from the start.

### 9.4 General
- Don't put secrets (keys, passwords) in any doc.
- Write dates as `YYYY-MM-DD`.
- Say which AI tool you are in each changelog heading so the user can trace work across tools.

### 9.5 How the rules are enforced (don't remove or weaken these without the user's permission)
All hooks call one shared script, `scripts/ai-guard/guard.sh`, so the behavior is the same in every tool.

| Check | What happens |
|---|---|
| **Read before edit** | Any file edit, or any shell command that changes files, is **blocked** until this session has read README.md, PROGRESS.md **and design-system/DESIGN_SYSTEM.md**. If another agent changes any of them afterward, you're blocked again until you re-read it. |
| **Update after edit** | If project files changed and PROGRESS.md wasn't updated, the agent is **sent back once** when it tries to finish (it can't loop). |
| **Design checklist** | If UI files changed (`.css/.scss/.tsx/.jsx/.html`, `src/`, `design-system/`), the agent is also sent back once with the design-system checklist. |
| **Git commit check** | `.githooks/pre-commit` runs `scripts/check-design.sh`, which rejects hard-coded hex/rgb colors, px sizes above 2px and literal fonts in UI code outside `design-system/` (lines marked `ds-exception:` are skipped). It then rejects any commit that changes project files unless PROGRESS.md gains a new `### YYYY-MM-DD` changelog entry. This applies to every tool and every person. Run `sh scripts/check-design.sh --all` at any time to scan the whole project. |

| Tool | Hook file | Read-before-edit block | Update + design reminders | Commit check (design lint + PROGRESS) |
|---|---|---|---|---|
| Claude Code | `.claude/settings.json` | ✅ | ✅ | ✅ |
| Codex | `.codex/hooks.json` | ✅ | ✅ | ✅ |
| Cursor | `.cursor/hooks.json` | ✅ | ✅ | ✅ |
| Copilot (VS Code) | `.github/hooks/ai-guard.json` | ✅ (preview feature) | ✅ | ✅ |
| Gemini Code Assist | none (no hook support) | instructions only | instructions only | ✅ |

**Setup notes:**
- Codex and Claude Code ask you to **trust/approve project hooks** the first time; use `/hooks` in each to review and approve them.
- Hooks need `jq` (`/usr/bin/jq` on macOS). If it's missing they let everything through rather than blocking the project.
- On a fresh clone, run `git config core.hooksPath .githooks` once to turn the commit check on.
- `git commit --no-verify` skips the commit check. AIs must never use it.
