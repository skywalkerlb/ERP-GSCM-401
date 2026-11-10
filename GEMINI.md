# AI instructions (Gemini)

Read all three files below in full before you edit anything. After every edit, update them as described in README.md §9. That means adding a PROGRESS.md changelog entry, refreshing the status sections, and recording any user preference in README §8. When the user corrects you, apply the correction across the whole project (README §9.3).

**Enforced:** git rejects commits that hard-code design values or that change project files without a new PROGRESS.md changelog entry (README §9.5). Gemini has no edit hooks here, so follow these rules yourself. Never bypass the check (for example with `--no-verify`).

**Design system:** before any change, also read `design-system/DESIGN_SYSTEM.md` (and, for UI work, each component README in `design-system/components/`). Every UI/UX change must follow the Glazed design system (tokens only, Glazed components, both themes) unless the user explicitly says otherwise for that change. Approved one-offs are marked `ds-exception:` and logged in README §8.1.

@README.md
@PROGRESS.md
@design-system/DESIGN_SYSTEM.md
